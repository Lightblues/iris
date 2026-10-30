# UI layout

The side panel as it is now. Layout changes are agreed as ASCII here (or in a `log/` proposal) before code; update this page in the same commit as the change.

## Side panel

```
┌──────────────────────────────────────────┐
│ Agent  History  Skills  Scripts  More ▾ ⚙│  TabSwitcher (src/sidepanel/components/TabSwitcher.tsx)
├──────────────────────────────────────────┤  More ▾ = Tabs, Bookmarks, Reading, Notes, Reports
│ [chat title]          [model ▾] [+ new]  │  per-chat model combobox, favourites pinned
│                                          │
│  page card: <title> <url>                │  announced when a tab joins the session
│  user / assistant messages, tool calls   │
│                                          │
├──────────────────────────────────────────┤
│ [img] [page] [selection]                 │  ChatInput: inject image, full page, selection
│ ┌──────────────────────────────┐ [send]  │
│ │ Ask about this page…         │         │
│ └──────────────────────────────┘         │
└──────────────────────────────────────────┘
```

Entry points into it: toolbar icon, `Cmd+Shift+Y`, the FAB on allowlisted sites, the command palette (`Cmd+Shift+P`).

## Settings

One scrolling page (`src/sidepanel/components/SettingsPage.tsx`, one component per block in `components/settings/`), laid out per [log/2026-10-29-settings-layout.md](../log/2026-10-29-settings-layout.md) (D005):

```
┌ Settings ────────────────────────────────┐
│ ● Connected to <host> as <device> (read) │  StatusStrip: server, sync time or error,
│   Synced 12:04            v0.6.2  [⟳]    │  extension version, reconnect (polls 5s)
├ Model ───────────────────────────────────┤
│   Base URL   [https://…]  [fetch]        │
│   API Key    [••••••••]                  │
│   Default model [model ▾]                │
│   Models     [filter / add] ☆ list       │
│   ▸ Advanced: temperature, max output    │  <details>, collapsed
│     tokens, max steps                    │
├ Tools ───────────────────────────────────┤
│   Web search (Exa)  API Key [ ]          │
├ This browser ───────────── not synced ───┤
│   [x] Connect to my Iris server          │
│   Server URL [ ]  Token [ ]              │
│   Device name [ ]   device <id>          │
│   Agents may ( ) Nothing, sync only      │
│              (•) Read pages              │
│              ( ) Control this browser    │
├ Pages ───────────────────────────────────┤
│   Floating button: hide on [patterns]    │
│   Chat export directory [choose] [⟳] [x] │
├ ▸ Developer ─────────────────────────────┤  <details>, collapsed
│   Phoenix endpoint                       │
│   Localhost relay (ea-tools)  not synced │  port, token, status, check
│   MCP endpoint                not synced │  unused for now
│   Import / export settings JSON          │
└──────────────────────────────────────────┘
```

Synced across browsers: everything except the fields marked "not synced" (This browser, the localhost relay, the MCP endpoint), which describe one machine (`DEVICE_SETTINGS` in `lib/sync.ts`, [server.md](server.md)).
