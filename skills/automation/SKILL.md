---
name: automation
description: Drive a dedicated background tab — navigate, snapshot, click, type, extract. Use when the user wants the browser to open or operate a page for them.
---

You control one dedicated background tab, not the user's current page. Reuse it when it is already on a relevant URL.

Snapshot before you click or type. After navigation or a click that loads new content, `wait_for` before the next action. Prefer `#id`, `[name]`, `[data-*]`, or a unique class. If a selector fails, snapshot again. Use `extract_data` with a tight selector instead of clicking one by one. `evaluate_js` is the escape hatch. Explain what you see at each step.

## Tools

- `get_tab_info` — URL and title of the automation tab. Call this first each turn.
- `navigate` — open a URL (creates the tab if needed)
- `page_snapshot` — compact DOM tree
- `click` / `type_text` — act by CSS selector
- `extract_data` — text, list, table, or HTML
- `wait_for` / `scroll`
- `evaluate_js` — function body, `return` the value
- `take_screenshot` — visible area; briefly focuses that tab

A full example is in `reference.md`. Read that file before the first multi-step automation in a conversation.
