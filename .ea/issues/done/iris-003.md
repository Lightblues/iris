---
schema_version: 1
id: iris-003
title: Add rerun button to agent messages
status: done
priority: medium
estimate: S
---

## Objective
Add a "rerun" action to the message hover toolbar in Agent chat.
When clicked, truncate the conversation to the target user message and re-send it,
effectively regenerating the response.

## Context
- `src/sidepanel/components/ChatMessage.tsx` — message component with hover actions
- `src/agent/useAgentChat.ts` — conversation state management
- Existing hover actions: Edit, Fork, Save as Note, Copy, Delete
- Icon: `RotateCcw` from lucide-react

## Tasks
- [x] Add `onRerun` callback prop to ChatMessage
- [x] Add RotateCcw button in hover action bar (between Edit and Save as Note)
- [x] Implement rerun logic: find nearest user message at or before clicked message,
      truncate conversation, re-send that user message
- [x] Hide rerun button during streaming (`isStreaming` guard)

## Acceptance
- [x] ↺ button appears on hover for both user and assistant messages
- [x] Clicking truncates to the corresponding user message and regenerates
- [x] Button not visible while streaming
- [x] Conversation state is consistent after rerun (no orphan messages)
