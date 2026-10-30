# Positioning review: agent-native (2026-10-30)

Status: accepted (D006, 2026-10-30)

Roadmap 0.7 item 2 (issue iris-024). One question for every item: does it serve the **side-panel agent on the current page**, or the **relay** that outside agents use? Verdicts:

- **keep**: serves one of the two; keep developing.
- **keep (D003)**: kept working behind "More", bug fixes only.
- **fold**: merge into another item; the behavior survives, the separate surface or tool goes.
- **drop**: delete in iris-025.

Read from the code at `main` on 2026-10-30. Nothing here changes code; the cleanup is iris-025, and the agent-experience items at the end become 0.7 item 4 issues.

## 1. User-facing surfaces

### Side-panel tabs (`TabSwitcher.tsx`)

| Tab | Where | Verdict | Reason |
|-----|-------|---------|--------|
| Agent | primary | keep | The product. |
| History | primary | keep | Reopens agent chats; target of `iris://history/<id>` and `iris.navigate`. |
| Skills | primary | keep | The agent's instructions; edited by the agent and by the user. |
| Scripts | primary | keep | Agent-written userscripts and WebMCP AgentScripts; the agent's lasting effect on pages. |
| Reports | More | keep | Agent output the user keeps. `spec.md` calls it Core while the tab sits in More; leave it there and fix the spec wording. |
| Tabs | More | fold | Not named in D003. A tab list the agent already reads with `list_tabs`; "clean up my tabs" belongs in the chat. Keep working, no development; candidate drop in a later round. |
| Bookmarks | More | keep (D003) | Thin Chrome wrapper. |
| Reading | More | keep (D003) | Thin Chrome wrapper. |
| Notes | More | keep (D003) | Capture surface (highlights, page snapshots, saved chats). |
| Settings | header | keep | D005 layout. |

### Other side-panel pieces

| Item | Verdict | Reason |
|------|---------|--------|
| MCP status in the chat header (`ChatHeader`, `useAgentChat` `mcpStatus`) | drop | `createAgent` hardcodes `mcpConnected = false`; MCP tools never reach the schema. D005 parks MCP under Developer, so the header shows a state that never changes. |
| `agent/registry.ts` `mcpEnabled: true` | drop | Same leftover; the flag is not read to connect anything. |
| `SettingsPanel.tsx` | drop | Unused (already named in roadmap item 3). |
| `src/popup/` | drop | Not in `manifest.json` and not a Vite input, so it is never built. |

### Page entry points

| Item | Verdict | Reason |
|------|---------|--------|
| Toolbar icon / `Cmd+Shift+Y` (`toggle-floating-sidebar`) | keep | Opens the agent for this tab. |
| FAB, "Chat" item | keep | Same entry point on allowlisted sites (D003). |
| FAB, hide button | keep | Needed for the blocklist. |
| FAB, chat-export actions (current / new-updated / force all) on ChatGPT, DeepSeek, Gemini | keep | Local capture of chats the user owns; the same adapters back `iris.chat.*`. |
| Command palette `Cmd+Shift+P` | keep | Entry point in use (D003). Its contents are below. |
| Palette: Add bookmark, Add to reading list | keep (D003) | Thin wrappers. |
| Palette: Open settings (`open_options`) | drop | Calls `chrome.runtime.openOptionsPage()`, but the manifest has no options page; settings live in the side panel. Replace with "open the side panel on Settings" only if someone misses it. |
| Palette: Copy page / selection as Markdown | keep | Moves the current page's content to other agents (paste into a chat). |
| Palette: Save page / selection to Notes | keep (D003) | Capture. Duplicates the context menu; fine. |
| Palette: no "Ask Iris" command | gap | The core surface is not reachable from the palette. See AX-8. |
| Context menu: Copy page / selection as Markdown | keep | As above. |
| Context menu: Save page / selection to Iris Notes | keep (D003) | Capture. |
| `Cmd+Shift+H` (`save-highlight`) | keep (D003) | Capture. |
| Cmd+click joins the session (`derivedTabs.ts`) | keep | Core per-tab session behavior. |
| Highlight restore on page load | keep (D003) | Part of Notes. |
| arXiv context prefix (`content/enhancements/arxiv.ts`, used only by `useAgentChat` to prepend `[Context: arXiv paper …]`) | fold | Put the paper id into the page card (`read_page` card mode) instead of a special case in the send path. |
| GM bridge, userscript registration | keep | Scripts layer. |
| Tracing (background events) | keep (D003) | Sensor; exported over the relay. |

## 2. Agent tools (`lib/agentToolCatalog.ts`)

Every catalog tool is bound for the whole chat (`bindAgentTools`), and the relay exposes the same catalog through `iris.tools.list` / `iris.tools.call`. So a verdict here applies to both callers. Today: 38 tools plus the `query_tabs` alias, which `bindAgentTools` adds as a second schema entry.

| Tool | Group | Verdict | Reason / overlap |
|------|-------|---------|------------------|
| `read_page` | page | keep | The main page reader (card / text / selector, 8000-char slices). |
| `eval` | page | keep | General actuator on the page. |
| `open_url` | page | keep | Absorbs `navigate` (add an optional `tabId` to reuse a tab). |
| `focus_tab` | page | keep | Duplicate of relay `browser.activate_tab`; the relay one folds (section 3). |
| `web_search` | search | keep | Needs an Exa key; see AX-6. |
| `list_scripts` | scripts | keep | |
| `write_script` | scripts | keep | |
| `toggle_script` | scripts | keep | |
| `reload_tab` | scripts | keep | Generic page action; move to the `page` group. |
| `read_console` | scripts | keep | Only way to debug a script the agent wrote. |
| `list_skills` | skills | keep | |
| `load_skill` | skills | keep | |
| `read_skill_file` | skills | keep | |
| `write_skill` | skills | keep | |
| `patch_skill` | skills | keep | |
| `read_skill_history` | skills | keep | Rare; candidate for folding into `read_skill_file` (`revision` param) if the schema size matters (AX-1). |
| `delete_skill` | skills | keep | |
| `toggle_skill` | skills | keep | |
| `list_reports` | reports | keep | |
| `read_report` | reports | keep | |
| `write_report` | reports | keep | |
| `edit_report` | reports | keep | |
| `list_tabs` | tabs | keep | Duplicate of relay `browser.list_tabs`; the relay one folds. |
| `query_tabs` (alias) | tabs | drop from the schema | Same tool twice in every request. Keep the alias in the catalog lookup only, for old relay callers. |
| `close_tabs` | tabs | keep | Covers relay `browser.close_tab`. |
| `create_tab_group` | tabs | keep | The primitive for organizing. |
| `smart_organize` | tabs | drop | Domain grouping is a heuristic the agent does with `list_tabs` + `create_tab_group`; the tab-cleanup skill can describe it. |
| `archive_inactive` | tabs | fold | Into `list_tabs` (an `inactiveHours` filter returning last access) + `close_tabs`. |
| `list_closed_tabs` | tabs | keep | Undo for `close_tabs`. |
| `restore_tab` | tabs | keep | Undo for `close_tabs`. |
| `get_tab_info` | automation | drop | Reports only the hidden automation tab, which the side panel never uses: `bindAgentTools` always fills `tabId` with the session tab. |
| `navigate` | automation | fold | Into `open_url` with `tabId`. |
| `page_snapshot` | automation | fold | Into `read_page` as a `snapshot` mode (DOM outline with selectors for `click`). |
| `click` | automation | keep | Selector clicks are common and easy to get wrong in `eval`. |
| `type_text` | automation | keep | Same; input events for framework-controlled fields. |
| `extract_data` | automation | fold | `read_page` selector mode plus `eval` cover text, html, lists, tables. |
| `wait_for` | automation | keep | Needed between `click` and the next read. |
| `scroll` | automation | fold | Into `eval` (`scrollIntoView` / `scrollBy`); one line in a skill. |
| `take_screenshot` | screenshot | keep | The only visual read. |

After the folds: 31 tools, no alias in the schema, and no "hidden automation tab" concept left in descriptions. Whether the hidden automation tab code in `automationEngine.ts` can go entirely is for iris-025 to check (the relay may pass no `tabId`).

Page WebMCP tools (`listPageWebmcp` / `executePageWebmcp`): **keep** for the relay. They are not in the side-panel schema (`skills.ts` says so). Whether the side-panel agent should see the current tab's WebMCP tools is an open question, not a verdict here.

## 3. Relay methods (`background/browserRelay.ts`, `relayIris.ts`, `relayAgentTools.ts`)

Level split from `lib/relayLevel.ts`: `read` allows `browser.fetch` and `iris.capabilities` / `iris.chat.*`; everything else needs `control`.

| Method | Level | Verdict | Reason / overlap |
|--------|-------|---------|------------------|
| `fetch`, `list_tabs`, `get_tab_content`, `close_tab`, `activate_tab` (unprefixed) | control | drop | Old names registered beside `browser.*`, so `iris.capabilities` lists every browser method twice. Drop once sonar is confirmed to send only prefixed names. |
| `browser.fetch` | read | keep | The only page read allowed at `read` level. Opens a **foreground** tab and closes it, which steals focus on a browser the user is using; see AX-9. |
| `browser.list_tabs` | control | fold | = `iris.tools.call list_tabs`. |
| `browser.get_tab_content` | control | fold | = `iris.tools.call read_page` (text mode). |
| `browser.close_tab` | control | fold | = `iris.tools.call close_tabs`. |
| `browser.activate_tab` | control | fold | = `iris.tools.call focus_tab`. |
| `iris.capabilities` | read | keep | Discovery; should also hint at `iris.tools.list`. |
| `iris.chat.platforms` | read | keep | Chat export for outside agents. |
| `iris.chat.list` | read | keep | |
| `iris.chat.export` | read | keep | |
| `iris.chat.export_all` | read | keep | Streams chunks. |
| `iris.knowledge.export` | control | keep | Sensor output (D003 keeps Notes). |
| `iris.conversations.export` | control | keep | Agent transcripts for ea. |
| `iris.tracing.export` | control | keep (D003) | Sensor output. |
| `iris.navigate` | control | keep | Lets an outside agent hand a chat to the user. |
| `iris.settings.get` | control | keep, narrow | Debugging aid. `includeSecrets: true` returns the API key, relay token, and Exa key to any `control` caller; drop that parameter unless a caller needs it. |
| `iris.tools.list` | control | keep | The relay's entry to the agent catalog; becomes the one way to act on tabs once the `browser.*` folds land. |
| `iris.tools.call` | control | keep | |

The fold keeps the level split intact: `browser.fetch` stays the single `read` page method, and every `control` page action goes through `iris.tools.call`. The server's `READ_METHODS` in `services/server/src/hub.ts` must change in the same commit as `relayLevel.ts` if any `read` method is renamed.

## 4. Agent-experience problems (candidate issues)

Each is sized to become one forge issue in 0.7 item 4.

- **AX-1 Tool schema size and overlap.** Apply the tool verdicts in section 2: drop `query_tabs` from the schema, drop `smart_organize` and `get_tab_info`, fold `navigate` into `open_url`, `page_snapshot` and `extract_data` into `read_page`, `archive_inactive` into `list_tabs`, `scroll` into `eval`. Acceptance: 31 tools, updated `agent.md` tool table, relay `iris.tools.call` still accepts the old names for one minor (mapped or with a clear "renamed to" error).
- **AX-2 Descriptions that contradict behavior.** `navigate`, `page_snapshot`, and `tabField` say "without tabId, uses the hidden automation tab", but the side panel always passes the session tab and the relay is told `tabId` is required. Rewrite every description from the caller's view (side panel: session tab by default; relay: `tabId` required), and add a test that no description mentions the hidden tab.
- **AX-3 One page reader.** `read_page` modes are `card`, `text`, `selector`; add `snapshot` (interactive elements with stable selectors for `click` / `type_text`). The card carries site-specific ids (arXiv id today, from `extractArxivId`) so the send path loses its arXiv special case. Acceptance: on a long article, a GitHub PR, and an arXiv abs page, the agent answers with one card read and at most two `text` slices.
- **AX-4 Long chats.** The full thread goes to the model on every step; old `read_page` slices, `eval` results, and screenshots stay in context forever, while `history.ts` silently keeps only the last `MAX_MESSAGES` when saving. Proposal: before each step, replace tool outputs older than the last N turns with a one-line receipt (tool, args, size), and show the estimated context size in the chat header. Acceptance: a 50-turn page chat stays under a set token budget, and a reopened chat matches what the model saw.
- **AX-5 Errors shown to the user.** `AgentPanel` shows one raw string (`error.message`). Map the common cases to an action: missing or rejected API key (open Settings), unknown model (open the model picker), rate limit (retry), step limit reached (`maxSteps`, offer Continue), session tab closed or not scriptable (`chrome://`, Web Store). Tool errors returned to the model should say what to do next (for example `tabId is required` → "pass tabId from list_tabs").
- **AX-6 `web_search` without a key.** The tool is always in the schema; with an empty `exaApiKey` it fails at call time. Either omit it when no key is set (the schema is built per agent) or return "web search is not configured; tell the user to add an Exa key in Settings → Tools".
- **AX-7 MCP leftovers in the chat.** Remove the header MCP status and the `mcpEnabled` flag, per D005 and the drop rows in section 1. MCP stays reachable only from Developer settings.
- **AX-8 Entry points that skip the agent.** The palette and the context menu offer Markdown copy and Notes but not "Ask Iris about this page / selection". Add one palette command and one selection context-menu item that open the panel on this tab with the selection quoted in the input (not sent). Layout per `ui.md` first if the input changes.
- **AX-9 Relay overlap and focus.** Apply section 3: drop the unprefixed names, fold the four `browser.*` control methods into `iris.tools.call`, make `browser.fetch` open its tab in the background (or reuse an existing tab with that URL), and drop `iris.settings.get includeSecrets`. Update `browser-relay.md`, sonar's tool descriptions, and `READ_METHODS` on both sides together.
- **AX-10 Model switching.** `createAgent` sends `reasoningEffort: 'high'` for every model and the agent is built once per chat. Not inspected in depth here; scope it in its own issue (per-model reasoning setting, what happens to the thread when the model changes mid-chat).

## 5. Positioning text (for `spec.md` after acceptance)

Proposed replacement for the two numbered jobs in the Positioning section:

1. **Agent on the current page.** The side-panel agent reads and acts on the tab in front of the user, writes skills, scripts, and reports, and keeps its chats.
2. **Relay for outside agents.** Through sonar, outside agents read and act in the user's logged-in browsers with the same tool catalog (`iris.tools.*`), within each browser's level, plus exports of what Iris captured.

Everything else is an entry point to those two (FAB, palette, context menu, shortcuts) or a thin tool kept working (D003). The test for new work becomes: does it make the page agent or the relay better? "Capture" stays as an output of the relay (`iris.*.export`), not as a separate pillar.

On acceptance: rewrite the Positioning and Side panel tables in `spec.md`, append a decision to `decisions.md` (verdicts in sections 1–3 accepted; capture is not a pillar), then file AX-1 to AX-10 and hand the drop rows to iris-025.
