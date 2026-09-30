---
schema_version: 1
id: iris-014
title: Make AgentScripts register WebMCP tools the agent can call
status: done
priority: high
estimate: L
labels: [backfill, scripts, webmcp]
isolation: local
blocked_by: [iris-009]
---

## Objective
AgentScripts registered but never ran, a second one on the same page collided, and `load_tools`
returned an empty list. Make them work end to end and give the agent authoring guidance.

## Context
- `src/lib/scriptRuntime.ts` — MAIN-world wrapper, `document` / `navigator` proxies.
- `src/lib/agentToolCatalog.ts` — `load_tools({ groups: ["site"] })` bridge.
- `src/lib/scriptTools.ts`, `src/lib/pageTools.ts` — `read_console`, `eval`.
- `skills/scripts/SKILL.md`, `skills/scripts/reference.md` — authoring rules and full examples.
- `.ea/spec/scripts.md` — "AgentScript".

## Tasks
- [x] Add the `scripts` skill: when a script beats `eval`, `@name` upsert, grants, `@webmcp`, debug checklist.
- [x] Pass the `document` / `navigator` shadows as function parameters (TDZ fix); bind proxy traps to the real target.
- [x] Run AgentScript bodies and `eval` as async functions; report parse failures; flatten `read_console` output.
- [x] Wrap each script in its own function so MAIN-world scripts do not collide.
- [x] Copy only JSON fields from `getTools()` so structured clone does not drop the list.

## Acceptance
- [x] Two AgentScripts on one page both register tools.
- [x] `load_tools({ groups: ["site"] })` lists AgentScript tools and the site's own tools.
- [x] A script error shows up in `read_console`.

## Boundaries
- Never: require `#enable-webmcp-testing`; polyfill `document.modelContext` instead.

## Outcome
Status: done, shipped in 0.4.1. Commits `5ba5c5b`, `7f9fd71`, `f0cddf4`.
