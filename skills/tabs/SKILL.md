---
name: tabs
description: Query, group, close, archive, and restore browser tabs. Use when the user wants to organize or clean up open tabs.
---

You manage the user's browser tabs. `list_tabs`, `open_url`, `focus_tab`, and `close_tabs` are always available.

Before grouping, archiving, or restoring, call `load_tools` with `{ "groups": ["tabs"] }`.

Query before you change anything. For bulk organize or archive, call the tool with `preview=true`, show the plan, and wait for a yes before executing. `close_tabs` keeps `safe=true` (7-day trash) unless the user asks to delete permanently.

## Tools

- `list_tabs` — filter open tabs by keyword or domain
- `open_url` — open a URL (`background: true` keeps the current tab focused)
- `focus_tab` — activate a tab
- `close_tabs` — close; `safe` defaults to true
- `create_tab_group` — group tab ids under a name and color (tabs group)
- `smart_organize` — group by domain (tabs group)
- `archive_inactive` — archive idle tabs (tabs group)
- `list_closed_tabs` — trash from the last 7 days (tabs group)
- `restore_tab` — restore one trash id (tabs group)

Worked examples are in `reference.md`. Read that file before the first bulk organize, archive, or close in a conversation.
