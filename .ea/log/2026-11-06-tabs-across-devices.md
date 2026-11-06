# 2026-11-06: Tabs across devices

Status: proposed.

The user opens pages on the work computer and wants to see and reopen them at home, and the other way round. Iris already has what this needs underneath: every browser is a device on the Iris server, sync moves records between them, and the extension already reads windows, tabs, and groups (`list_tabs`, `create_tab_group`, permissions `tabs`, `tabGroups`, `windows`). This page proposes the model, the UI, the privacy defaults, and a first version. No code yet.

## Why not Chrome's own sync

Chrome offers three things, and all three need **the same Google account signed in with sync on** in both browsers:

| Chrome feature | What it does | Extension access |
|---|---|---|
| Tabs from other devices (History → Tabs from other devices, `chrome://history/syncedTabs`) | live list of each signed-in device's open tabs, reopen one | `chrome.sessions.getDevices()` returns the same list |
| Saved tab groups (Chrome 2024+) | a saved group appears in the bookmarks bar and on other devices | none: `chrome.tabGroups` has no saved-group API |
| Send tab to self | push one tab to another signed-in device | none |

Why that is not enough here:

- The work browser is probably signed into another account, or not at all. A company-managed Chrome may also block it (`SyncDisabled`, `RestrictSigninToPattern`; check `chrome://policy`).
- Signing the work browser into the personal account would sync all of it (history, passwords, bookmarks, every intranet tab), with no way to keep intranet pages out.
- Only one tab at a time is sent (Send tab to self), and tabs from other devices are a flat list: no windows, and no groups with their titles and colors.

The Iris server already connects both browsers under one user, whatever Google accounts they use. Iris can choose what leaves the browser.

## Fit with the positioning (D006)

D006 rated the Tabs view "fold, keep working, candidate drop" and asks of new work: does it make the page agent or the relay better? Honest answer: this is mainly a sync feature. The spec already lists cross-browser sync as the job of the optional Iris server. It also helps the relay: today an outside agent can only list tabs at `control` level. A tab snapshot record could later be read from a `read`-level browser without driving it (see Later). Taking this on means a decision that amends D006 for the Tabs view. The user must decide.

## 1. Model: both, mirror first

Two different needs:

- **"What did I have open at work?"**: a live mirror. Nothing to remember to do; reopen from home whatever is there.
- **"Take these with me" / "put these away for later"**: explicit sets. They outlive the browser closing those tabs.

Recommendation: both, as two record kinds, mirror first because it covers the main case with no new habit.

**Mirror: record kind `tabs`, id = device id, one record per browser.**

```
body: { device, label, at, windows: [
  { focused, tabs: [ { url, title, pinned, group? } ],      // tab order as in the window
    groups: [ { key, title, color, collapsed } ] } ],
  hidden: 7 }                                               // tabs held back by the privacy rules
```

- Written only by its own browser. Conflict rule: replace (no merge, one writer).
- Pushed on structural changes (tab opened, closed, moved, url or title changed, group created or edited), debounced 15 s. Not on tab activation, and not on `lastAccessed`, so switching tabs does not create revs or wake the other browsers.
- Server keeps only the latest snapshot (as for every record). Kept while the device exists. A snapshot older than 14 days shows as stale. Turning sharing off, or removing the device, pushes it as deleted.
- No favicons in v1: they are often intranet URLs themselves, and data URLs make records large. Use a colored letter.

**Tab sets: record kind `tabset`, id = random, for Send and Park (after v1).**

```
body: { title, color?, from, to?, createdAt, tabs: [ { url, title, pinned } ] }
```

- `to` set → **Send**: the target browser shows it in an inbox and opens it there (see Interaction). Deleted once opened, or after 7 days unopened.
- `to` empty → **Park**: a named set that stays until the user deletes it. Parking a group closes its tabs here.
- Send is a sync record, not a relay call. So it works on browsers whose level is `off` or `read`. No browser needs `control`, and no outside agent is involved.

## 2. Tab groups as the unit

Yes. Groups are how the user already says "these belong together".

- Another device's tabs are shown by **window, then group** (title and color as a dot, collapsed state kept), then ungrouped tabs, in the window's order. Pinned tabs first, marked.
- **Open group here** creates its tabs in the current window, then `chrome.tabs.group({ tabIds })` and `chrome.tabGroups.update(groupId, { title, color, collapsed })`. The group arrives as a group, with the same title and color.
- **Open window** → `chrome.windows.create({ url: [...] })`, then regroups the same way.
- **Open tab** opens one tab, outside any group.
- Send and Park work on a tab, a group, or a window. A sent or parked group keeps its title and color.
- A group is identified by its position (window index and group index), because Chrome's `groupId` changes after a restart. That is enough to display a snapshot; nothing refers to a remote group later.
- Chrome's own saved groups cannot be read or written by extensions, so Iris does not try to mirror them. An Iris group reopened here is a normal group; the user may save it in Chrome as usual.

## 3. Interaction

**Where.** The side panel's Tabs view (More ▾ → Tabs) becomes the main place: "This browser" plus one section per other device. Reopening in this browser needs the extension, so the side panel is the natural place. Next to it:

- Command palette (`Cmd+Shift+P`): "Tabs from other devices" opens the panel on that view. A Chrome keyboard command cannot open the side panel (spec.md); a palette entry or the toolbar icon can.
- Page context menu (later): "Send this tab to ▸ <device>". Extensions cannot add items to Chrome's tab-strip menu, so groups are sent from the panel.
- Web app `/app/devices` (later): each device row expands to its tabs, as plain links. Useful on the phone, where there is no extension. It only reads; no reopen-as-group.

Caveat: the side panel opens per tab (spec.md). Opening it to look at other devices also enables an Iris session on the current tab. That is acceptable for v1. If it gets in the way, a full-page view (`tabs.html` in a new tab, which a keyboard command can open) is the alternative. Question below.

**Browse and reopen (v1):**

```
┌──────────────────────────────────────────┐
│ Agent  History  Skills  Scripts  More ▾ ⚙│
├ Tabs ────────────────────────────────────┤
│ [This browser] [work-mac ●] [home-mbp ○] │  device chips; ● online, ○ offline
├──────────────────────────────────────────┤
│ work-mac · updated 2 min ago · 7 hidden  │  hidden = held back by its privacy rules
│ ▾ Window 1 (focused)            [open ⧉] │  open window = new window here
│   ● Paper review      5 tabs   [open ▸]  │  ● = group color; open group here
│      arXiv 2410.01234 · attention …      │
│      GitHub · PR #88 review              │  click a tab = open that tab here
│      …                                   │
│   ● Infra            3 tabs    [open ▸]  │
│   ─ ungrouped                            │
│      Hacker News                         │
│ ▸ Window 2  (12 tabs, 2 groups) [open ⧉] │  collapsed
├──────────────────────────────────────────┤
│ [x] Share this browser's tabs   rules ›  │  shortcut to This browser settings
└──────────────────────────────────────────┘
```

**Send (after v1), on the sending browser:**

```
 tab row / group row  [⋯]                       page right-click
 ┌─────────────────────────┐              ┌───────────────────────────┐
 │ Send to ▸  home-mbp     │              │ Iris ▸ Send tab to ▸      │
 │            phone (web)  │              │          home-mbp         │
 │ Park                    │              │          work-mac         │
 │ Close                   │              └───────────────────────────┘
 └─────────────────────────┘
```

**Receive and Parked (after v1), on the target browser:**

```
┌──────────────────────────────────────────┐
│ [This browser] [Inbox 1] [Parked 3] …    │  toolbar badge shows the inbox count
├──────────────────────────────────────────┤
│ ● Paper review  5 tabs  from work-mac    │
│   sent 18:02                  [open ▸] ✕ │  open = group here, then drop from inbox
├ Parked ──────────────────────────────────┤
│ ● Trip planning  8 tabs   Oct 30 [open] ✕│
└──────────────────────────────────────────┘
```

**Settings, This browser (not synced):**

```
├ This browser ───────────── not synced ───┤
│   …server, device name, agents may…      │
│   [ ] Share open tabs with my browsers   │  off by default
│       Never share [*.woa.com, …      ]   │  patterns; built-in rules always apply
│       ( ) Hide those tabs  (•) Count them│  "7 hidden" vs nothing
```

## 4. Privacy

The server stores records in plaintext (server.md), so the defaults have to be strict.

- **Off by default, per browser.** A browser shares its tabs only after "Share open tabs" is ticked on that machine. It is a device setting, not synced, so ticking it at home never turns it on at work. Any browser can still view what the others share.
- **Incognito is never shared.** Iris is not allowed in incognito by default. If the user allows it, windows with `incognito: true` are still skipped, with no setting to change that.
- **Built-in rules (always, any device):** skip `chrome://`, `chrome-extension://`, `about:`, `file://`, `data:`, `blob:`, `view-source:`, devtools; skip hosts without a dot (`http://wiki/`), `localhost`, IP addresses in private ranges, and `.local`, `.internal`, `.corp`, `.lan`; skip tabs opened by `browser.fetch` (already excluded from tracing).
- **Never share patterns (per device):** host or URL globs, e.g. `*.woa.com`, `*.oa.com`, `*.tencent.com` on the work machine. A skipped tab is left out entirely, title included: intranet titles leak as much as URLs.
- **Query strings:** v1 drops the query and fragment of any URL whose query has a credential-like parameter (`token`, `code`, `key`, `sig`, `session`, `auth`…), instead of sending it.
- **Not exported.** `tabs` and `tabset` are not export kinds, and not readable by the read key, until the user decides otherwise (Later).
- The company's rules on copying intranet titles to a personal server are the user's call. The defaults are meant so that a work browser with sharing on, and the work domains listed, sends only external pages.

## 5. First version and after

**v1: mirror, view, reopen (one issue):**

- Settings → This browser: "Share open tabs" (off), "Never share" patterns, hidden-count choice; added to `DEVICE_SETTINGS`.
- Background: build the snapshot from `chrome.windows.getAll({ populate: true })` + `chrome.tabGroups.query({})`, apply the rules, push record `tabs/<deviceId>` debounced 15 s on structural tab and group events; push deleted when sharing is turned off.
- Server: accept kind `tabs` with conflict rule replace; not exported.
- Side panel Tabs view: device chips, window → group → tab tree, open tab / open group here (as a group, same title and color) / open window.
- Palette entry "Tabs from other devices".
- Tests: rules (incognito, private hosts, patterns, query stripping), snapshot shape with groups, reopen calls `tabs.group` and `tabGroups.update`; e2e: a snapshot written by one profile appears in another (two Playwright profiles on one PGlite server).
- Docs: `server.md` record table, `ui.md` Tabs view, `spec.md` Tabs row, a decision amending D006 for the Tabs view.

**v2: send and park:** kind `tabset`; Send to device from the Tabs view and the page context menu; inbox with a toolbar badge; Park a tab, group, or window (closes them here); Parked list.

**Later, each only when asked:**

- `/app/devices` lists each device's shared tabs as links (phone).
- A `tabs` export kind or a read-level relay method, so an outside agent can ask "what is open at work?" without `control`.
- "Already open here" marks and focusing the existing tab instead of opening a duplicate.
- Favicons through the `favicon` permission (`chrome-extension://<id>/_favicon/`), rendered locally from the URL, never uploaded.
- Snapshot history ("what did I have open yesterday"), which would need more than the latest record.

## Questions for the user

1. Take this on at all, amending D006's "Tabs: fold, candidate drop"? And when: a patch after 0.7.0, or part of the 0.8 round?
2. v1 as the mirror only, or mirror plus Send in the first release?
3. A received send: open by itself on arrival, or wait in the inbox with a badge (proposed)?
4. Which work domains go into the work browser's Never share list, and should intranet tabs show as a "7 hidden" count or not at all?
5. Side panel view only, or also a full-page Iris tabs page that a keyboard command can open?
6. Should outside agents (sonar, read key) ever see the shared tabs?
