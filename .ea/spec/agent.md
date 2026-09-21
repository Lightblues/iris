# Agent

The **actuator**: a side-panel copilot that answers questions about, and acts on, the current browsing context.

All modes share one runtime: AI SDK `ToolLoopAgent` + `DirectChatTransport` + `useChat`. Modes differ only by system prompt and which tools are attached.

The agent process **is the side panel**. There is no background LLM loop.

## Runtime constraints

| Constraint | Implication |
|------------|-------------|
| Tab-specific side panel | Only tabs where the user opened Iris show the panel. Cmd+T / unrelated tabs stay clean |
| Switch to a tab without Iris | Panel hides; Chrome may unload the document and abort streams |
| Switch back to an Iris tab | Panel shows again; conversation restored from `chrome.storage.session` |
| Cmd+click from an Iris tab | Child tab joins the opener session and auto-injects its page |
| Close a linked child tab | That tab’s page/selection context is removed; the conversation continues |
| Close a browser tab | Dropped from its session; last tab tears the session down |
| New Chat | Unlinks this tab into an empty session; other linked tabs keep the old one |
| Close the side panel | That tab’s session unmounts |
| `useChat` in the panel only | No work continues after the panel closes |

To survive panel-close, streaming would have to move into the service worker with the panel as a subscriber. That is a major rewrite, not a patch. Until then, do not describe Iris as a background agent.

## Request path

```
ChatInput
  → slash expand / image attach / Paper arXiv prepend
  → useAgentChat.sendMessage()
  → useChat + DirectChatTransport
  → ToolLoopAgent (model + instructions + tools)
  → OpenRouter-compatible API (stream)
  → tool calls: browser tools via background, MCP tools via ea-tools
  → streamed parts → ChatMessage (markdown, tool cards, usage)
  → chrome.storage.local
```

General mode (the daily path) has **no tools**. Context is the auto-injected page, plus anything the user injects, attaches, or pulls in via slash commands.

## Modules (`src/agent/`)

| File | Role |
|------|------|
| `registry.ts` | Mode → system prompt + `browserTools` / `mcpEnabled` |
| `createAgent.ts` | Provider + merged tools + `ToolLoopAgent` |
| `transport.ts` | `DirectChatTransport`; writes token/cost metadata on finish |
| `useAgentChat.ts` | `useAgentTransport` (async init) + `useAgentChat` (send / inject) |
| `mcp.ts` | MCP connect / disconnect / schema sanitize |
| `history.ts` | Conversation CRUD in `chrome.storage.local` |

`SidePanelApp.tsx` hosts one live `AgentPanel` per Iris-enabled browser tab (`useAgentSessions.ts`). The panel document only stays visible on those tabs. `AgentPanel.tsx` is the two-phase UI (loading → ready). New Chat / mode change remount **that tab only**.

## Lifecycle

### Bind to the current tab

`useAgentSessions` keeps a live slot per session (one or more linked tabs):

- Open Iris on a tab: show that tab’s slot (hydrate conversation from `chrome.storage.session` if the panel remounted).
- Cmd+click / Shift+click / middle-click / right-click open-in-new-tab from an Iris tab: child joins the opener session, the panel opens on the child, and its page is injected after load (redirect hops like `link.zhihu.com` are skipped). Cmd+T does not join.
- Switching to a tab without Iris does not create a slot.
- Close a linked tab: drop it from the session and strip its context messages.
- New Chat: unlink this tab into an empty session.
- Close the side panel: unmount the in-memory agent. Reopen the same tab to hydrate the conversation.

### Create the agent

`AgentPanel` mounts → `useAgentTransport` → `createAgent()`:

1. OpenAI-compatible provider (`apiKey`, `baseUrl`, default OpenRouter).
2. Merge static `browserTools` with MCP tools when `mcpEnabled`.
3. `ToolLoopAgent` with instructions, `stopWhen: stepCountIs(maxSteps)`, temperature, max output tokens.
4. Wrap in `DirectChatTransport` (usage/cost on `finish`).
5. `AgentPanelReady` mounts `useChat(transport)`.

UI is two-phase. Sends during init are queued in `pendingRef` and flushed on ready.

The agent instance is built on mount. Mode change, New Chat, and History select remount the tree (`key={agentMode}-{sessionKey}`). Model is read at creation; Paper mode also `disconnectMcp` on leave.

### Send

`useAgentChat.sendMessage()`:

1. Require API key.
2. If input starts with `/`, expand the slash template (page/selection/url/title/`$ARGUMENTS`).
3. Paper + empty thread + current tab is arXiv → prepend `[Context: arXiv paper {id}]`.
4. Lazy `createConversation(mode)` on first real send.
5. Trace `chat_message`.
6. `chat.sendMessage({ text, files })`.

Page text is **auto-injected** when a new empty session mounts (http(s)/file pages, 100k char cap, same-URL de-duplicated). Manual inject page / selection still inserts a user message with `contextType` + `tabId` metadata (Readability via background → content script). `getPageContext(tabId)` always targets that session’s tab, not “whatever is active”.

## Modes

| Mode | Tools | MCP | What it is |
|------|-------|-----|------------|
| `general` | None | No | Daily Q&A over injected context / images |
| `tab-agent` | 7 tab tools | No | Query / group / close / archive / restore tabs |
| `automation` | 10 CSI tools | No | Drive a dedicated background tab |
| `paper` | MCP (arxiv, web, vesta) | Yes | Read papers, save into Vesta via ea-tools |

Add a mode: one `AGENT_REGISTRY` entry (`id`, `systemPrompt`, optional `browserTools` / `mcpEnabled`). Do not add modes unless the tools cannot live on an existing one.

### Tab tools

`lib/tabAgentTools.ts` (schemas) → `runtime.sendMessage({ type: 'tab_agent_action' })` → `lib/tabAgent.ts`.

| Tool | Description |
|------|-------------|
| `query_tabs` | Filter open tabs by keyword / domain |
| `create_tab_group` | Group tabs by name / color |
| `close_tabs` | Close; default `safe=true` → 7-day trash |
| `smart_organize` | Auto-group by domain (`preview` default) |
| `archive_inactive` | Archive idle tabs (`preview` default) |
| `list_closed_tabs` | List trash |
| `restore_tab` | Restore from trash |

### Automation tools

`lib/automationTools.ts` → `{ type: 'automation_action' }` → `lib/automationEngine.ts`. Operates on one lazy, reused, auto-recovered **background** tab (`active: false`), not the user’s current page.

| Tool | Description |
|------|-------------|
| `get_tab_info` | Current automation tab URL / title |
| `navigate` | Open URL, wait for load |
| `page_snapshot` | Compact DOM tree |
| `click` / `type_text` | Interact |
| `extract_data` | text / list / table / HTML |
| `wait_for` / `scroll` | Wait or scroll |
| `evaluate_js` | MAIN-world JS |
| `take_screenshot` | Visible viewport |

### Paper / MCP

```
createAgent() → connectMcp(endpoint)
  → @ai-sdk/mcp (HTTP, or SSE if URL ends with /sse)
  → default http://localhost:8765/mcp
  → tools() → strip anyOf / oneOf / additionalProperties / $schema / title / default
  → merge into ToolLoopAgent
```

Header MCP dot: green / yellow / red. If MCP fails, Paper degrades to tool-less chat. Expected local server: `ea-tools serve --transport http -k arxiv -k sn_proxy -k vesta`.

## Slash commands

Typed in chat input, not the page command menu. Spec of the menu: [page-enhancements.md](page-enhancements.md).

- `/` → filter → Tab/Enter → optional args → Cmd+Enter
- Built-in: `/summarize`, `/translate`, `/explain`, `/extract` (`commands/iris/`)
- Custom: Settings → Slash Commands → link a local folder
- Variables: `` !`pageContent` ``, `` !`selection` ``, `` !`url` ``, `` !`title` ``, `$ARGUMENTS`

Key files: `lib/slashCommands.ts`, `lib/commandStorage.ts`.

## Chat UI

- Streamed markdown (GFM + KaTeX)
- Images: attach or Cmd+V, 5MB
- Tool calls: collapsible arg/result cards
- Message actions: edit (truncate + resend), fork, rerun, copy markdown, save to Knowledge
- Usage: per-message tokens/cost; session total in header (OpenRouter metadata, else estimated)
- Enter = newline, Cmd+Enter = send (queues as the next message while the agent is running)
- Composer stays editable during a run; Stop cancels a queued follow-up
- Opening the side panel focuses the composer

## Persistence

- Store: `iris_agent_conversations` in `chrome.storage.local` (max 100 conversations, 100 messages each)
- Lazy create on first send; title from first user text
- Each conversation records `agentMode` for restore
- `AgentPanelReady` writes `messages` back on every change
- History tab: date groups, JSON import/export
