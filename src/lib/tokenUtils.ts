import type { IrisMessage } from './types'

// Lightweight token estimation (no external tokenizer dependency)
// English: ~1 token per 4 chars, CJK: ~1 token per 1.5 chars

const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g

export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjkMatches = text.match(CJK_REGEX)
  const cjkCount = cjkMatches?.length ?? 0
  const nonCjkCount = text.length - cjkCount
  return Math.ceil(cjkCount / 1.5 + nonCjkCount / 4)
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return String(tokens)
}

// OpenRouter model pricing (USD per 1M tokens)
// Source: https://openrouter.ai/models — updated periodically
interface ModelPricing { input: number; output: number }

const MODEL_PRICING: Record<string, ModelPricing> = {
  'anthropic/claude-sonnet-4': { input: 3, output: 15 },
  'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'openai/gpt-4o': { input: 2.5, output: 10 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'google/gemini-pro-1.5': { input: 1.25, output: 5 },
  'google/gemini-2.0-flash-001': { input: 0.1, output: 0.4 },
  'google/gemini-2.5-flash-preview': { input: 0.15, output: 0.6 },
  'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek/deepseek-reasoner': { input: 0.55, output: 2.19 },
}

// Fallback: try prefix match (e.g. "anthropic/claude-3.5-sonnet:beta" → "anthropic/claude-3.5-sonnet")
function findPricing(modelId: string): ModelPricing | null {
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId]
  for (const key of Object.keys(MODEL_PRICING)) {
    if (modelId.startsWith(key)) return MODEL_PRICING[key]
  }
  return null
}

export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const pricing = findPricing(modelId)
  if (!pricing) return null
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}

export function formatCost(cost: number): string {
  if (cost < 0.001) return `<$0.001`
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

// Session-level usage aggregation from conversation messages
export interface SessionUsage {
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number | null  // null if no usage data at all
  model: string | null      // last used model (or null)
}

export function getSessionUsage(messages: IrisMessage[]): SessionUsage {
  let totalIn = 0, totalOut = 0, totalCost: number | null = null
  let model: string | null = null
  for (const m of messages) {
    const u = m.metadata?.usage
    if (!u) continue
    totalIn += u.inputTokens
    totalOut += u.outputTokens
    if (u.cost != null) totalCost = (totalCost ?? 0) + u.cost
    if (u.model) model = u.model
  }
  return { totalInputTokens: totalIn, totalOutputTokens: totalOut, totalCost, model }
}

export function formatModelShort(modelId: string): string {
  // "anthropic/claude-3.5-sonnet" → "claude-3.5-sonnet"
  const slash = modelId.lastIndexOf('/')
  return slash >= 0 ? modelId.slice(slash + 1) : modelId
}
