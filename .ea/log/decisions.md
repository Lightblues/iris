# Decisions

Append-only. To reverse one, add an entry that names it and set the old one's status to `superseded by D0xx`.

## D001 Patches for fixes, one minor per planned round (2026-10-29)

Status: accepted

Fixes and small improvements ship as patches on the current minor. A minor version (0.7, 0.8, …) is one planned round of refactoring or new capability from the roadmap and is released once, when the round is done. Alternative rejected: a minor per theme (docs, relay, UI), which inflates versions for work that belongs together.

## D002 Refactor by module, no rewrite (2026-10-29)

Status: accepted

The sync, relay, and server code is recent and covered by tests; the debt is breadth (ten side-panel tabs, a 700-line settings page) and leftovers from retired pieces. Review module by module, delete dead code, split oversized files, keep tests green at each step. Alternative rejected: a rewrite of the extension shell, which would reset working behavior (per-tab sessions, side-panel workarounds) for no gain the positioning review has not yet justified.

## D003 Secondary tools stay, not developed (2026-10-29)

Status: accepted

Bookmarks, Reading list, Notes, and Tracing stay behind the "More" menu: kept working, bugs fixed, no new features. The FAB, the command palette, and the side panel are all entry points in use and stay. Development effort goes to the agent and the relay.

## D004 Users as schema only (2026-10-29)

Status: accepted

0.7 adds a `users` table and per-user credentials on the server, with every record already keyed by `user_id`. No sign-up, no billing; a Google sign-in, invite only, may come later on the same schema. Alternative rejected: building login now, for a tool that is personal and shared privately at most.

## D005 Settings grouped by task; localhost relay and MCP parked under Developer (2026-10-30)

Status: accepted

Settings follow `log/2026-10-29-settings-layout.md`: a status strip, then Model, Tools, This browser (not synced), Pages, and a collapsed Developer section. The localhost ea-tools relay and the MCP endpoint move to Developer and stay unused; they are tested and improved only when a need appears. Alternative rejected: deleting them now, which would have to be rebuilt if a local agent needs them.

## D006 Two jobs: the page agent and the relay (2026-10-30)

Status: accepted

Iris has two jobs: the side-panel agent on the current page, and the relay through which outside agents use the same tool catalog. Everything else is an entry point or a thin tool kept working (D003). Capture is no longer a pillar of its own; it stays local and leaves through the relay exports. The keep / fold / drop verdicts in `log/2026-10-30-positioning-review.md` are accepted as written: drops go to iris-025, folds and the agent-experience items (AX-1 to AX-10) become 0.7 item 4 issues. Alternative rejected: keeping "sensor" as a second product line, which justified surfaces (Tabs, tab heuristics, duplicate relay methods) that neither job needs.

## D007 Settings resolve by per-field edit time (2026-10-30)

Status: accepted

Each setting carries the time a person last edited it, and settings are always pushed without a base so the server keeps the later edit. On 2026-10-28 a stale panel wrote defaults back over the API key: its push had a matching base, so it fast-forwarded although nobody had edited the key. Trade-off: settings become last-writer-wins by device clock, so a clock far ahead can win a race; settings are edited rarely and by one person, so this is accepted. Alternative rejected: a server-side rule for settings, which would leave the client sending push time as edit time.

## D008 Rolling beta for testing between releases (2026-10-30)

Status: accepted

Every extension change pushed to `main` is built by CI into a rolling `beta` pre-release (manifest version `<package version>.<run number>`, `version_name` `<version>-beta.<run> (<sha>)`). The user's Mac runs `install.sh beta --watch`: a launchd job installs a new beta within five minutes and Iris reloads itself, so agents change code and the user tests the same build a release would ship, with no setup per change. Releases stay as D001 says. Alternatives not taken now: a browser sandbox (AGS) or headless runs for UI judgement, which cannot replace the user's own logged-in browser; they remain for automated checks (iris-029).
