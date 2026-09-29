import type { LanguageModelMiddleware } from 'ai'

type PromptMessage = {
  role: string
  content: unknown
  providerOptions?: unknown
}

type ImagePart = { data: string; mediaType: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function takeImages(output: unknown): { output: unknown; images: ImagePart[] } {
  if (!isRecord(output) || output.type !== 'content' || !Array.isArray(output.value)) {
    return { output, images: [] }
  }
  const images: ImagePart[] = []
  const rest: unknown[] = []
  for (const item of output.value) {
    if (!isRecord(item) || typeof item.data !== 'string' || typeof item.mediaType !== 'string') {
      rest.push(item)
      continue
    }
    const image = item.type === 'image-data' || (item.type === 'media' && item.mediaType.startsWith('image/'))
    if (image) images.push({ data: item.data, mediaType: item.mediaType })
    else rest.push(item)
  }
  if (!images.length) return { output, images }
  const text = rest
    .filter((item): item is { type: string; text: string } => isRecord(item) && item.type === 'text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('\n')
    || `Viewport screenshot captured (${images[0].mediaType}). The image follows.`
  return { output: { type: 'text', value: text }, images }
}

/** Chat completions stringify tool-result images. Lift them onto a user image part instead. */
export function liftToolImages<T extends PromptMessage[]>(prompt: T): T {
  const out: PromptMessage[] = []
  let pending: ImagePart[] = []

  const flush = () => {
    if (!pending.length) return
    const n = pending.length
    out.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: n === 1
            ? 'Viewport screenshot from take_screenshot. Read this image; the tool result is only a short receipt.'
            : `${n} viewport screenshots from take_screenshot. Read these images; the tool results are only short receipts.`,
        },
        ...pending.map(img => ({ type: 'file' as const, data: img.data, mediaType: img.mediaType })),
      ],
    })
    pending = []
  }

  for (const message of prompt) {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      flush()
      out.push(message)
      continue
    }
    const content = message.content.map((part: unknown) => {
      if (!isRecord(part) || part.type !== 'tool-result') return part
      const lifted = takeImages(part.output)
      if (!lifted.images.length) return part
      pending.push(...lifted.images)
      return { ...part, output: lifted.output }
    })
    out.push({ ...message, content })
  }
  flush()
  return out as T
}

export const liftToolImagesMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => ({
    ...params,
    prompt: liftToolImages(params.prompt),
  }),
}
