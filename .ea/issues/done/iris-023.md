---
schema_version: 1
id: iris-023
title: Attach every static tool and remove load_tools
status: done
priority: medium
estimate: M
labels: [agent, tools]
isolation: local
review: true
host: local
cwd: /Users/frankshi/Projects/app/iris
workspace_id: wks_dfca0e9f6830074f
agent_id: 6fd26128-1b0f-447f-ab7d-b15974975168
dispatched_at: 2026-10-01T02:53:26.597Z
---

## Objective
`load_tools` hides about 17 of 38 catalog tools behind groups that do not match the catalog, and the model does not see the new schemas until the next request — which also changes the tool list and drops the prompt cache.
Attach every catalog tool for the whole chat and delete the group loader. Page WebMCP and MCP stay out of this schema until a later tool-search issue.

## Context
- `src/lib/agentToolCatalog.ts` — the static catalog (page, scripts, skills, reports, tabs, automation, screenshot, search). `bindAgentTools` already wraps all of them.
- `src/lib/scriptTools.ts` — `TOOL_GROUPS`, `createToolSession`, `createLoadTools`. `screenshot` repeats core `take_screenshot`. `query_tabs` is an alias of `list_tabs` (`src/lib/bindAgentTools.ts`), not its own tool.
- `src/agent/createAgent.ts` — builds the session and sets `prepareStep` to `activeTools: session.active()`.
- `src/agent/skills.ts` — prompt lists a core subset and tells the model to call `load_tools` for `tabs`, `automation`, `screenshot`, `reports`, `site`, `mcp`.
- `src/lib/reportStore.test.ts` — asserts report tools attach only after `load_tools`. `src/lib/webSearch.test.ts` asserts `TOOL_GROUPS.core`.
- Skills that instruct a load: `skills/tabs/SKILL.md`, `skills/automation/SKILL.md`, `skills/paper/SKILL.md`, `skills/scripts/SKILL.md`, `skills/scripts/reference.md`.
- Specs: `.ea/spec/agent.md`, `.ea/spec/spec.md`, `.ea/spec/scripts.md`, `.ea/spec/browser-relay.md`.
- `src/agent/mcp.ts` `connectMcp` and `listPageWebmcp` in the catalog stay. The relay still lists page WebMCP when `iris.tools.list` is called with `tabId`.

## Tasks
- [x] In `createAgent`, pass `bindAgentTools` through as the tool set. Remove `prepareStep`'s `activeTools` filter and the `load_tools` tool.
- [x] Delete `TOOL_GROUPS`, `createToolSession`, and `createLoadTools`. Delete `src/lib/scriptTools.ts` if nothing else remains.
- [x] Rewrite the system prompt so it no longer names groups or `load_tools`. Schemas are the tool list. Keep the existing `edit_report` / `write_report` and skill-editing rules.
- [x] Update the four skills and `skills/scripts/reference.md`: tabs and automation tools are in the schema from the start. State that page WebMCP and MCP tools are not in the side-panel schema. Do not tell the model to call a loader.
- [x] Replace the `load_tools` assertions in `reportStore.test.ts` and `webSearch.test.ts`. Report, tab, and automation names are catalog tools with no attach step.
- [x] Update the four spec files to match. `browser-relay.md` keeps WebMCP on `iris.tools.list` / `iris.tools.call`.

## Acceptance
- [x] `pnpm test` and `pnpm typecheck` pass.
- [x] `rg load_tools src skills .ea/spec` prints nothing.
- [x] `createAgent` does not set `activeTools`, and its `tools` object has no `load_tools` key. `list_reports`, `create_tab_group`, and `click` are in that object from construction.
- [x] Person check: ask for a one-line change to an existing report. The agent calls `edit_report` without a preceding load. Ask it to fetch an arXiv paper: it does not call `load_tools` or an MCP tool.

## Boundaries
- Always: the catalog tool set is fixed for the whole conversation.
- Never: add `toolSearch`, `deferLoading`, or a smaller loader that only handles `site` and `mcp`. Never connect MCP when the agent is created. Never copy page WebMCP tools into the side-panel schema.
- Never: delete `connectMcp`, `listPageWebmcp`, or the relay's WebMCP listing.
- Ask: if removing the loader leaves a caller other than the skills and specs above.

## Outcome
- Status: done
- Date: 2026-10-01
- Summary: The side-panel agent now attaches the full static catalog for the whole chat. The group loader and its `activeTools` filter are gone. Page WebMCP and MCP stay out of that schema; `connectMcp` and the relay's WebMCP listing are unchanged.
- Files changed:
  - `src/agent/createAgent.ts` — passes `bindAgentTools` through; no `prepareStep` / `activeTools`
  - `src/agent/createAgent.test.ts` — catalog keys from construction, no `activeTools`
  - `src/agent/skills.ts` — prompt uses schemas as the tool list and keeps the report and skill-edit rules
  - `src/lib/scriptTools.ts` — deleted
  - `src/lib/reportStore.test.ts` — report, tab, and automation names are catalog tools
  - `src/lib/webSearch.test.ts` — `web_search` is in the bound catalog
  - `src/background/relayAgentTools.ts` — list description no longer names the loader
  - `skills/tabs/SKILL.md`, `skills/automation/SKILL.md`, `skills/paper/SKILL.md`, `skills/paper/reference.md`, `skills/scripts/SKILL.md`, `skills/scripts/reference.md` — tools are present from the start; WebMCP and MCP are not in the side-panel schema
  - `.ea/spec/agent.md`, `.ea/spec/spec.md`, `.ea/spec/scripts.md`, `.ea/spec/browser-relay.md` — match the fixed catalog; WebMCP stays on `iris.tools.list` / `iris.tools.call`
- Verification: `pnpm test` (24 pass). `pnpm typecheck` pass. `rg load_tools src skills .ea/spec` prints nothing. `createAgent` test checks `list_reports`, `create_tab_group`, and `click` are present and `prepareStep` / `activeTools` are unset.
- Notes: No other caller of the loader. `connectMcp`, `listPageWebmcp`, and `executePageWebmcp` stay. MCP is not connected at creation. `.multica-draft/issue-see-image.md` still mentions the old loader; it is outside `src`, `skills`, and `.ea/spec`. No `.ea/spec/decisions.md` in the repo.
- Review: 2026-10-01 — confirmed with forge-close.
