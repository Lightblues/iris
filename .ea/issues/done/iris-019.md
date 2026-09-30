---
schema_version: 1
id: iris-019
title: Run page eval in the page's own JavaScript world
status: done
priority: high
estimate: M
labels: [backfill, agent, bug]
isolation: local
---

## Objective
On sites with a strict CSP, inline `eval` scripts were blocked and reported as syntax errors.
Execute through `userScripts` in the page's main world and keep a single `eval` tool.

## Context
- `src/lib/pageTools.ts` — `eval` implementation.
- `src/lib/pageTools.eval.test.ts`.
- `src/lib/agentToolCatalog.ts` — `evaluate_js` as an alias.
- `src/lib/automationEngine.ts` — old inline path removed.

## Tasks
- [x] Execute `eval` via `chrome.userScripts` in the MAIN world.
- [x] Fall back to DOM-only (`domOnly`) when user scripts are off.
- [x] Make `evaluate_js` an alias of `eval`, not a second tool.

## Acceptance
- [x] `eval` returns a value on a strict-CSP page.
- [x] Results are console-like JSON; tests cover the alias.

## Outcome
Status: done, shipped in 0.5.1. Commit `2d38d56`.
