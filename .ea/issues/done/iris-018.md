---
schema_version: 1
id: iris-018
title: Close aborted and unknown tool calls so the next message can be sent
status: done
priority: high
estimate: S
labels: [backfill, agent, bug]
isolation: local
---

## Objective
After Stop, or a call to a tool with no schema, AI SDK rejected every later turn because a call had
no result. Repair those calls into finished errors before validation.

## Context
- `src/agent/repairMessages.ts`, `src/agent/repairMessages.test.ts`.
- `src/agent/transport.ts`, `src/agent/useAgentChat.ts` — where repair runs.
- `src/sidepanel/components/ToolCallDisplay.tsx` — shows the error state.

## Tasks
- [x] Turn unfinished tool calls into error results when a run is stopped.
- [x] Turn calls to unknown tool names into error results.
- [x] Run the repair before messages are validated for the next turn.

## Acceptance
- [x] Stop mid-tool-call, then send again: the reply streams.
- [x] Unit tests cover aborted and unknown-name calls.

## Outcome
Status: done, shipped in 0.5.1. Commit `710958e`.
