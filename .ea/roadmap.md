# Roadmap

Iris is the browser-side agent of the ea system: an agent that works on the page in front of the user, and a relay through which outside agents (via sonar) read and act in the user's logged-in browsers. Everything else is an entry point to those two or a thin tool kept running. What it is today: [docs/spec.md](docs/spec.md).

Versioning (D001): fixes and small improvements are patches on the current minor (0.6.x). A minor version is one planned round of refactoring and new capability, released once when the round is done.

## 0.6.x (current)

Patches only. 0.6.1 added the one-command install and self-reload; 0.6.2 fixed the settings overwrite and the sync push loop.

## 0.7: core first, docs and settings in order

Status 2026-10-30: done except item 4. Done: docs (1), review accepted as D006 (2), cleanup iris-025 (3), relay hardening iris-027/028/029 (5), settings iris-026 (6), users schema iris-030 (7), web app with landing, login, and devices page iris-031 (8); beta channel D008. Left: agent experience (4), from AX-1 to AX-10 in `log/2026-10-30-positioning-review.md` (AX-7 and part of AX-1/AX-9 already done in iris-025). Then release 0.7.0.

One minor for the whole round below. Order matters: positioning decides what the refactor keeps.

1. **Docs and process.** Forge `.ea` layout: this roadmap, [docs/README.md](docs/README.md), [log/decisions.md](log/decisions.md). Every behavior change updates `docs/` in the same commit. Done 2026-10-29 for the skeleton.
2. **Positioning review (agent-native).** Go through every surface and tool with one question: does it serve the agent on the current page, or the relay for outside agents? Output: a log entry with keep / fold / drop per item, then a decision. Bookmarks, Reading list, Notes, Tracing are kept behind the "More" menu and not developed (D003).
3. **Code review for legacy.** Not a rewrite (D002). Find dead code (e.g. the unused `SettingsPanel.tsx`), leftovers of retired pieces (`vesta`), oversized files (`SettingsPage.tsx`, `agentToolCatalog.ts`, `background/index.ts`), and split or delete module by module, each with tests passing.
4. **Agent experience.** The core surface: tool set and descriptions, page reading, long-chat behavior, errors shown to the user, model switching. Concrete items come out of step 2.
5. **Relay hardening.** Detect a half-open socket on the server (calls hung while the device looked connected, 2026-10-28); settings carry a per-field edit time instead of push time; device version and health in `/devices` (version done in 0.6.1). End-to-end checks: headless Chromium on devcloud for smoke tests, xh-mini-m1 (control level) for real-browser checks over the relay.
6. **UI.** Layouts are agreed as ASCII in docs before code. Current layout: [docs/ui.md](docs/ui.md). Settings layout accepted: [log/2026-10-29-settings-layout.md](log/2026-10-29-settings-layout.md) (D005).
7. **Users in the schema.** `users` table and per-user device tokens and keys; `user_id` already keys every record. One user (`me`) in practice. No sign-up, no billing (D004).
8. **Landing page.** `iris.easonsi.site` root: what Iris is, the install command, screenshots. The API stays where it is.

## Later

- Google sign-in on top of the 0.7 user schema, invite only.

## Open questions

- Settings: a "test" button next to the API key that calls `/v1/models`?
