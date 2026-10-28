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

One scrolling page (`src/sidepanel/components/SettingsPage.tsx`), sections in this order:

```
┌ Settings ────────────────────────────────┐
│ LLM / Agent                              │
│   API Key            [••••••••]          │
│   Base URL           [https://…] [fetch] │
│   Default Model      [model ▾]           │
│   Models             [search] ☆ list     │
│   Temperature        [0.7]               │
│   Max Output Tokens  [ ]                 │
│   Agent Max Steps    [ ]                 │
│   Phoenix Endpoint   [ ]   (tracing)     │
│ Web Search                               │
│   Exa API Key        [ ]                 │
│ MCP Server (Paper Agent)                 │
│   Endpoint URL       [ ]   (not wired)   │
│ Browser Relay  (localhost, ea-tools)     │
│   [x] Connect   Port [33007] Token [ ]   │
│   status                                 │
│ Remote Relay  (Iris server)              │
│   [x] Enable  URL [ ]  Token [ ]         │
│   Device name [ ]  Remote calls [read ▾] │
│   status, sync errors                    │
│ Chat Export                              │
│   directory  [link] [reconnect] [unlink] │
│ Content Script                           │
│   FAB Hidden Patterns (blocklist) [ ]    │
│ Import / Export                          │
│   [Export Settings] [Import Settings]    │
└──────────────────────────────────────────┘
```

Synced across browsers: everything except the Browser Relay and Remote Relay fields and the MCP endpoint, which describe one machine ([server.md](server.md)).
