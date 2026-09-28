export const SEED_SCRIPTS: { id: string; source: string }[] = [
  {
    id: 'seed-zhihu',
    source: `// ==UserScript==
// @name         zhihu-unwrap
// @namespace    https://iris.local
// @version      1.0.0
// @description  Strip Zhihu notification prefixes and open outbound links directly
// @match        *://*.zhihu.com/*
// @match        *://zhihu.com/*
// @match        *://link.zhihu.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(function () {
  var TITLE = /^[（(]\\d+\\+?[^）)]*(?:私信|消息)[^）)]*[）)]\\s*/
  function unwrap(href) {
    try {
      var u = new URL(href)
      if (u.hostname !== 'link.zhihu.com') return null
      var target = u.searchParams.get('target')
      if (!target) return null
      var dest = new URL(target)
      if (dest.protocol !== 'http:' && dest.protocol !== 'https:') return null
      return dest.href
    } catch (e) { return null }
  }
  function cleanTitle() {
    var next = document.title.replace(TITLE, '')
    if (next !== document.title) document.title = next
  }
  function rewrite(anchor) {
    var next = unwrap(anchor.href)
    if (next && anchor.href !== next) anchor.href = next
  }
  var here = unwrap(location.href)
  if (here) { location.replace(here); return }
  if (location.hostname !== 'zhihu.com' && !location.hostname.endsWith('.zhihu.com')) return
  cleanTitle()
  var root = document.documentElement
  if (!root) return
  root.querySelectorAll('a[href*="link.zhihu.com"]').forEach(rewrite)
  var titleEl = document.querySelector('title')
  if (titleEl) new MutationObserver(cleanTitle).observe(titleEl, { childList: true, characterData: true, subtree: true })
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === 'attributes' && m.target instanceof HTMLAnchorElement) { rewrite(m.target); return }
      m.addedNodes.forEach(function (node) {
        if (node instanceof HTMLAnchorElement) rewrite(node)
        else if (node instanceof Element) node.querySelectorAll('a[href*="link.zhihu.com"]').forEach(rewrite)
      })
    })
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] })
  function onPointer(e) {
    var node = e.target instanceof Element ? e.target : e.target && e.target.parentElement
    var anchor = node && node.closest && node.closest('a')
    if (anchor) rewrite(anchor)
  }
  document.addEventListener('mousedown', onPointer, true)
  document.addEventListener('click', onPointer, true)
  document.addEventListener('auxclick', onPointer, true)
})()
`,
  },
  {
    id: 'seed-arxiv',
    source: `// ==UserScript==
// @name         arxiv-hosts
// @namespace    https://iris.local
// @version      1.0.0
// @description  Jump between arXiv, alphaXiv, papers.cool, and Hugging Face
// @match        *://arxiv.org/*
// @match        *://*.arxiv.org/*
// @match        *://alphaxiv.org/*
// @match        *://*.alphaxiv.org/*
// @match        *://huggingface.co/papers/*
// @match        *://papers.cool/*
// @grant        none
// ==/UserScript==

(function () {
  var m = location.href.match(/(?:arxiv\\.org\\/(?:abs|html|pdf|ftp)|alphaxiv\\.org\\/abs|huggingface\\.co\\/papers|papers\\.cool\\/arxiv)\\/(\\d+\\.\\d+)/i)
  if (!m || document.getElementById('iris-arxiv-links')) return
  var id = m[1]
  var bar = document.createElement('div')
  bar.id = 'iris-arxiv-links'
  bar.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;display:flex;gap:8px;padding:6px 8px;background:#111;color:#fff;border-radius:8px;font:12px/1.2 sans-serif'
  var links = [
    ['arXiv', 'https://arxiv.org/abs/' + id],
    ['alphaXiv', 'https://www.alphaxiv.org/abs/' + id],
    ['papers.cool', 'https://papers.cool/arxiv/' + id],
    ['HuggingFace', 'https://huggingface.co/papers/' + id],
  ]
  links.forEach(function (pair) {
    var a = document.createElement('a')
    a.href = pair[1]
    a.textContent = pair[0]
    a.style.cssText = 'color:#9ecbff;text-decoration:none'
    bar.appendChild(a)
  })
  document.documentElement.appendChild(bar)
})()
`,
  },
  {
    id: 'seed-github',
    source: `// ==UserScript==
// @name         github-deepwiki
// @namespace    https://iris.local
// @version      1.0.0
// @description  Link a GitHub repo and its DeepWiki page
// @match        *://github.com/*/*
// @match        *://deepwiki.com/*/*
// @grant        none
// ==/UserScript==

(function () {
  if (document.getElementById('iris-repo-link')) return
  var m = location.pathname.match(/^\\/([^/]+)\\/([^/]+)/)
  if (!m) return
  var owner = m[1]
  var skip = { settings: 1, notifications: 1, new: 1, orgs: 1, marketplace: 1, explore: 1, topics: 1, trending: 1, collections: 1, events: 1, sponsors: 1, login: 1, signup: 1, pricing: 1, features: 1, security: 1, enterprise: 1, about: 1 }
  if (skip[owner.toLowerCase()]) return
  var repo = m[2]
  var onGitHub = location.hostname === 'github.com'
  var href = onGitHub ? 'https://deepwiki.com/' + owner + '/' + repo : 'https://github.com/' + owner + '/' + repo
  var a = document.createElement('a')
  a.id = 'iris-repo-link'
  a.href = href
  a.textContent = onGitHub ? 'DeepWiki' : 'GitHub'
  a.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;padding:6px 10px;background:#111;color:#9ecbff;border-radius:8px;font:12px/1.2 sans-serif;text-decoration:none'
  document.documentElement.appendChild(a)
})()
`,
  },
]
