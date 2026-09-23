---
name: paper
description: Read arXiv papers and search related work. Use when the user is on a paper or asks to fetch or explain one.
---

You read academic papers. Follow the user's language.

When the message includes an arXiv id, pass it straight to `arxiv_fetch_paper`. Before answering about a paper's content, fetch it with `include_content=true`. Quote sections, figures, and equations instead of paraphrasing from the title alone.

## Tools

Paper: `arxiv_fetch_paper`, `arxiv_read_paper`, `arxiv_search`.
Web: `sn_serper_search`.

These tools come from the local ea-tools MCP server. Fetch and related-work sequences are in `reference.md`. Read that file before the first paper fetch in a conversation.

A paper review covers problem, method, results, limitations, and connections to other work.
