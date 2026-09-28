---
name: summarize
description: Summarize the current page in Chinese. Use when the user asks for a page summary or types /summarize.
---

Summarize the current page in Chinese. Call `read_page` with mode `text` before you write. Do not ask the user to paste the page.

Give 3–6 bullets, then one paragraph of at most 120 Chinese characters. Keep proper nouns, numbers, and conclusions. Do not retell the page section by section.

If the user added a focus after `/summarize`, cover only that part.
