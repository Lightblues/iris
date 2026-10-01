---
schema_version: 1
id: iris-023
title: Attach every static tool and remove load_tools
status: todo
priority: medium
estimate: M
labels: [agent, tools]
isolation: local
review: true
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
- [ ] In `createAgent`, pass `bindAgentTools` through as the tool set. Remove `prepareStep`'s `activeTools` filter and the `load_tools` tool.
- [ ] Delete `TOOL_GROUPS`, `createToolSession`, and `createLoadTools`. Delete `src/lib/scriptTools.ts` if nothing else remains.
- [ ] Rewrite the system prompt so it no longer names groups or `load_tools`. Schemas are the tool list. Keep the existing `edit_report` / `write_report` and skill-editing rules.
- [ ] Update the four skills and `skills/scripts/reference.md`: tabs and automation tools are in the schema from the start. State that page WebMCP and MCP tools are not in the side-panel schema. Do not tell the model to call a loader.
- [ ] Replace the `load_tools` assertions in `reportStore.test.ts` and `webSearch.test.ts`. Report, tab, and automation names are catalog tools with no attach step.
- [ ] Update the four spec files to match. `browser-relay.md` keeps WebMCP on `iris.tools.list` / `iris.tools.call`.

## Acceptance
- [ ] `pnpm test` and `pnpm typecheck` pass.
- [ ] `rg load_tools src skills .ea/spec` prints nothing.
- [ ] `createAgent` does not set `activeTools`, and its `tools` object has no `load_tools` key. `list_reports`, `create_tab_group`, and `click` are in that object from construction.
- [ ] Person check: ask for a one-line change to an existing report. The agent calls `edit_report` without a preceding load. Ask it to fetch an arXiv paper: it does not call `load_tools` or an MCP tool.

## Boundaries
- Always: the catalog tool set is fixed for the whole conversation.
- Never: add `toolSearch`, `deferLoading`, or a smaller loader that only handles `site` and `mcp`. Never connect MCP when the agent is created. Never copy page WebMCP tools into the side-panel schema.
- Never: delete `connectMcp`, `listPageWebmcp`, or the relay's WebMCP listing.
- Ask: if removing the loader leaves a caller other than the skills and specs above.
