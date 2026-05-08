---
id: iris-006
title: Show raw model ID without abbreviation in model selector
status: todo
priority: medium
estimate: S
---

## Objective
Model selector currently abbreviates model IDs (strips provider prefix like `anthropic/`).
Show the full raw model ID instead — prioritize visibility and control over cosmetic brevity.

## Context
- `src/sidepanel/components/ModelCombobox.tsx`
  - Line 194: `formatModelShort()` strips the provider prefix (`anthropic/claude-3.5-sonnet` → `claude-3.5-sonnet`)
  - Line 96-98: `displayLabel` uses `formatModelShort` for the closed-state trigger
  - Line 106: trigger has `max-w-[160px]` which truncates long IDs
- The dropdown list (line 156) already shows full `model.id` — only the trigger is abbreviated

## Tasks
- [ ] Remove or bypass `formatModelShort` — display `model.id` directly as `displayLabel`
- [ ] Widen trigger `max-w` (e.g. `max-w-[260px]`) so full IDs are readable without truncation
- [ ] Keep `truncate` class as safety net for extremely long IDs

## Acceptance
- [ ] Closed selector shows full model ID (e.g. `anthropic/claude-sonnet-4-20250514`, not `claude-sonnet-4-20250514`)
- [ ] No layout overflow — trigger widens gracefully within the header bar
- [ ] Dropdown list behavior unchanged

## Boundaries
- Always: Minimal change — only touch the display layer, not model fetching or storage
- Never: Don't remove `formatModelShort` function entirely (might be useful elsewhere later) — just stop using it for displayLabel
