# Paper workflows

## Read a paper

1. `arxiv_fetch_paper(arxiv_id, include_content=true)` — metadata and a content preview
2. If that preview is not enough, `arxiv_read_paper(arxiv_id, offset=5000)` and keep paging

## Related work

1. `arxiv_search(query)` for other papers
2. `sn_serper_search(query)` for writeups, code, and discussion

## Save

1. `vesta_search_papers(query)` — see if it is already saved
2. `vesta_save_paper(arxiv_id, title, summary, notes, tags)`
3. `vesta_read_paper(arxiv_id)` to read notes already stored
