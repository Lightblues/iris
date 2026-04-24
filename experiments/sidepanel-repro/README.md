# SidePanel Repro

Minimal MV3 extension to isolate the Chrome side-panel blank-render bug that
plagues iris (see `.ea/spec/logs/2026-04-23.md`). No build step — edit files
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

## Next phases

Phase 2+ will flip one variable at a time (`async` → sync handler; add
`windows.update({ focused: true })`; swap `{ tabId }` → `{ windowId }`). Edit
`background.js` in-place; leave these phases as comments/annotations so the
diff is legible later.
