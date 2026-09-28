import type { Experimental_DownloadFunction as DownloadFunction } from 'ai'

/**
 * AI SDK treats every file `url` as a remote asset and refuses non-http(s)
 * schemes. Chat images are data URLs already on the message; returning null
 * lets the SDK decode them instead of fetching.
 */
export const downloadChatAssets: DownloadFunction = async (requested) => {
  return Promise.all(requested.map(async ({ url, isUrlSupportedByModel }) => {
    if (url.protocol === 'data:' || isUrlSupportedByModel) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Cannot download ${url.protocol} URL`)
    }
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download ${url.href}: ${response.status} ${response.statusText}`)
    }
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      mediaType: response.headers.get('content-type') ?? undefined,
    }
  }))
}
