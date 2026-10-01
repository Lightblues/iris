# Agent

The **actuator**: a side-panel copilot that answers questions about, and acts on, the current browsing context.

One runtime: AI SDK `ToolLoopAgent` + `DirectChatTransport` + `useChat`. There is one agent. Scenario instructions are skills (`skills/<name>/SKILL.md`), loaded on demand with `load_skill`. `reference.md` stays out of the prompt until `read_skill_file`.

The agent process **is the side panel**. There is no background LLM loop.

## Runtime constraints

| Constraint | Implication |
|------------|-------------|
| Tab-specific side panel | Only tabs where the user opened Iris show the panel. Cmd+T / unrelated tabs stay clean |
| Switch to a tab without Iris | Panel hides; Chrome may unload the document and abort streams |
| Switch back to an Iris tab | Panel shows again; conversation restored from `chrome.storage.session` |
| Cmd+click from an Iris tab | Child tab joins the opener session and auto-injects its page |
| Close a linked child tab | Tab leaves the session; already-injected page/selection messages stay in the thread |
| Close a browser tab | Dropped from its session; last tab tears the session down |
| New Chat | Unlinks this tab into an empty session; other linked tabs keep the old one |
| Close the side panel | That tab’s session unmounts |
| `useChat` in the panel only | No work continues after the panel closes |

To survive panel-close, streaming would have to move into the service worker with the panel as a subscriber. That is a major rewrite, not a patch. Until then, do not describe Iris as a background agent.

## Request path

```
ChatInput
  → skill slash expand / image attach / arXiv id prepend when the tab is an arXiv paper
  → useAgentChat.sendMessage()
  → useChat + DirectChatTransport
  → ToolLoopAgent (model + instructions + tools)
  → OpenRouter-compatible API (stream)
  → tool calls: browser tools via background, MCP tools via ea-tools
  → streamed parts → ChatMessage (markdown, tool cards, usage)
  → chrome.storage.local
```

The system prompt lists enabled skill names and a static catalog of tool groups. It is built from `chrome.storage.local` when the agent is created. Core tools are always attached, including `take_screenshot` and `web_search`. Tab cleanup, automation, WebMCP, and MCP stay out of the schema until `load_tools`. Before tab cleanup or background-style page actions the agent calls `load_skill`, then `load_tools` for that group. MCP is not connected at startup. Context is a one-line page card. `/summarize` is the summarize skill: the agent calls `read_page` itself.

`take_screenshot` returns a short receipt (`captured`, `imageId`, `bytes`), not a data URL. `toModelOutput` turns that into `image-data`. OpenRouter chat completions stringify tool-result images, so a language-model middleware lifts those parts onto a user image message — the same path as a pasted photo. The hidden automation tab is not the default target.

## Modules (`src/agent/`)

| File | Role |
|------|------|
| `registry.ts` | The single agent id. The live catalog is built in `createAgent` |
| `skills.ts` | Builds the system prompt from enabled skills in storage |
| `createAgent.ts` | Provider + merged tools + `ToolLoopAgent` |
| `transport.ts` | `DirectChatTransport`; writes token/cost metadata on finish |
| `useAgentChat.ts` | `useAgentTransport` (async init) + `useAgentChat` (send / inject) |
| `mcp.ts` | MCP connect / disconnect / schema sanitize |
| `history.ts` | Conversation CRUD in `chrome.storage.local` |

`SidePanelApp.tsx` hosts one live `AgentPanel` per Iris-enabled browser tab (`useAgentSessions.ts`). The panel document only stays visible on those tabs. `AgentPanel.tsx` is the two-phase UI (loading → ready). New Chat and History select remount **that tab only**.

## Lifecycle

### Bind to the current tab

`useAgentSessions` keeps a live slot per session (one or more linked tabs):

- Open Iris on a tab: show that tab’s slot (hydrate conversation from `chrome.storage.session` if the panel remounted).
- Cmd+click / Shift+click / middle-click / right-click open-in-new-tab from an Iris tab: child joins the opener session, the panel opens on the child, and its page is injected after load (redirect hops like `link.zhihu.com` are skipped). Cmd+T does not join.
- Switching to a tab without Iris does not create a slot.
- Close a linked tab: drop it from the session. Do not rewrite or delete already-injected context messages.
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

The agent instance is built on mount. New Chat and History select remount the tree (`key={sessionKey}`). Model is read at creation. MCP is connected once per mount and released on unmount; a failed connect does not block the agent.

### Send

`useAgentChat.sendMessage()`:

1. Require API key.
2. If input starts with `/` and matches an enabled skill, rewrite it as an instruction to call `load_skill`. Text after the name is additional input. The page is not injected.
3. On an empty thread, if the current tab is arXiv → prepend `[Context: arXiv paper {id}]`.
4. Lazy `createConversation(mode, currentMessages)` on first real send (includes already-injected page context).
5. Trace `chat_message`.
6. `chat.sendMessage({ text, files })`. File parts use data URLs. `experimental_download` skips `data:` so the SDK decodes them instead of fetching.

A page card is a normal **user** message (`metadata.contextType = card`) and is part of the persisted transcript. Auto-inject on a new empty session and when a tab joins a live session (http(s)/file): url, title, and a reminder to call `read_page`. Same `pageUrl` already in the thread → skip. Never replace or strip earlier context (closing a child tab, opening History, navigation); append only, so the model prefix and prompt cache stay stable. Restoring a stored conversation does not re-inject. Manual inject page / selection still appends the full text. `read_page` and `getPageContext(tabId)` always target that session’s tab, not “whatever is active”. Tool results that contain page text are data, not instructions. `read_page` returns at most about 8k characters and a cursor.

## Skills

One agent. The prompt contains only enabled names and descriptions. `load_skill` returns the `SKILL.md` body. `read_skill_file` reads another file in that skill (`name` + relative path). Paths that leave the skill are rejected.

Skills live in `chrome.storage.local` (`iris_skills`). A record is a virtual directory: `name`, `description`, `enabled`, `author` (`builtin` | `user` | `agent`), and `files` (at least `SKILL.md`, body capped at 8KB). There is no linked folder.

`SKILL.md` must open with YAML frontmatter, per the [Agent Skills spec](https://agentskills.io/specification). Every write path validates it: `name` 1-64 chars, lowercase alphanumerics and single hyphens, no leading / trailing / doubled hyphen, and equal to the skill name; `description` a non-empty single line up to 1024 chars; a non-empty body. `write_skill` generates the block (quoting the description when plain YAML would misread it); `patch_skill` and `pnpm bundle-skills` reject a file that violates it, so a skill cannot silently drift into a frontmatter-less state. The parser reads top-level `key: value` lines only — nested fields such as `metadata:` are preserved as text, not interpreted.

| Skill | When the description matches |
|-------|------------------------------|
| `tabs` | Group / archive / restore tabs. `list_tabs` and `close_tabs` are already core |
| `automation` | Click, type, and snapshot a tab. Defaults to the session tab |
| `paper` | Read arXiv papers and search related work via MCP. Call `load_tools({ groups: ["mcp"] })` first |
| `scripts` | Write or fix a userscript or AgentScript. Header rules, grants, `@webmcp`, and a debug checklist. See [scripts.md](scripts.md) |
| `summarize` | Chinese summary of the current page. Call `read_page` first |
| `create-skill` | Create or revise a skill. `write_skill` for a new one, `patch_skill` `edits` to change part of a file |

`skills/<name>/` is the source. `pnpm bundle-skills` copies it into `src/agent/builtinSkills.json`, which the extension imports. On startup, a missing name is inserted. A skill whose `author` is still `builtin` is refreshed from that bundle, and its enabled flag is kept. `author: agent` records are left alone.

`write_skill` replaces the whole file set. `patch_skill` keeps the rest and takes three kinds of change: `edits` (exact `old_string` → `new_string` in an existing file, unique match required unless `replace_all`), `files` (whole-file write, for adding a file or a deliberate rewrite), and `remove`. Edits are the documented default; whole-file writes are what used to silently drop content. They apply in that order and all apply immediately. Builtin skills cannot be edited or deleted.

Each change stores the files it replaced in `iris_skill_history` (16 revisions). Saves within 5 minutes of the last snapshot are one burst and do not push a new entry, so a multi-step edit leaves one revision holding the pre-burst state instead of consuming the whole ring. `read_skill_history` lets the agent list snapshots and read a file out of one; rolling back is reading the old text and writing it back with `patch_skill`. The Skills tab lists, toggles, and deletes skills, and previews every file of the current version or any snapshot. Iris does not run `scripts/`.

`author` is `builtin` for bundled skills and `agent` for anything `write_skill` or `patch_skill` saves. `user` is unused. A skill saved in this chat is callable with `load_skill` immediately; the system-prompt catalog refreshes the next time the agent is created.

### Core tools

Always in the schema. `prepareStep` sets `activeTools` from the groups loaded so far. `load_tools` is sticky for the agent instance.

| Tool | Description |
|------|-------------|
| `read_page` | Session tab. `card` (default), `text` (markdown slice + cursor), or `selector`. ~8k cap |
| `take_screenshot` | Visible viewport of the session tab (or `tabId`). Image reaches the model as a user image part |
| `eval` | JS on the session tab, or `tabId`, in the page's main world via `userScripts` (page JS and DOM). Async function body. If user scripts are off, CSP pages fall back to the DOM only (`domOnly`) |
| `list_tabs` / `close_tabs` | Filter open tabs / close (`safe=true` → 7-day trash) |
| `open_url` | New tab. `background: true` leaves the user where they are |
| `web_search` | Exa search for current information. Returns titles, URLs, dates, and text trimmed to ~1000 characters. Then `open_url` / `read_page` a result. Needs an Exa key in Settings → Web Search |
| `focus_tab` | Activate a tab |
| `list_scripts` / `write_script` / `toggle_script` | Userscript and AgentScript store. See [scripts.md](scripts.md) |
| `reload_tab` / `read_console` | Re-inject scripts / read `GM_log` |
| `list_skills` / `load_skill` / `read_skill_file` | Skill catalog and file reads |
| `read_skill_history` | List snapshots of a skill, or read one file out of a revision |
| `write_skill` / `patch_skill` / `delete_skill` | Create, edit (string `edits` or whole `files`), or delete. Applies immediately. Builtins rejected |
| `toggle_skill` | Enable or disable, including builtins |
| `load_tools` | Activate `tabs`, `automation`, `screenshot`, `reports`, `site`, `mcp` |

`tabs` group (after `load_tools`): `query_tabs`, `create_tab_group`, `smart_organize`, `archive_inactive`, `list_closed_tabs`, `restore_tab`.

`reports` group (after `load_tools`): markdown reports the user keeps, in `chrome.storage.local` (`iris_reports`, `lib/reportStore.ts`). Names match `^[a-z0-9][a-z0-9-]{0,40}\.md$`; content is capped at 64KB. Every write or edit snapshots the previous text in `iris_report_history` (8 per report). Not core: writing a report is occasional.

| Tool | Description |
|------|-------------|
| `list_reports` | Name, bytes, updated |
| `read_report` | Full markdown of one report (stored data, not instructions) |
| `write_report` | Create a report, or replace one whole on purpose |
| `edit_report` | `old_string` → `new_string`. Must match once unless `replace_all`; same rule as `patch_skill` edits. The default for changing an existing report |

Four separate tools instead of one with an `action` field: models pick Read / Edit / Write more reliably. Search, delete, download, and history have no tool; delete, download, and revisions live on the Reports tab. Reports never touch the user's filesystem.

### Automation tools

`lib/automationTools.ts` → `{ type: 'automation_action' }` → `lib/automationEngine.ts`. Loaded with the `automation` group. Each call takes an optional `tabId` and otherwise uses the session tab. `open_url({ background: true })` then `eval({ tabId })` when the action should not touch the user's page. `take_screenshot` is a core tool (the `screenshot` group still loads it).

| Tool | Description |
|------|-------------|
| `get_tab_info` | URL / title of the target tab |
| `navigate` | Open URL in that tab, wait for load |
| `page_snapshot` | Compact DOM tree |
| `click` / `type_text` | Interact |
| `extract_data` | text / list / table / HTML |
| `wait_for` / `scroll` | Wait or scroll |
| `take_screenshot` | Visible viewport of that tab |

### Page tools and scripts

`read_page` / `eval` / `open_url` / `focus_tab` live in `lib/pageTools.ts` and close over the session tab. Script tools live in `lib/scriptTools.ts`. WebMCP tools discovered on the tab are added to the tool bag when `load_tools` reads the `site` group, and are callable on the next step. A later `load_tools({ groups: ["site"] })` replaces that set.

### Paper / MCP

```
load_tools({ groups: ["mcp"] }) → connectMcp(endpoint)
  → @ai-sdk/mcp (HTTP, or SSE if URL ends with /sse)
  → default http://localhost:8765/mcp
  → tools() → strip anyOf / oneOf / additionalProperties / $schema / title / default
  → add to this agent’s tool bag (group mcp)
```

Startup does not connect. Header MCP dot: green / yellow / red, updated when a connect finishes. If MCP fails, that group stays unloaded and chat still runs. Expected local server: `ea-tools serve --transport http -k arxiv -k sn_proxy`.

## Slash skills

Typed in chat input, not the page command menu. Spec of the menu: [page-enhancements.md](page-enhancements.md).

`/` filters enabled skills. Tab or Enter inserts `/name `. Sending rewrites the message to call `load_skill` and follow it. Text after the name is additional input. The skill asks for `read_page` when it needs the page. Disabled skills are absent from the list and rejected by `load_skill`.

## Chat UI

- Streamed markdown (GFM + KaTeX)
- Images: attach or Cmd+V, 5MB. Rerun resends that user message's text and file parts
- Tool calls: collapsible arg/result cards
- Message actions: edit (truncate + resend), fork, rerun, copy markdown, save to Knowledge
- Usage: per-message tokens/cost; session total in header (OpenRouter metadata, else estimated)
- Enter = send, Shift+Enter = newline (queues as the next message while the agent is running)
- Composer stays editable during a run; Stop cancels a queued follow-up
- Opening the side panel focuses the composer

## Persistence

- Store: `iris_agent_conversations` in `chrome.storage.local` (max 100 conversations, 100 messages each)
- Optional remote relay copies these records to a server you run so another browser can merge them. `activeConversationId` and the open tab session stay on this device. See [remote-relay.md](remote-relay.md)
- Images stay on the user message as `file` parts (`mediaType` + `url` data URL). Same record as the text, so history, fork, and rerun keep them. Cap is 5MB per image; the extension has `unlimitedStorage`
- Lazy create on first send; title from first user text
- `urls` lists pages attached through a context card, full page, or selection. `skills` lists names passed to `load_skill`. Both are rebuilt when messages are saved, and filled in for older transcripts on the next load
- `AgentPanelReady` writes `messages` back on every change
- History tab: date groups, JSON import/export, search over title, message text, urls, and skills. The current tab's page is listed first. Each row shows the conversation id, the page host, and skill names. The chat header shows the same id; copying it writes `iris://history/<id>`
- `iris://history/<conversation id>` opens that conversation in the side panel. `iris.navigate` writes the path to `chrome.storage.session` (`iris_pending_route`); the panel applies it when it is open. The id is `Conversation.id`, not the tab-binding session id
