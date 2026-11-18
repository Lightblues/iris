# Roadmap

Iris is the assistant of the user's own browser, and a relay through which outside agents (via sonar) read his logged-in browsers. Driving the agent browser on xh-mini-m1 is CDP, not a larger relay (D013). Everything else is an entry point to those two or a thin tool kept running. What it is today: [docs/spec.md](docs/spec.md). Stages are labelled by version because each ships as one release people install (D001): fixes and small improvements are patches on the current minor (0.6.x), and a minor version is one planned round of refactoring and new capability, released once when the round is done.

## Done

- 0.6.1 (2026-10-28): the one-command install and self-reload.
- 0.6.2 (2026-10-28): fixed the settings overwrite and the sync push loop.
- 0.6.x, on beta, not yet a release (whether to cut 0.6.3 now is baton #93, waiting on the user):
  - settings sync by backup and restore (D009)
  - the web app as an iOS PWA
  - Tabs view mirrors the other browsers' open tabs (iris-033, D010)
  - a page outline on long pages (iris-034, D011)
  - dev setup: Node 24, `paseo.json`, secrets from the store, web dev off forge's port

## 0.7: core first, docs and settings in order (now)

Done when: the agent-experience items from the [positioning review](log/2026-10-30-positioning-review.md) are done and 0.7.0 is released. Until then patches stay on 0.6.x. Status 2026-11-18: the round except agent experience is done; AX-1+2, AX-3+4, and AX-5+6 are filed; AX-9 is narrowed by D013 and not filed as a driver.

- [x] Docs and process: forge `.ea` layout (this roadmap, [docs/README.md](docs/README.md), [log/decisions.md](log/decisions.md)); every behavior change updates `docs/` in the same commit; skeleton done 2026-10-29
- [x] Positioning review (agent-native): keep / fold / drop for every surface and tool; Bookmarks, Reading list, Notes, Tracing kept behind "More" and not developed (iris-024, D006, D003)
- [x] Code review for legacy, not a rewrite: dead code (the unused `SettingsPanel.tsx`), `vesta` leftovers, oversized `SettingsPage.tsx`, `agentToolCatalog.ts`, `background/index.ts` split module by module with tests passing (iris-025, D002)
- [x] Relay hardening: half-open sockets detected on the server (calls hung while the device looked connected, 2026-10-28) (iris-027); per-field edit times for settings instead of push time (iris-028, D007); device version (0.6.1) and health in `/devices`; headless Chromium smoke tests on devcloud and real-browser checks on xh-mini-m1 (control level) over the relay (iris-029)
- [x] UI: layouts agreed as ASCII in docs before code, current layout in [docs/ui.md](docs/ui.md); Settings rebuilt to the accepted [layout](log/2026-10-29-settings-layout.md) (iris-026, D005)
- [x] Users in the schema: `users` table, per-user device tokens and keys, `user_id` keys every record; one user (`me`) in practice, no sign-up, no billing (iris-030, D004)
- [x] Landing page at the `iris.easonsi.site` root (what Iris is, the install command, screenshots), web app with login and devices page; the API stays where it is (iris-031)
- [x] Rolling beta channel for testing between releases (D008)
- [ ] Agent experience, the core surface: the AX items below
- [ ] AX-1 and AX-2: trim the five remaining overlapping tools and fix descriptions (iris-035, baton #84; iris-025 already dropped the dead ones)
- [ ] AX-3 and AX-4: one page read, and long chats within a token budget (iris-036, baton #86)
- [ ] AX-5 and AX-6: errors that point to a fix, and `web_search` only with a key (iris-037, baton #88)
- [x] AX-7 MCP leftovers in the chat (iris-025)
- [ ] AX-8 Entry points that skip the agent (not filed)
- [ ] AX-9 Relay read path only: background `browser.fetch`, drop unprefixed aliases (D013; the control-method fold is out of scope; not filed)
- [ ] AX-10 Model switching (not filed)
- [ ] Release 0.7.0 (baton #93 asks whether to cut 0.6.3 from beta first; waiting on the user)

## Later

- Google sign-in on top of the 0.7 user schema, invite only (D004).
- A zip export of Iris's own data, when asked.

## Log

- [2026-10-29 settings layout](log/2026-10-29-settings-layout.md): Settings grouped by task, localhost relay and MCP under Developer (D005).
- [2026-10-30 positioning review](log/2026-10-30-positioning-review.md): keep / fold / drop for every surface, tool, and relay method; AX-1 to AX-10 (D006).
- [2026-11-06 tabs across devices](log/2026-11-06-tabs-across-devices.md): the Tabs view shows the other browsers' open tabs; built as the mirror only (D010).
- [2026-11-07 page outline](log/2026-11-07-page-toc.md): a table of contents on long pages, prompts on chat sites; one reading aid allowed beside the entry points (D011).
- 2026-11-17: no API key test button. Filling the key already fetches the model list (D012).
- 2026-11-18: the relay reads logged-in browsers; xh-mini-m1 is driven over CDP (D013). AX-1+2, AX-3+4, AX-5+6 filed as iris-035, iris-036, iris-037.
