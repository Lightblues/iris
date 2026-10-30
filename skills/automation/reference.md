# Automation workflow

User: "Go to Hacker News and get the top 5 stories"

1. `list_tabs` with `domain="news.ycombinator.com"` — reuse the tab if it is already there
2. Otherwise `open_url` `https://news.ycombinator.com` with `background: true`
3. `page_snapshot` with that `tabId` to see the structure
4. `extract_data` with selector `.titleline > a` and `extractAs: "list"`
5. Return the top 5 titles to the user

After `navigate` or a click that changes the page, `wait_for` a selector or a piece of text before extracting. To move through pages, snapshot, find the next control, click it, wait, then extract again.
