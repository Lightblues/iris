# Iris — Browser AI Assistant

| Item | Detail |
|------|--------|
| Project | `packages/iris`, subpackage of `easons_agent` |
| Purpose | Browser-resident AI assistant: agent-powered Q&A, knowledge capture, browsing enhancement |
| Stack | React + TypeScript + Tailwind v4 + Shadcn/ui |
| Build | Vite + @crxjs/vite-plugin (Manifest V3) |
| AI | AI SDK v6 (ToolLoopAgent, DirectChatTransport, useChat) + OpenRouter |

## Core Pillars

| Pillar | Priority | Description | Spec |
|--------|----------|-------------|------|
| **Agent** | P0 | LLM agent with pluggable tool sets — browsing Q&A, tab management, automation, paper reading | [agent.md](agent.md) |
| **Knowledge** | Evolving | Capture highlights, notes, chat saves; passive browsing tracing; Vesta sync — the input layer for the ea system | [knowledge.md](knowledge.md) |
| **Page Enhancements** | Stable | FAB, site cross-links, command menu, context menu — traditional tools that enhance browsing | [page-enhancements.md](page-enhancements.md) |

## Architecture

```
Chrome Extension (Manifest V3)
├── Background (Service Worker)
│   ├── Agent tool execution (chrome.tabs, chrome.scripting)
│   ├── Browsing tracing (page visits, search queries)
│   ├── Context menus, alarms, Vesta sync
│   └── Message router
├── Content Scripts
│   ├── FAB + floating sidebar
│   ├── Page enhancements (arXiv, GitHub)
│   ├── Command menu (Cmd+Shift+P)
│   ├── Highlight injection & restore
│   └── Context extraction (page/selection)
├── SidePanel (React SPA)
    ├── Agent tab (AgentPanel — chat with AI agent)
    ├── Agent History tab
    ├── Tabs / Bookmarks / Reading List / Notes tabs
    └── Settings
```

### Message Passing

```
SidePanel ──sendMessage──▶ Background ──executeScript/sendMessage──▶ Content Script / Chrome APIs
         ◀──response──────           ◀──response──────────────────
```

Key message types: `agent_tool_action`, `execute-command`, `get-page-context`, `get-selection-context`, `create-highlight`, `tracing-event`

### Permissions

`storage`, `activeTab`, `readingList`, `contextMenus`, `clipboardWrite`, `sidePanel`, `tabs`, `tabGroups`, `unlimitedStorage`, `alarms`, `scripting` + `host_permissions: <all_urls>`

## SidePanel Tabs

| Tab | Component | Description |
|-----|-----------|-------------|
| Agent | `AgentPanel` | Primary chat interface — AI agent with tool calling |
| Agent History | `AgentHistoryTab` | Agent conversation list with import/export |
| Tabs | `TabsTab` | Open tabs viewer |
| Bookmarks | `BookmarksTab` | Category-filtered bookmark manager |
| Reading List | `ReadingListTab` | Chrome native reading list UI |
| Notes | `NotesTab` | Knowledge entries (highlights, notes, chat saves) |

## Settings

| Section | Key Fields |
|---------|------------|
| LLM / Agent | API Key, Base URL, Default Model, Favourite Models (fetched from /v1/models), Temperature, Max Output Tokens, Max Steps |
| MCP Server | Endpoint URL (for Paper Agent) |
| Vesta Sync | Link directory, sync trigger |
| Slash Commands | Link folder, command list |
| Content Script | FAB site patterns |
| Import / Export | Settings JSON |

Per-chat model override via searchable combobox in the chat header. Models fetched from provider's /v1/models API; users star favourites for quick access.

## References

- [agent.md](agent.md) — Agent architecture, tool registry, MCP
- [knowledge.md](knowledge.md) — Knowledge capture, tracing, Vesta sync
- [page-enhancements.md](page-enhancements.md) — FAB, site enhancements, command menu
