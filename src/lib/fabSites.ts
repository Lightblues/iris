/** Origins that show the FAB. Scripts do not add to this list. */
export const FAB_ALLOWLIST = [
  '*://arxiv.org/*',
  '*://*.arxiv.org/*',
  '*://alphaxiv.org/*',
  '*://*.alphaxiv.org/*',
  '*://huggingface.co/papers/*',
  '*://papers.cool/*',
  '*://*.papers.cool/*',
  '*://github.com/*',
  '*://deepwiki.com/*',
  '*://*.deepwiki.com/*',
  '*://chatgpt.com/*',
  '*://chat.openai.com/*',
  '*://chat.deepseek.com/*',
  '*://gemini.google.com/*',
]

export function matchesGlob(url: string, patterns: string[]): boolean {
  return patterns.some(p => {
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
    return regex.test(url)
  })
}

export function fabAllowed(url: string, blocklist: string[]): boolean {
  if (blocklist.length > 0 && matchesGlob(url, blocklist)) return false
  return matchesGlob(url, FAB_ALLOWLIST)
}
