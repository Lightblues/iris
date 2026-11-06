# 2026-11-06: Tabs across devices

Status: accepted (2026-11-06, D010), simplified: only the mirror is built.

The user opens pages on the work computer and wants to see and reopen them at home, and the other way round. The first proposal offered a live mirror of each browser's windows and groups, then explicit Send to device and Park, with intranet filters. The user chose the smallest test: the mirror only, in the side panel.

## What is built

- **Record kind `tabs`, id = device id**, one per browser, written only by that browser (`tabsCollection` in `lib/sync.ts`; server kind in `services/server/src/store.ts`). Body: `{ label, at, windows: [{ focused, tabs: [{ title, url, favIconUrl?, pinned?, group?: { title, color } }] }] }`. The server keeps the latest snapshot, as for every record. Not an export kind, so outside agents do not see it.
- **Snapshot** (`lib/tabMirror.ts`, `background/tabMirror.ts`): normal windows, http(s) tabs, at most 500. Rewritten 15 seconds after a structural change (tab opened, closed, moved, or given a new url, title, pin or group; group edited; window closed), not on tab activation, and only when something besides the time changed. The favicon is the tab's own `favIconUrl` when it is an http(s) URL, else the host's initial.
- **Privacy**: incognito windows are never uploaded, with no setting to change that. No intranet or never-share filter: the user reaches the intranet from home too (iOA).
- **Setting**: Settings → This browser → "Share open tabs with my other browsers", on by default, not synced. Off removes this browser's snapshot from the server. Any browser still sees what the others share.
- **View**: More ▾ → Tabs → Other devices (layout in `docs/ui.md`): by device (name, updated time), then window; a click opens the URL here in a new tab. A tab in a group shows the group's title as a label in its color.

## Why groups are not restored

All the user's browsers are signed into the same Google account, so Chrome already syncs saved tab groups between them. Extensions cannot read or write Chrome's saved groups (`chrome.tabGroups` has no saved-group API), so Iris only labels them.

## Chrome's own options

Tabs from other devices (`chrome://history/syncedTabs`, `chrome.sessions.getDevices()`), saved tab groups, and Send tab to self need the same Google account in both browsers. The user has that, so they work. Iris's mirror puts the same list in the side panel, grouped by window, and works for any browser connected to the Iris server, whatever account it uses.

## Not built

These stay open, each only when asked:

- Send a tab, group or window to a device (a `tabset` record with a target, an inbox with a badge, a page context-menu item).
- Park a set of tabs under a name until deleted.
- Reopening a whole window or group as a group here.
- Never-share patterns, private-host rules, and stripping credential-like query strings, for a browser whose intranet pages must not leave it.
- The shared tabs in `/app/devices` (phone), as an export kind, or through a read-level relay method for outside agents.
- A full-page view a keyboard command can open; favicons through the `favicon` permission; marking tabs already open here.
