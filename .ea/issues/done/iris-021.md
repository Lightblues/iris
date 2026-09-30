---
schema_version: 1
id: iris-021
title: Add a web_search tool backed by Exa
status: done
priority: medium
estimate: M
labels: [agent, tools, search]
isolation: local
review: true
host: local
cwd: /Users/frankshi/Projects/app/iris
workspace_id: wks_dfca0e9f6830074f
agent_id: 9c4f307e-a60a-4b46-acfd-0e5222fca656
dispatched_at: 2026-09-30T11:22:33.106Z
---

## Objective
The sidebar agent can read and act on open tabs but cannot look anything up on the web. Add a core
`web_search` tool that queries Exa and returns titles, URLs, dates, and trimmed text, so the agent can
answer questions about current information and then `open_url` / `read_page` the best hits.
Reference: https://ai-sdk.dev/cookbook/node/web-search-agent (the "custom tool" Exa variant).

## Context
- `src/lib/agentToolCatalog.ts` — `TOOLS: ToolDef[]` (name, group, needsTab, JSON `inputSchema`, `run`). Every tool here
  is bound for the side panel by `src/lib/bindAgentTools.ts` and exposed to external agents through `iris.tools.list` /
  `iris.tools.call`, so one definition serves both.
- `src/lib/scriptTools.ts` — `TOOL_GROUPS.core`: names always in the schema; everything else waits for `load_tools`.
- `src/agent/skills.ts` — system prompt; lists the always-available tools by name.
- `src/lib/sidepanelSettings.ts` — `SidePanelSettings`, `DEFAULT_SETTINGS`, `loadSettings`, `importSettings` (each field is copied explicitly).
- `src/sidepanel/components/SettingsPage.tsx` — sections via `SectionHeader`; the Remote Relay token field is the pattern for a secret input.
- Exa API (https://docs.exa.ai/reference/search): `POST https://api.exa.ai/search`, header `x-api-key`, body
  `{ query, numResults, type: "auto", contents: { text: true } }`, response `{ results: [{ title, url, publishedDate, text }] }`.
  The manifest's `<all_urls>` host permission lets extension pages and the service worker call it without CORS issues.
- `scripts/test-screenshot-vision.ts` — existing pattern for a live check script run with `pnpm exec tsx`.
- `.ea/spec/agent.md` ("Core tools" table), `.ea/spec/spec.md` ("Settings (agent-relevant)" table).

## Tasks
- [x] Add `src/lib/webSearch.ts`: `searchExa(query, { numResults }, { apiKey, fetch })` that calls the API with plain `fetch`, maps results to `{ title, url, publishedDate, text }` with `text` cut to ~1000 characters, and throws a clear error on a missing key or non-2xx response (include the status and Exa's message).
- [x] Add `web_search` to `TOOLS` (group `search`, `needsTab: false`): params `query` (required) and `numResults` (1-10, default 5); `run` reads `exaApiKey` from `loadSettings()`. Return `{ untrusted: true, results }`.
- [x] Add `web_search` to `TOOL_GROUPS.core` and to the always-available list in `skillsCatalogPrompt`, with one sentence: search the web for current information, then `open_url` / `read_page` a result for detail.
- [x] Add `exaApiKey?: string` to `SidePanelSettings` (default `''`), carry it through `importSettings`, and add a "Web Search" section in Settings with a secret input and a link to the Exa dashboard.
- [x] Add `src/lib/webSearch.test.ts` (Node test runner, fake `fetch`): request shape, mapping and truncation, missing key, HTTP error.
- [x] Add `scripts/test-web-search.ts` that runs `searchExa` with `EXA_API_KEY` from the environment and prints the results; update the two spec tables.

## Acceptance
- [x] `pnpm test` includes the new tests and they pass; `pnpm typecheck` passes.
- [x] `EXA_API_KEY=… pnpm exec tsx scripts/test-web-search.ts "AI SDK 6 ToolLoopAgent"` prints at least one real result with title, URL, and text.
- [x] `iris.tools.list` includes `web_search` with the same schema (it comes from the catalog; no relay code change).
- [x] With no Exa key set, calling the tool returns an error that tells the user to set it in Settings → Web Search; chat keeps working.
- [x] Person check (review): in the loaded extension, asking "what changed in the latest Chrome stable release?" makes the agent call `web_search` and cite result URLs.

## Outcome
- Status: done
- Date: 2026-09-30
- Summary: The sidebar agent can call a core `web_search` tool that queries Exa with a key stored in side-panel settings and returns titles, URLs, dates, and text trimmed to 1000 characters.
- Files changed:
  - `src/lib/webSearch.ts` — `searchExa` fetch client
  - `src/lib/webSearch.test.ts` — request shape, truncation, missing key, HTTP error, catalog membership
  - `src/lib/agentToolCatalog.ts` — `web_search` tool
  - `src/lib/scriptTools.ts` — core tool group
  - `src/agent/skills.ts` — always-available prompt sentence
  - `src/lib/sidepanelSettings.ts` — `exaApiKey`
  - `src/sidepanel/components/SettingsPage.tsx` — Web Search secret field and dashboard link
  - `src/background/relayIris.ts` — omit `exaApiKey` from `iris.settings.get` unless `includeSecrets` is true
  - `scripts/test-web-search.ts` — live Exa check
  - `.ea/spec/agent.md` — core tools table
  - `.ea/spec/spec.md` — settings table
  - `.ea/spec/browser-relay.md` — tools.list includes search
- Verification: `pnpm test` 14 passed, including the five new web search tests. `pnpm typecheck` passed. `pnpm exec tsx scripts/test-web-search.ts "AI SDK 6 ToolLoopAgent"` printed five hits; the first was the AI SDK ToolLoopAgent docs page with a title, URL, and text.
- Notes: Exa's response matched the issue (`results[].title/url/publishedDate/text`); `publishedDate` was often absent and is stored as `''`. A missing key throws `Exa API key is not set. Add it in Settings → Web Search.` from `searchExa`, which `web_search` does not catch, so the agent loop treats it like other tool errors and chat continues. `iris.settings.get` now withholds the key unless `includeSecrets` is true. The in-extension person check passed.

## Boundaries
- Always: keep the key in `chrome.storage.local` settings only; never log it or return it in tool output.
- Never: add `@exalabs/ai-sdk` or `exa-js` (a catalog tool is a JSON-schema function, and the relay needs the same definition); never add provider-native search (OpenAI `web_search`, Gemini grounding) in this issue.
- Never: fetch full pages from search results inside `web_search`; `read_page` / `open_url` already do that.
- Ask: if Exa's response shape differs from Context, or if `web_search` should be a lazy `load_tools` group instead of core.
