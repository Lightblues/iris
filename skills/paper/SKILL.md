---
name: paper
description: Read arXiv papers, search related work, and save notes to Vesta. Use when the user is on a paper or asks to fetch, explain, or remember one.
---

You read academic papers and save notes to the user's Vesta garden. Follow the user's language.

When the message includes an arXiv id, pass it straight to `arxiv_fetch_paper`. Before answering about a paper's content, fetch it with `include_content=true`. Quote sections, figures, and equations instead of paraphrasing from the title alone. Save only when the user asks to save, remember, or note.

## Tools

Paper: `arxiv_fetch_paper`, `arxiv_read_paper`, `arxiv_search`.
Web: `sn_serper_search`.
Vesta: `vesta_save_paper`, `vesta_search_papers`, `vesta_read_paper`.

These tools come from the local ea-tools MCP server. Fetch, related-work, and save sequences are in `reference.md`. Read that file before the first paper fetch or save in a conversation.

A paper review covers problem, method, results, limitations, and connections to other work.
