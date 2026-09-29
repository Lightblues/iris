# Iris

Browser-side **sensor and actuator**. It acts on the current browsing context and keeps what is worth saving inside the extension.

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
2. **Sensor** — keep highlights, notes, agent chats, and browsing traces in the extension.

**Product surface is the Agent.** Knowledge capture stays local. Page enhancements are entry points (FAB, command menu). Personal site patches are scripts: standard userscripts, plus WebMCP tools. See [scripts.md](scripts.md).

New work must answer at least one: *does this help act on the current browsing context, or capture something the user wants to keep?* If neither, it does not belong in Iris.

Honest capability today: the user is present and the side panel is open on a given tab. Opening Iris enables the panel for **that tab only** — other tabs and Cmd+T stay clean. Each enabled tab has its own live agent session, and that page is announced with a short card (url and title). The agent reads the page with `read_page` and acts on it with `eval`. Cmd+click from an Iris tab joins the same session. Switching to a tab without Iris hides the panel (the document may unload; in-flight streams die). Switching back restores the conversation from session storage. Closing the panel or the tab tears that session down. Iris is not a background autonomous browser agent. Site scripts keep running after the panel closes.

The one background actuator that *is* in scope: **browser relay**. External agents call `browser_*` tools and `iris_call` for Iris methods (chat export, notes, conversations, tracing, settings). The service worker executes them and returns. No LLM loop runs in the background. Spec: [browser-relay.md](browser-relay.md). Relay methods are not WebMCP. WebMCP tools live on the page and are specified in [scripts.md](scripts.md).

## Scope

| Layer | Status | Role | Spec |
|-------|--------|------|------|
| **Agent** | Core | Primary surface. Side-panel copilot with pluggable tools. | [agent.md](agent.md) |
| **Knowledge** | Maintain | Local capture and tracing. Notes, highlights, conversations, and events stay in the extension. | [knowledge.md](knowledge.md) |
| **Scripts** | Core | Standard userscripts and WebMCP AgentScripts. Agent-authored, persisted, imported and exported. | [scripts.md](scripts.md) |
| **Page enhancements** | Maintain | FAB and command menu. Entry points only. Do not expand unless they serve Agent or Knowledge. | [page-enhancements.md](page-enhancements.md) |
| **Browser relay** | Core-adjacent | WS client. Page/tab tools plus `iris.*` methods for external agents. | [browser-relay.md](browser-relay.md) |
| **Remote relay** | Optional | History sync and public tool calls through a server you run. Off by default. | [remote-relay.md](remote-relay.md) |

Maintain = keep working, fix bugs, add only when a real need appears. Do not grow new product pillars.

**Out of scope (do not position Iris as):** a sync client for a local directory or Notion, a Chrome UI replacement for bookmarks/reading list, a background browser-use agent (CDP / click-type loops), a userscript IDE, a full Tampermonkey `GM_*` clone, or a public AIO sidebar product. A later zip export can be added when asked. Cross-browser history sync is the optional remote relay.

## Architecture

Three processes:

```
Background (service worker)
  tool execution (chrome.tabs, chrome.scripting)
  userscript registration (chrome.userScripts) and GM_* requests
  browser relay WS client (ea-tools `browser_*` tools)
  tracing, context menus, alarms, chat export writes
  message router

Content scripts (<all_urls>)
  FAB, command menu
  GM_* bridge and GM_log buffer
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

Permissions: `storage`, `activeTab`, `readingList`, `contextMenus`, `clipboardWrite`, `sidePanel`, `tabs`, `tabGroups`, `windows`, `unlimitedStorage`, `alarms`, `scripting`, `userScripts` + `host_permissions: <all_urls>`. Unpacked builds also need Allow user scripts on the extension's card.

The agent runtime lives in the side panel, not the service worker. Lifecycle implications are in [agent.md](agent.md).

## Side panel

Toggle: toolbar icon or `Cmd+Shift+Y`. `openPanelOnActionClick: false`. Background disables the global panel (`setOptions({ enabled: false })`) and enables it per tab via `setOptions({ tabId, enabled })` + `open/close({ tabId })`. Unrelated tabs and Cmd+T do not show the panel. Cmd+click / Shift+click / middle-click / right-click “open in new tab” from an Iris tab joins that session and opens the panel on the child; closing the child unlinks that tab but leaves already-injected page messages in the thread. New Chat unlinks the current tab.

| Tab | Status | Notes |
|-----|--------|-------|
| Agent, History, Skills, Scripts | Core | Primary tab bar |
| Tabs, Bookmarks, Reading, Notes | Maintain | Secondary menu on the tab bar. Thin wrappers, not a product line |
| Settings | Shared | LLM, MCP, Browser relay, FAB blocklist, chat-export dir |

Chrome may leave a newly opened side panel blank until a second UI gesture (shortcut / FAB / inspect). This is a Chromium scheduling bug, not Iris logic. Repro: `experiments/sidepanel-repro/`. Workaround: trigger open a second time.

## Settings (agent-relevant)

| Section | Fields |
|---------|--------|
| LLM / Agent | API key, base URL, default model, favourites (from `/v1/models`), temperature, max output tokens, max steps |
| MCP | Endpoint (default `http://localhost:8765/mcp`). Connected when the agent calls `load_tools({ groups: ["mcp"] })`; failure leaves chat usable without those tools |
| Browser relay | Enabled, port (33007), token (`ea-browser-relay-local`). Must match ea-tools `browser_relay.*` |
| Remote relay | Off by default. URL, token, device name. See [remote-relay.md](remote-relay.md) |
| Per-chat model | Searchable combobox in the chat header; favourites pinned |

Other settings (FAB patterns, chat-export directory) are documented in the layer that owns them. Skills are in [agent.md](agent.md).

## Reading order

1. This file — what Iris is, and what not to build.
2. [agent.md](agent.md) — how the core surface actually runs.
3. [scripts.md](scripts.md) — userscripts, WebMCP, and why they do not own the FAB.
4. [knowledge.md](knowledge.md) / [page-enhancements.md](page-enhancements.md) / [browser-relay.md](browser-relay.md) / [remote-relay.md](remote-relay.md) — only when touching those layers.
