# SidePanel Repro

Minimal MV3 extension to isolate the Chrome side-panel blank-render bug that
plagues iris (see `.ea/docs/spec.md` Side panel). No build step — edit files
and hit "reload" on the unpacked extension.

## Goal

Confirm whether the bug reproduces outside of iris (i.e. is a Chrome bug, not
an iris bug), and isolate which change to the `sidePanel.open()` call site
fixes it.

## Load

1. Chrome → `chrome://extensions` → Developer mode on → **Load unpacked** → pick
   this folder.
2. Pin the extension so its toolbar icon is visible.
3. Keep `chrome://extensions` open in another tab — you'll need its `Inspect`
   link for the side panel to both rescue and read console logs.

## Three entry points

| Path | How to trigger | Flow |
| --- | --- | --- |
| **action** | Click the toolbar icon | `chrome.action.onClicked` → `sidePanel.open({ tabId })` |
| **command** | `Cmd+Shift+U` (macOS) / `Ctrl+Shift+U` | `chrome.commands.onCommand` → `sidePanel.open({ tabId })` |
| **fab** | Click the red `R` button bottom-right of any regular web page | content → `runtime.sendMessage` → SW → `sidePanel.open({ tabId })` |

All three currently run `async` handlers and use `sidePanel.open({ tabId })` —
this is the **baseline**, identical to iris' current code. Expected: action
and command paths reproduce the blank panel; FAB path renders immediately.

## Reading results

In the panel itself you see timestamps: `html parsed`, `first microtask`,
`first setTimeout(0)`, `first rAF`, `visibilitychange→visible`. **If `first
rAF` never appears, the renderer is loaded but Chrome never committed a
frame** — that's the bug.

The background service worker logs to `chrome://extensions` → *Inspect service
worker*. Each entry point prints `{ tabId, windowId }` so you can detect if a
multi-monitor setup is handing Chrome the "wrong" window.

## Test matrix (Phase 1)

Repeat each row ≥3 times with the side panel closed first:

| Monitor | Entry | Result (first rAF yes/no) | Rescued by Inspect? |
| --- | --- | --- | --- |
| primary foreground | action | | |
| primary foreground | command | | |
| primary foreground | fab | | |
| secondary foreground | action | | |
| secondary foreground | command | | |
| secondary foreground | fab | | |

Record the SW log's `tabId`/`windowId` for each row — if the window you're
opening from ≠ the foreground window, that's our smoking gun.

## Prewarm iframe experiment (current)

A hidden 1×1 iframe in the page content script points at
`sidepanel.html?prewarm=1`, which keeps the extension renderer process hot
and primes V8 code cache + HTTP cache. Hypothesis: the next
`chrome.sidePanel.open()` reuses this and renders instantly instead of
showing a blank panel.

**Toggle** (reload page after changing):

```js
// turn prewarm ON
localStorage.setItem('__repro_prewarm__', '1'); location.reload()
// turn prewarm OFF
localStorage.setItem('__repro_prewarm__', '0'); location.reload()
```

The FAB turns **green when prewarm is on**, red when off, so you can tell at
a glance.

### Measurement

For each condition, trigger by clicking the FAB (fastest, most reliable),
and record the wall-clock gap between:

- **bg log**: `D sidePanel.open resolved` at `+XXXms`
- **panel log**: `first rAF` with its `+Yms` offset from `script start`
- **bg log**: `panel reports visible` at `+Zms`

The key number is **`panel reports visible` minus `sidePanel.open resolved`**
on the bg-side clock — that's how long Chrome took from the API call to the
first committed frame. Everything in between happens while the user sees a
blank panel.

| condition | open→visible gap | notes |
| --- | --- | --- |
| prewarm OFF, cold SW, 1st open | | |
| prewarm OFF, warm SW, 2nd open | | |
| prewarm OFF, cold SW, 3rd open (reload page first) | | |
| prewarm ON, cold SW, 1st open (after iframe mount) | | |
| prewarm ON, warm SW, 2nd open | | |
| prewarm ON, 3rd open | | |

If prewarm ON is consistently <500ms while prewarm OFF is multi-second, the
hypothesis is confirmed and we port a prewarm iframe to iris.
