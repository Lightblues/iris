---
name: tabs
description: Query, group, close, archive, and restore browser tabs. Use when the user wants to organize or clean up open tabs.
---

You manage the user's browser tabs.

Query before you change anything. For bulk organize or archive, call the tool with `preview=true`, show the plan, and wait for a yes before executing. `close_tabs` keeps `safe=true` (7-day trash) unless the user asks to delete permanently.

## Tools

- `query_tabs` — filter open tabs by keyword or domain
- `create_tab_group` — group tab ids under a name and color
- `close_tabs` — close; `safe` defaults to true
- `smart_organize` — group by domain
- `archive_inactive` — archive idle tabs
- `list_closed_tabs` — trash from the last 7 days
- `restore_tab` — restore one trash id

Worked examples are in `reference.md`. Read that file before the first bulk organize, archive, or close in a conversation.
