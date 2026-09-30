---
schema_version: 1
id: iris-010
title: Expose the side-panel agent tools through the browser relay
status: done
priority: medium
estimate: M
labels: [backfill, relay]
isolation: local
---

## Objective
External agents had a second, drifting copy of the page and script tools. Serve the same tool
definitions the side-panel agent uses through `iris.tools.list` and `iris.tools.call`.

## Context
- `src/lib/agentToolCatalog.ts` — single catalog of tool definitions.
- `src/lib/bindAgentTools.ts` — binds catalog entries to AI SDK tools for the side panel.
- `src/background/relayAgentTools.ts` — `iris.tools.list` / `iris.tools.call` relay methods.
- `src/background/browserRelay.ts` — relay method registration.
- `.ea/spec/browser-relay.md`, `.ea/spec/scripts.md` ("Agent tools").

## Tasks
- [x] Move tool definitions from `pageTools`, `scriptTools`, `automationTools`, `tabAgentTools` into one catalog.
- [x] Bind the catalog for the side panel.
- [x] Add `iris.tools.list` and `iris.tools.call` relay methods backed by the same catalog.

## Acceptance
- [x] `iris.tools.list` returns the same tool names and schemas the side-panel agent sees.
- [x] `iris.tools.call` runs a script tool from an external agent.

## Boundaries
- Never: add a second implementation of a tool for the relay.
- Always: keep `load_tools` side-panel only.

## Outcome
Status: done, shipped in 0.4.0. Commit `1804e30`.
