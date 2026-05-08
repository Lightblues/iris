---
id: iris-001
title: Remove legacy Chat module
status: done
priority: medium
estimate: S
---

## Objective
Clean up the old Chat tab — remove both UI components and backend code.
The project has shifted focus to the Agent tab as the primary AI interaction surface.

## Context
- The Chat module was the original LLM interaction surface, now superseded by Agent
- Need to remove: Chat tab UI, related routes, and unused chat logic
- Keep: Agent tab, history, settings

## Tasks
- [x] Remove Chat tab component and its route entry
- [x] Remove chat-specific lib code not shared with Agent
- [x] Verify Agent tab still works after cleanup

## Acceptance
- [x] No "Chat" tab visible in the sidepanel
- [x] Agent tab and all other tabs function normally
- [x] No dead imports or unused code left behind
