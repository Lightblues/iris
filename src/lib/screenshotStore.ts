const MAX = 20

export interface StoredScreenshot {
  mediaType: string
  data: string
}

export interface ScreenshotRef {
  imageId: string
  mediaType: string
  bytes: number
}

const shots = new Map<string, StoredScreenshot>()
const order: string[] = []

function decodeDataUrl(dataUrl: string): StoredScreenshot {
  const clean = dataUrl.replace(/\s+/g, '')
  const match = clean.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match) throw new Error('Invalid screenshot data URL')
  return { mediaType: match[1], data: match[2] }
}

export function rememberScreenshot(dataUrl: string): ScreenshotRef {
  const shot = decodeDataUrl(dataUrl)
  const imageId = crypto.randomUUID()
  if (order.length >= MAX) {
    const old = order.shift()
    if (old) shots.delete(old)
  }
  shots.set(imageId, shot)
  order.push(imageId)
  const pad = shot.data.endsWith('==') ? 2 : shot.data.endsWith('=') ? 1 : 0
  const bytes = Math.floor((shot.data.length * 3) / 4) - pad
  return { imageId, mediaType: shot.mediaType, bytes }
}

export function getScreenshot(imageId: string): StoredScreenshot | undefined {
  return shots.get(imageId)
}

export function getScreenshotDataUrl(imageId: string): string | undefined {
  const shot = shots.get(imageId)
  return shot ? `data:${shot.mediaType};base64,${shot.data}` : undefined
}

export function screenshotToModelOutput(output: unknown) {
  const row = output && typeof output === 'object' ? output as Record<string, unknown> : {}
  const shot = typeof row.imageId === 'string' ? getScreenshot(row.imageId) : undefined
  if (!shot) {
    return typeof output === 'string'
      ? { type: 'text' as const, value: output }
      : { type: 'json' as const, value: (output ?? null) as never }
  }
  const bytes = typeof row.bytes === 'number' ? row.bytes : undefined
  const size = bytes != null ? `${shot.mediaType}, ${bytes} bytes` : shot.mediaType
  return {
    type: 'content' as const,
    value: [
      { type: 'text' as const, text: `Viewport screenshot captured (${size}).` },
      { type: 'image-data' as const, data: shot.data, mediaType: shot.mediaType },
    ],
  }
}
