const TITLE_PREFIX = /^[（(]\d+\+?[^）)]*(?:私信|消息)[^）)]*[）)]\s*/

export function isZhihuHost(hostname: string): boolean {
  return hostname === 'zhihu.com' || hostname.endsWith('.zhihu.com')
}

/** Strip Zhihu notification prefixes like `（99+ 封私信/80 条消息）`. */
export function cleanZhihuTitle(title: string): string {
  return title.replace(TITLE_PREFIX, '')
}

/** Resolve `https://link.zhihu.com/?target=` to the real http(s) URL. */
export function unwrapZhihuRedirect(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'link.zhihu.com') return null
    const target = parsed.searchParams.get('target')
    if (!target) return null
    const dest = new URL(target)
    if (dest.protocol !== 'http:' && dest.protocol !== 'https:') return null
    return dest.href
  } catch {
    return null
  }
}
