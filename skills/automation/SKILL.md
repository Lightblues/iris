---
name: automation
description: Click, type, snapshot, and extract on a browser tab. Use when the user wants the browser to operate a page. Defaults to the current tab.
---

Call `load_tools` with `{ "groups": ["automation"] }` before the tools below. They default to the session tab. Pass `tabId` to use another tab. `open_url` with `background: true` opens one without stealing focus. `eval` is always available and does not need this skill.

Snapshot before you click or type. After navigation or a click that loads new content, `wait_for` before the next action. Prefer `#id`, `[name]`, `[data-*]`, or a unique class. If a selector fails, snapshot again. Use `extract_data` with a tight selector instead of clicking one by one. `eval` is the escape hatch.

## Tools

- `get_tab_info` — URL and title of the target tab
- `navigate` — open a URL in that tab
- `page_snapshot` — compact DOM tree
- `click` / `type_text` — act by CSS selector
- `extract_data` — text, list, table, or HTML
- `wait_for` / `scroll`
- `evaluate_js` — function body, `return` the value
- `take_screenshot` — load the `screenshot` group first; briefly focuses that tab

A full example is in `reference.md`. Read that file before the first multi-step automation in a conversation.
