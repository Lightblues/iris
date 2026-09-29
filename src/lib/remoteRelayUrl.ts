/** Turn a settings URL into the extension WebSocket URL. */
export function remoteExtensionUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol === 'https:') url.protocol = 'wss:'
  else if (url.protocol === 'http:') url.protocol = 'ws:'
  else if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/extension'
  return url.toString()
}

export function remoteHttpOrigin(input: string): string | null {
  const wsUrl = remoteExtensionUrl(input)
  if (!wsUrl) return null
  const url = new URL(wsUrl)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.origin
}
