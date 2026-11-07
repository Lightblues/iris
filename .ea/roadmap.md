# Roadmap

Iris is the browser-side agent of the ea system: an agent that works on the page in front of the user, and a relay through which outside agents (via sonar) read and act in the user's logged-in browsers. Everything else is an entry point to those two or a thin tool kept running. What it is today: [docs/spec.md](docs/spec.md). Stages are labelled by version because each ships as one release people install (D001): fixes and small improvements are patches on the current minor (0.6.x), and a minor version is one planned round of refactoring and new capability, released once when the round is done.

## Done

- 0.6.1 (2026-10-28): the one-command install and self-reload.
- 0.6.2 (2026-10-28): fixed the settings overwrite and the sync push loop.

## 0.7: core first, docs and settings in order (now)

Done when: the agent-experience items AX-1 to AX-10 from the [positioning review](log/2026-10-30-positioning-review.md) are done and 0.7.0 is released. Until then patches stay on 0.6.x. One minor for the whole round; order matters, because positioning decides what the refactor keeps. Status 2026-10-30: done except agent experience.

- [x] Docs and process: forge `.ea` layout (this roadmap, [docs/README.md](docs/README.md), [log/decisions.md](log/decisions.md)); every behavior change updates `docs/` in the same commit; skeleton done 2026-10-29
- [x] Positioning review (agent-native): keep / fold / drop for every surface and tool; Bookmarks, Reading list, Notes, Tracing kept behind "More" and not developed (iris-024, D006, D003)
- [x] Code review for legacy, not a rewrite: dead code (the unused `SettingsPanel.tsx`), `vesta` leftovers, oversized `SettingsPage.tsx`, `agentToolCatalog.ts`, `background/index.ts` split module by module with tests passing (iris-025, D002)
- [x] Relay hardening: half-open sockets detected on the server (calls hung while the device looked connected, 2026-10-28) (iris-027); per-field edit times for settings instead of push time (iris-028, D007); device version (0.6.1) and health in `/devices`; headless Chromium smoke tests on devcloud and real-browser checks on xh-mini-m1 (control level) over the relay (iris-029)
- [x] UI: layouts agreed as ASCII in docs before code, current layout in [docs/ui.md](docs/ui.md); Settings rebuilt to the accepted [layout](log/2026-10-29-settings-layout.md) (iris-026, D005)
- [x] Users in the schema: `users` table, per-user device tokens and keys, `user_id` keys every record; one user (`me`) in practice, no sign-up, no billing (iris-030, D004)
- [x] Landing page at the `iris.easonsi.site` root (what Iris is, the install command, screenshots), web app with login and devices page; the API stays where it is (iris-031)
- [x] Rolling beta channel for testing between releases (D008)
- [ ] Agent experience, the core surface (tool set and descriptions, page reading, long-chat behavior, errors shown to the user, model switching): the AX items below, each its own issue
- [ ] AX-1 Tool schema size and overlap (partly done in iris-025)
- [ ] AX-2 Descriptions that contradict behavior
- [ ] AX-3 One page reader
- [ ] AX-4 Long chats
- [ ] AX-5 Errors shown to the user
- [ ] AX-6 `web_search` without a key
- [x] AX-7 MCP leftovers in the chat (iris-025)
- [ ] AX-8 Entry points that skip the agent
- [ ] AX-9 Relay overlap and focus (partly done in iris-025)
- [ ] AX-10 Model switching
- [ ] Release 0.7.0

## Later

- Google sign-in on top of the 0.7 user schema, invite only (D004).
- A zip export of Iris's own data, when asked.

## Log

- [2026-10-29 settings layout](log/2026-10-29-settings-layout.md): Settings grouped by task, localhost relay and MCP under Developer (D005).
- [2026-10-30 positioning review](log/2026-10-30-positioning-review.md): keep / fold / drop for every surface, tool, and relay method; AX-1 to AX-10 (D006).
- [2026-11-06 tabs across devices](log/2026-11-06-tabs-across-devices.md): the Tabs view shows the other browsers' open tabs; built as the mirror only (D010).
- [2026-11-07 page outline](log/2026-11-07-page-toc.md): a table of contents on long pages, prompts on chat sites; one reading aid allowed beside the entry points (D011).

## Open questions

- **API key test button**: whether Settings gets a "test" button next to the API key that calls `/v1/models`.
