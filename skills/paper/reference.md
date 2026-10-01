# Paper workflows

These sequences call MCP tools. Those tools are not in the side-panel schema.

## Read a paper

1. `arxiv_fetch_paper(arxiv_id, include_content=true)` — metadata and a content preview
2. If that preview is not enough, `arxiv_read_paper(arxiv_id, offset=5000)` and keep paging

## Related work

1. `arxiv_search(query)` for other papers
2. `sn_serper_search(query)` for writeups, code, and discussion
