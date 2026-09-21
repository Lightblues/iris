# Iris

Browser-side **sensor and actuator** of the ea system. It acts on the current browsing context, and writes what is worth keeping into ea.

| Item | Detail |
|------|--------|
| Repo | `packages/iris` (easons_agent) |
| Form | Chrome extension, Manifest V3 |
| Stack | React + TypeScript + Tailwind v4 + Shadcn/ui |
| Build | Vite + `@crxjs/vite-plugin` |
| AI | AI SDK v6 (`ToolLoopAgent`, `DirectChatTransport`, `useChat`) + OpenRouter-compatible provider |

## Positioning

Iris is not a general-purpose “all-in-one browser assistant”. It has two jobs:

1. **Actuator** — ask and act on the current page, tab set, or paper.
2. **Sensor** — turn highlights, notes, agent chats, browsing traces, and exported third-party chats into ea inputs.

**Product surface is the Agent.** Knowledge capture is the strategic pipe into ea. Page enhancements are stable entry points and personal patches.

New work must answer at least one: *does this help act on the current browsing context, or give ea a higher-quality input?* If neither, it does not belong in Iris.

Honest capability today: the user is present, the side panel is open, the agent works on the current context. Closing the panel or switching tabs stops in-flight generation. Iris is not a background autonomous browser agent.

## Scope

| Layer | Status | Role | Spec |
|-------|--------|------|------|
| **Agent** | Core | Primary surface. Side-panel copilot with pluggable tools. | [agent.md](agent.md) |
| **Knowledge** | Maintain | Capture + tracing + Vesta / chat-export. ea input layer. | [knowledge.md](knowledge.md) |
| **Page enhancements** | Maintain | FAB, site jumps, command menu, patches. Do not expand unless they serve Agent or Knowledge. | [page-enhancements.md](page-enhancements.md) |

Maintain = keep working, fix bugs, add only when a real need appears. Do not grow new product pillars.

**Out of scope (do not position Iris as):** a second knowledge base (Vesta owns that), a Chrome UI replacement for bookmarks/reading list, a background browser-use agent, or a public AIO sidebar product.

## Architecture

Three processes:

```
Background (service worker)
  tool execution (chrome.tabs, chrome.scripting)
  tracing, context menus, alarms, file writes (Vesta / chat export)
  message router

Content scripts (<all_urls>)
  FAB, site enhancements, command menu
  highlight restore, page/selection extraction
  chat-export adapters (on supported origins)

Side Panel (React SPA, one instance per window)
  Agent (primary) + History / Notes / Tabs / Bookmarks / Reading List
  Settings
```

```
SidePanel ──sendMessage──▶ Background ──executeScript / sendMessage──▶ Content / Chrome APIs
         ◀──response──────           ◀──response──────────────────
```

Key messages: `tab_agent_action`, `automation_action`, `get-page-context`, `get-selection-context`, `execute-command`, `create-highlight`, `tracing-event`.

Permissions: `storage`, `activeTab`, `readingList`, `contextMenus`, `clipboardWrite`, `sidePanel`, `tabs`, `tabGroups`, `unlimitedStorage`, `alarms`, `scripting` + `host_permissions: <all_urls>`.

The agent runtime lives in the side panel, not the service worker. Lifecycle implications are in [agent.md](agent.md).

## Side panel

Toggle: toolbar icon or `Cmd+Shift+Y`. `openPanelOnActionClick: false`; background calls `chrome.sidePanel.open/close({ windowId })`.

| Tab | Status | Notes |
|-----|--------|-------|
| Agent | Core | `AgentPanel` |
| History | Core-adjacent | Conversation list, import/export |
| Notes | Maintain | Browse local knowledge entries |
| Tabs / Bookmarks / Reading List | Maintain | Thin Chrome wrappers; not a product line |
| Settings | Shared | LLM, MCP, Vesta, slash-command folder, FAB blocklist, chat-export dir |

Chrome may leave a newly opened side panel blank until a second UI gesture (shortcut / FAB / inspect). This is a Chromium scheduling bug, not Iris logic. Repro: `experiments/sidepanel-repro/`. Workaround: trigger open a second time.

## Settings (agent-relevant)

| Section | Fields |
|---------|--------|
| LLM / Agent | API key, base URL, default model, favourites (from `/v1/models`), temperature, max output tokens, max steps |
| MCP | Endpoint for Paper mode (default `http://localhost:8765/mcp`) |
| Per-chat model | Searchable combobox in the chat header; favourites pinned |

Other settings (Vesta, slash-command folder, FAB patterns, chat-export directory, Notion) are documented in the layer that owns them.

## Reading order

1. This file — what Iris is, and what not to build.
2. [agent.md](agent.md) — how the core surface actually runs.
3. [knowledge.md](knowledge.md) / [page-enhancements.md](page-enhancements.md) — only when touching those layers.
