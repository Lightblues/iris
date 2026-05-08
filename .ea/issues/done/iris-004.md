---
id: iris-004
title: Display thinking/reasoning blocks with streaming
status: done
priority: high
estimate: M
---

## Objective
Show LLM's "thinking" output in the UI during streaming, similar to Claude app's design:
grey text, collapsible, auto-collapses when generation finishes.

## Context
- `src/sidepanel/components/ChatMessage.tsx` — renders message parts
- `src/sidepanel/components/ReasoningDisplay.tsx` — (to be created)
- `src/agent/useAgentChat.ts` — streaming handler, parses provider response
- LLM provider returns `{ type: "reasoning", reasoning: "..." }` parts
- Reference: Claude app's thinking block (grey, collapsible)

## Tasks
- [x] Create `ReasoningDisplay` component (collapsible, grey styling)
- [x] Wire into ChatMessage part rendering pipeline
- [x] Streaming state: expanded with cursor animation
- [x] Auto-collapse on stream finish (track via `prevStreamingRef`)
- [x] Brain icon + "Thinking..." / "Thought" label

## Acceptance
- [x] Thinking content streams in real-time with grey text
- [x] Expanded during streaming, auto-collapses when done
- [x] Click to toggle expand/collapse after completion
- [x] No UI shown when message has no thinking content
- [x] Compact styling (12px text, 11px label) consistent with sidepanel density

## Boundaries
- Always: Use existing `message.parts` pipeline — thinking is just another part type
- Never: Don't modify the streaming/fetch logic in useAgentChat; only handle at render layer
