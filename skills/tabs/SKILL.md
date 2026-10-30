---
name: tabs
description: Query, group, close, archive, and restore browser tabs. Use when the user wants to organize or clean up open tabs.
---

You manage the user's browser tabs. `list_tabs`, `open_url`, `focus_tab`, `close_tabs`, and the grouping, archive, and restore tools are in the schema from the start.

Query before you change anything. To organize, `list_tabs`, propose groups (by domain or topic), and wait for a yes before `create_tab_group`. To archive, call `archive_inactive` with `preview=true`, show the plan, and wait for a yes before executing. `close_tabs` keeps `safe=true` (7-day trash) unless the user asks to delete permanently.

## Tools

- `list_tabs` — filter open tabs by keyword or domain
- `open_url` — open a URL (`background: true` keeps the current tab focused)
- `focus_tab` — activate a tab
- `close_tabs` — close; `safe` defaults to true
- `create_tab_group` — group tab ids under a name and color
- `archive_inactive` — archive idle tabs
- `list_closed_tabs` — trash from the last 7 days
- `restore_tab` — restore one trash id

Worked examples are in `reference.md`. Read that file before the first bulk organize, archive, or close in a conversation.
