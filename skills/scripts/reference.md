# Script reference

## Userscript

```javascript
// ==UserScript==
// @name         github-deepwiki
// @namespace    https://iris.local
// @version      1.0.0
// @description  Add a DeepWiki link to the GitHub repo header
// @match        *://github.com/*
// @run-at       document-idle
// @grant        GM_log
// ==/UserScript==

(function () {
  function repoSlug() {
    const parts = location.pathname.split('/').filter(Boolean)
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null
  }

  function mount() {
    const slug = repoSlug()
    const nav = document.querySelector('.AppHeader-context, nav[aria-label="Repository"]')
    if (!slug || !nav || nav.querySelector('.iris-deepwiki')) return
    const a = document.createElement('a')
    a.className = 'iris-deepwiki'
    a.textContent = 'DeepWiki'
    a.href = `https://deepwiki.com/${slug}`
    a.style.marginLeft = '8px'
    nav.appendChild(a)
    GM_log(`deepwiki link for ${slug}`)
  }

  mount()
  // GitHub navigates without a reload; re-mount on DOM churn.
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true })
})()
```

Notes worth copying: guard against double-mounting with a class check, re-run on SPA navigation, and keep `@grant` to what the script actually calls.

## AgentScript

```javascript
// ==AgentScript==
// @name         github-pr-tools
// @namespace    https://iris.local
// @version      1.0.0
// @description  Read the current pull request without scraping it by hand
// @match        *://github.com/*/pull/*
// @run-at       document-idle
// @webmcp       gh_pr_files allow
// @webmcp       gh_pr_comment prompt
// @grant        GM_log
// ==/AgentScript==

document.modelContext.registerTool({
  name: 'gh_pr_files',
  description: 'List the files changed in the pull request on this page.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: async () => {
    const rows = [...document.querySelectorAll('.file-header[data-path]')]
    return {
      pr: location.pathname,
      files: rows.map(row => ({
        path: row.getAttribute('data-path'),
        additions: row.querySelector('.color-fg-success')?.textContent?.trim() ?? null,
      })),
    }
  },
})

document.modelContext.registerTool({
  name: 'gh_pr_comment',
  description: 'Post a comment on this pull request.',
  inputSchema: {
    type: 'object',
    properties: { body: { type: 'string', description: 'Markdown comment body' } },
    required: ['body'],
  },
  execute: async ({ body }) => {
    const box = document.querySelector('textarea#new_comment_field')
    if (!box) throw new Error('comment box not found')
    box.value = body
    box.dispatchEvent(new Event('input', { bubbles: true }))
    GM_log('comment staged, not submitted')
    return { staged: true }
  },
})
```

The read tool is `allow`; the writing one is `prompt`, so it comes back as `needs_confirmation` before it runs. Throwing inside `execute` surfaces the message as the tool error — use it for missing selectors instead of returning a silent empty result.

## A script does not run

Work down this list:

1. `list_scripts` — is it there, is `enabled` true, and is `unsupported` empty? An `error` field means the header failed to parse; fix `@name` or `@match`.
2. Does `@match` really cover the URL? A pattern needs `scheme://host/path` — `*://github.com` without the trailing `/*` never matches.
3. Was the tab open before the write? `reload_tab`, then retry.
4. Add `GM_log` at the top of the script, reload, `read_console`. Nothing at all means it never injected; a log then silence means a selector failed.
5. `document-idle` may still be too early for a lazy page. Poll with a `MutationObserver` rather than moving to `document-start`.
6. Chrome's **Allow user scripts** toggle must be on for the unpacked extension, and the extension reloaded after turning it on. Registration errors from this are shown on the Scripts tab — tell the user to check there when nothing injects at all.
7. AgentScript tool missing from `load_tools({ groups: ["site"] })`? Check for a `@webmcp <name> <perm>` line matching the tool name exactly, and that the name does not collide with a tool the site registers.
