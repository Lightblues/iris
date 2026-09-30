---
schema_version: 1
id: iris-009
title: Persist site patches as standard userscripts with a Scripts tab
status: done
priority: high
estimate: L
labels: [backfill, scripts]
isolation: local
---

## Objective
Site changes the agent made with `eval` vanished when the panel closed. Store them as standard
userscripts, register them with `chrome.userScripts` so they keep running, and give them a side-panel tab.

## Context
- `src/lib/scriptMeta.ts` — `==UserScript==` header parsing; unknown `@` lines are kept.
- `src/lib/scriptRuntime.ts` — `chrome.userScripts` registration and wrappers.
- `src/lib/scriptStore.ts` — `iris_scripts` store and `iris_script_history`.
- `src/lib/scriptSeeds.ts` — seed userscripts (Zhihu unwrap, arXiv links, GitHub ↔ DeepWiki).
- `src/content/gmBridge.ts` — `GM_*` bridge and `GM_log` buffer.
- `src/lib/scriptTools.ts` — `list_scripts` / `write_script` / `toggle_script` / `reload_tab` / `read_console`.
- `src/sidepanel/components/ScriptsTab.tsx`, `vite.config.ts` (dev server bound to 127.0.0.1).
- `.ea/spec/scripts.md`.

## Tasks
- [x] Parse userscript headers and store sources, upserting by `@name`.
- [x] Register enabled scripts in the service worker on startup and after every write.
- [x] Implement the listed `GM_*` grants through a content-script bridge; always inject `GM_log`.
- [x] Seed three userscripts replacing the removed built-in site enhancements.
- [x] Add agent script tools.
- [x] Add a Scripts tab: list (current-URL matches first), enable switch, read-only preview, history, import/export/delete.

## Acceptance
- [x] A script saved by `write_script` keeps running after the side panel closes.
- [x] Registration failure (Allow user scripts off) is shown on the Scripts tab; the script stays saved.
- [x] Import/export round-trips `.user.js` text including unknown `@` lines.

## Boundaries
- Never: invent a new header or a full `GM_*` clone; no script editor in the tab.
- Never: derive FAB rows from scripts.

## Outcome
Status: done, shipped in 0.4.0. Commits `d8b5f99`, `df888d8`.
