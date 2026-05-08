---
id: iris-007
title: Show full page content in context message expand view
status: todo
priority: medium
estimate: S
---

## Objective
When clicking "inject full page content", the expanded preview only shows the first 200
characters then truncates. Show the complete injected content in a fixed-height scrollable
container so users can verify exactly what was sent to the LLM.

## Context
- `src/sidepanel/components/ChatMessage.tsx`
  - Line 115: `const contentPreview = messageText.slice(0, 200)` — hard truncation
  - Line 165-168: expanded view renders `{contentPreview}...` in a `max-h-40 overflow-y-auto` container
  - The container already has `overflow-y-auto` — scrolling works, but content is sliced before render
- `messageText` (from `getMessageText()`) contains the full injected content

## Tasks
- [ ] Replace `contentPreview` with full `messageText` in the expanded view
- [ ] Remove trailing `...` hardcoded after content
- [ ] Keep the `max-h-40 overflow-y-auto` container (fixed height + scroll is the desired UX)

## Acceptance
- [ ] Expanded view shows complete page content, scrollable
- [ ] No artificial truncation or "..." suffix
- [ ] Container height stays fixed (~160px / max-h-40), user scrolls to see more
- [ ] Collapsed state unchanged (still shows title + token count only)

## Boundaries
- Always: Keep the existing expand/collapse UX — only change what's rendered inside
- Never: Don't remove the `contentPreview` variable if it's used elsewhere; just stop using it for the expanded render
