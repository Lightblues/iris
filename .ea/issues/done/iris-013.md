---
schema_version: 1
id: iris-013
title: Let the agent patch skills safely, with frontmatter checks and history
status: done
priority: high
estimate: M
labels: [backfill, skills]
isolation: local
blocked_by: [iris-012]
---

## Objective
Rewriting a whole skill to change one line silently dropped content, and `patch_skill` could store
a `SKILL.md` with no frontmatter. Add string-match edits, validate every write, and keep recoverable history.

## Context
- `src/lib/skillStore.ts` — write paths, validation, `iris_skill_history` ring.
- `src/lib/agentToolCatalog.ts` — `write_skill`, `patch_skill`, `read_skill_history`.
- `scripts/bundle-skills.ts` — same validation at build time.
- `skills/create-skill/SKILL.md` — builtin skill for authoring skills.
- `.ea/spec/agent.md` — "Skills".

## Tasks
- [x] Add `patch_skill` with `edits` (unique `old_string` match unless `replace_all`), `files`, `remove`; apply immediately.
- [x] Validate `SKILL.md` frontmatter against the Agent Skills spec on every write and in `bundle-skills`.
- [x] Add `read_skill_history`; group saves within 5 minutes into one snapshot; cap 16.
- [x] Add the `create-skill` builtin; refresh `author: builtin` records from the bundle on startup.

## Acceptance
- [x] `patch_skill` with an ambiguous `old_string` fails instead of editing.
- [x] A malformed builtin fails `pnpm bundle-skills`.
- [x] An overwritten `SKILL.md` can be read back from history.

## Boundaries
- Never: let builtin skills be edited or deleted.

## Outcome
Status: done, shipped in 0.4.1. Commits `d09327b`, `79acf2f`.
