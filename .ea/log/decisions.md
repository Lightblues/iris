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
