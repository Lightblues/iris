# Agent System

The agent is the core capability of Iris. All agent modes share a single architecture: AI SDK's `ToolLoopAgent` with pluggable tool sets, connected to the UI via `DirectChatTransport` and `useChat`.

## Architecture

```
User input
  → ChatInput (slash command expansion, image attach)
  → useAgentChat.sendMessage()
  → useChat (AI SDK React hook, bound to DirectChatTransport)
  → ToolLoopAgent (model + tools + instructions)
  → OpenRouter API (streaming)
  → Tool calls executed (browser tools locally, MCP tools via server)
  → Streamed response → ChatMessage rendering
```

Key modules in `src/agent/`:

| Module | Role |
|--------|------|
| `registry.ts` | Agent config registry — maps mode → systemPrompt + tools |
| `createAgent.ts` | Factory: builds ToolLoopAgent with provider, tools, telemetry |
| `transport.ts` | Creates DirectChatTransport with metadata callbacks (cost/usage) |
| `useAgentChat.ts` | React hooks: `useAgentTransport` (async init) + `useAgentChat` (chat state) |
| `mcp.ts` | MCP client lifecycle: connect, disconnect, tool schema sanitization |
| `history.ts` | Conversation CRUD in chrome.storage.local |

## Agent Registry

Each agent mode is a config entry with a system prompt and optional tool set:

| Mode | Tools | MCP | Description |
|------|-------|-----|-------------|
| `general` | None | No | Generic assistant |
| `tab-agent` | 7 tab management tools | No | Query, group, close, archive, restore tabs |
| `automation` | 10 CSI tools | No | Browser automation via background tab + chrome.scripting |
| `paper` | MCP tools (arxiv, web, vesta) | Yes | Paper reading & knowledge capture |

Adding a new agent: add an entry to `AGENT_REGISTRY` in `registry.ts` with `id`, `systemPrompt`, and optionally `browserTools` / `mcpEnabled`.

## Agent Creation Flow

`AgentPanel` mounts → `useAgentTransport` → `createAgent()` (async):

1. Create OpenAI-compatible provider (OpenRouter, configurable base URL)
2. Merge `browserTools` (from registry, static) + `mcpTools` (from MCP server, dynamic)
3. Instantiate `ToolLoopAgent` with model, tools, instructions, step limit
4. Wrap in `DirectChatTransport` with metadata callbacks for cost/token tracking
5. Return transport → `AgentPanelReady` mounts with `useChat`

The UI renders two phases: loading state (while agent initializes) and ready state (chat active). Messages sent during loading are queued and flushed on ready.

## MCP Integration (Paper Agent)

Paper agent connects to ea-tools MCP server via Streamable HTTP transport:

```
AgentPanel → createAgent() → connectMcp(endpoint) → @ai-sdk/mcp createMCPClient
  → HTTP POST to ea-tools server (default http://localhost:8765/mcp)
  → tools() → sanitize schemas (Gemini compatibility) → merge into agent
```

Tool schemas are sanitized to strip `anyOf/oneOf/additionalProperties/$schema/title/default` for broad model compatibility.

MCP status is shown in ChatHeader: green (connected), yellow (connecting), red (error). If MCP is unavailable, agent degrades to general chat.

arXiv auto-context: on first message in Paper mode, detects arXiv page URL and prepends `[Context: arXiv paper {id}]`.

## Chat Features

- **Streaming**: real-time markdown rendering (GFM + LaTeX via KaTeX)
- **Multimodal**: image upload (multi-select, 5MB) or Cmd+V paste
- **Context injection**: inject full page content (100k char limit) or selection text
- **Slash commands**: `/` trigger → filter → expand with context variables
- **Tool call display**: collapsible cards with args/result
- **Message actions**: edit (resend from that point), fork, copy as markdown, save to Knowledge
- **Token/cost tracking**: per-message `↗input ↘output ≈$cost`, session total in header
- **Input**: Enter = newline, Cmd+Enter = send

## Persistence

- Conversations stored in `chrome.storage.local` (separate store from legacy chat)
- Lazy creation: conversation written to storage on first message only
- Each conversation tracks `agentMode` for auto-restore on load
- History tab with date grouping, import/export JSON

## Tab Agent Tools

LLM-driven tab management via chrome.tabs/tabGroups APIs. Tools defined in `lib/tabAgentTools.ts`, implementations in `lib/tabAgent.ts`.

| Tool | Description |
|------|-------------|
| `query_tabs` | Search/filter open tabs by keyword, domain |
| `create_tab_group` | Group tabs with name/color |
| `close_tabs` | Close tabs (safe mode → 7-day trash) |
| `smart_organize` | Auto-group by domain (supports preview) |
| `archive_inactive` | Archive idle tabs (supports preview) |
| `list_closed_tabs` | List trash items |
| `restore_tab` | Restore from trash |

Safety: default `safe=true` for closes, `preview=true` for bulk ops.

## Automation Agent Tools

Browser automation via Content Script Injection on a dedicated background tab. Tools in `lib/automationTools.ts`, engine in `lib/automationEngine.ts`.

| Tool | Description |
|------|-------------|
| `navigate` | Open URL, wait for load |
| `page_snapshot` | Compact DOM tree snapshot |
| `click` / `type_text` | Interact with elements |
| `extract_data` | Extract as text/list/table/HTML |
| `wait_for` / `scroll` | Wait for element, scroll |
| `evaluate_js` | Execute JS in MAIN world |
| `take_screenshot` | Capture visible area |

Background tab lifecycle: lazy creation, singleton reuse, auto-recovery.
