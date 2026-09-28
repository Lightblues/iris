export type ScriptKind = 'user' | 'agent'
export type WebmcpPerm = 'allow' | 'prompt' | 'deny'

export interface ScriptMeta {
  kind: ScriptKind
  name: string
  description: string
  version: string
  matches: string[]
  excludes: string[]
  runAt: 'document_start' | 'document_end' | 'document_idle'
  world: 'MAIN' | 'USER_SCRIPT'
  grants: string[]
  connect: string[]
  requires: string[]
  resources: string[]
  webmcp: Record<string, WebmcpPerm>
  unsupported: string[]
}

const UNSUPPORTED_GRANTS = new Set([
  'GM_download',
  'GM_cookie',
  'GM_registerMenuCommand',
  'GM_unregisterMenuCommand',
  'GM_notification',
  'GM_getResourceText',
  'GM_getResourceURL',
  'GM_addElement',
  'GM_getTab',
  'GM_saveTab',
  'GM_getTabs',
  'GM_addValueChangeListener',
  'GM_setValues',
  'GM_getValues',
  'GM_deleteValues',
  'CM_findElement',
  'CM_findExternalElement',
  'CM_promptAI',
  'CM_devtools',
  'CM_withDevtools',
])

export function parseScript(source: string): ScriptMeta | { error: string } {
  const start = source.indexOf('==UserScript==')
  const agent = source.indexOf('==AgentScript==')
  const at = start === -1 ? agent : agent === -1 ? start : Math.min(start, agent)
  if (at === -1) return { error: 'Missing ==UserScript== or ==AgentScript== header' }
  const kind: ScriptKind = source.slice(at, at + 20).includes('AgentScript') ? 'agent' : 'user'
  const endToken = kind === 'agent' ? '==/AgentScript==' : '==/UserScript=='
  const end = source.indexOf(endToken, at)
  if (end === -1) return { error: `Missing ${endToken}` }

  const block = source.slice(at, end)
  const grants: string[] = []
  const matches: string[] = []
  const excludes: string[] = []
  const connect: string[] = []
  const requires: string[] = []
  const resources: string[] = []
  const webmcp: Record<string, WebmcpPerm> = {}
  let name = ''
  let description = ''
  let version = '1.0.0'
  let runAt: ScriptMeta['runAt'] = 'document_idle'
  let injectPage = false

  for (const line of block.split('\n')) {
    const m = line.match(/@([a-zA-Z-]+)\s*(.*)$/)
    if (!m || !line.trim().startsWith('//')) continue
    const key = m[1]
    const value = m[2].trim()
    if (key === 'name' && value) name = value
    else if (key === 'description') description = value
    else if (key === 'version' && value) version = value
    else if (key === 'match' && value) matches.push(value)
    else if (key === 'exclude' && value) excludes.push(value)
    else if (key === 'grant' && value && value !== 'none') grants.push(value)
    else if (key === 'connect' && value) connect.push(value)
    else if (key === 'require' && value) requires.push(value)
    else if (key === 'resource' && value) resources.push(value)
    else if (key === 'run-at') {
      if (value === 'document-start') runAt = 'document_start'
      else if (value === 'document-end') runAt = 'document_end'
      else runAt = 'document_idle'
    } else if (key === 'inject-into' && value === 'page') injectPage = true
    else if (key === 'webmcp') {
      const parts = value.split(/\s+/)
      const perm = parts[1] as WebmcpPerm
      if (parts[0] && (perm === 'allow' || perm === 'prompt' || perm === 'deny')) webmcp[parts[0]] = perm
    }
  }

  if (!name) return { error: '@name is required' }
  const validMatches = matches.filter(isMatchPattern)
  if (validMatches.length === 0) return { error: '@match is missing or is not a Chrome match pattern' }

  const unsupported = [
    ...grants.filter(g => UNSUPPORTED_GRANTS.has(g)),
    ...(resources.length ? ['@resource'] : []),
  ]

  return {
    kind,
    name,
    description,
    version,
    matches: validMatches,
    excludes: excludes.filter(isMatchPattern),
    runAt,
    world: kind === 'agent' || injectPage ? 'MAIN' : 'USER_SCRIPT',
    grants,
    connect,
    requires,
    resources,
    webmcp,
    unsupported,
  }
}

/** Chrome match pattern: scheme://host/path */
export function isMatchPattern(pattern: string): boolean {
  return /^(\*|https?|file):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/.test(pattern)
}

export function urlMatches(pattern: string, url: string): boolean {
  const m = pattern.match(/^(\*|https?|file):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/)
  if (!m) return false
  const [, scheme, host, path] = m
  const schemeRe = scheme === '*' ? 'https?' : scheme
  let hostRe: string
  if (host === '*') hostRe = '[^/]+'
  else if (host.startsWith('*.')) hostRe = '(?:[^/]+\\.)+' + escapeRe(host.slice(2))
  else hostRe = escapeRe(host)
  const pathRe = escapeRe(path).replace(/\\\*/g, '.*')
  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`).test(url)
}

export function scriptMatchesUrl(meta: ScriptMeta, url: string): boolean {
  if (meta.excludes.some(p => urlMatches(p, url))) return false
  return meta.matches.some(p => urlMatches(p, url))
}

function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\*]/g, '\\$&')
}

export function connectAllows(patterns: string[], target: string): boolean {
  let host = ''
  try { host = new URL(target).hostname } catch { return false }
  return patterns.some(p => {
    if (p === '*') return true
    if (p.startsWith('*.')) return host === p.slice(2) || host.endsWith(p.slice(1))
    return host === p
  })
}
