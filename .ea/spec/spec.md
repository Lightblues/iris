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

Honest capability today: the user is present and the side panel is open on a given tab. Opening Iris enables the panel for **that tab only** — other tabs and Cmd+T stay clean. Each enabled tab has its own live agent session, and that page’s content is injected automatically. Cmd+click from an Iris tab joins the same session. Switching to a tab without Iris hides the panel (the document may unload; in-flight streams die). Switching back restores the conversation from session storage. Closing the panel or the tab tears that session down. Iris is not a background autonomous browser agent.

The one background actuator that *is* in scope: **browser relay**. External ea-tools agents call `browser_fetch` / tab tools; the service worker executes them and returns. No LLM loop runs in the background. Spec: [browser-relay.md](browser-relay.md).

## Scope

| Layer | Status | Role | Spec |
|-------|--------|------|------|
| **Agent** | Core | Primary surface. Side-panel copilot with pluggable tools. | [agent.md](agent.md) |
| **Knowledge** | Maintain | Capture + tracing + Vesta / chat-export. ea input layer. | [knowledge.md](knowledge.md) |
| **Page enhancements** | Maintain | FAB, site jumps, command menu, patches. Do not expand unless they serve Agent or Knowledge. | [page-enhancements.md](page-enhancements.md) |
| **Browser relay** | Core-adjacent | WS client for ea-tools `browser_*` tools. Real-browser fetch for external agents. | [browser-relay.md](browser-relay.md) |

Maintain = keep working, fix bugs, add only when a real need appears. Do not grow new product pillars.

**Out of scope (do not position Iris as):** a second knowledge base (Vesta owns that), a Chrome UI replacement for bookmarks/reading list, a background browser-use agent (CDP / click-type loops), or a public AIO sidebar product.

## Architecture

Three processes:

```
Background (service worker)
  tool execution (chrome.tabs, chrome.scripting)
  browser relay WS client (ea-tools `browser_*` tools)
  tracing, context menus, alarms, file writes (Vesta / chat export)
  message router

Content scripts (<all_urls>)
  FAB, site enhancements, command menu
  highlight restore, page/selection extraction
  chat-export adapters (on supported origins)

Side Panel (React SPA, tab-specific)
  Agent (primary) + History / Notes / Tabs / Bookmarks / Reading List
  Settings
```

```
SidePanel ──sendMessage──▶ Background ──executeScript / sendMessage──▶ Content / Chrome APIs
         ◀──response──────           ◀──response──────────────────
```

Key messages: `tab_agent_action`, `automation_action`, `get-page-context`, `get-selection-context`, `execute-command`, `create-highlight`, `tracing-event`.

Permissions: `storage`, `activeTab`, `readingList`, `contextMenus`, `clipboardWrite`, `sidePanel`, `tabs`, `tabGroups`, `windows`, `unlimitedStorage`, `alarms`, `scripting` + `host_permissions: <all_urls>`.

The agent runtime lives in the side panel, not the service worker. Lifecycle implications are in [agent.md](agent.md).

## Side panel

Toggle: toolbar icon or `Cmd+Shift+Y`. `openPanelOnActionClick: false`. Background disables the global panel (`setOptions({ enabled: false })`) and enables it per tab via `setOptions({ tabId, enabled })` + `open/close({ tabId })`. Unrelated tabs and Cmd+T do not show the panel. Cmd+click / Shift+click / middle-click / right-click “open in new tab” from an Iris tab joins that session and opens the panel on the child; closing the child unlinks that tab but leaves already-injected page messages in the thread. New Chat unlinks the current tab.

| Tab | Status | Notes |
|-----|--------|-------|
| Agent | Core | `AgentPanel` |
| History | Core-adjacent | Conversation list, import/export |
| Notes | Maintain | Browse local knowledge entries |
| Tabs / Bookmarks / Reading List | Maintain | Thin Chrome wrappers; not a product line |
| Settings | Shared | LLM, MCP, Browser relay, Vesta, slash-command folder, FAB blocklist, chat-export dir |

Chrome may leave a newly opened side panel blank until a second UI gesture (shortcut / FAB / inspect). This is a Chromium scheduling bug, not Iris logic. Repro: `experiments/sidepanel-repro/`. Workaround: trigger open a second time.

## Settings (agent-relevant)

| Section | Fields |
|---------|--------|
| LLM / Agent | API key, base URL, default model, favourites (from `/v1/models`), temperature, max output tokens, max steps |
| MCP | Endpoint (default `http://localhost:8765/mcp`). Connected for every agent; failure leaves chat usable without those tools |
| Browser relay | Enabled, port (33007), token (`ea-browser-relay-local`). Must match ea-tools `browser_relay.*` |
| Per-chat model | Searchable combobox in the chat header; favourites pinned |

Other settings (Vesta, slash-command folder, FAB patterns, chat-export directory, Notion) are documented in the layer that owns them.

## Reading order

1. This file — what Iris is, and what not to build.
2. [agent.md](agent.md) — how the core surface actually runs.
3. [knowledge.md](knowledge.md) / [page-enhancements.md](page-enhancements.md) / [browser-relay.md](browser-relay.md) — only when touching those layers.
