import { clampDimension, clampLevel, COMPLEXITY_RUBRIC_VERSION } from './rubric'
import type { ComplexityDimensions, ComplexityResult } from './types'

const DEFAULT_ROUTER_URL = 'http://127.0.0.1:8787'
const REQUEST_TIMEOUT_MS = 5000

type DimensionPayload = { score: number; confidence: number; probabilities: number[] }

interface RouterApiResponse {
  dimensions: Record<keyof ComplexityDimensions, DimensionPayload>
  complexity: number
  confidence: number
  model: string
  latency_ms: number
  method: 'distilbert_anchor_similarity_v1'
}

export function getComplexityRouterUrl(): string | null {
  const configured = import.meta.env.VITE_COMPLEXITY_ROUTER_URL
  if (configured === '') return null
  if (configured) return configured.replace(/\/$/, '')
  const isLocalPage = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  return isLocalPage ? DEFAULT_ROUTER_URL : null
}

export async function classifyWithDistilBert(query: string): Promise<ComplexityResult> {
  const baseUrl = getComplexityRouterUrl()
  if (!baseUrl) throw new Error('未配置 DistilBERT complexity service。请设置 VITE_COMPLEXITY_ROUTER_URL。')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`DistilBERT complexity service 返回 ${response.status}`)
    const data = await response.json() as RouterApiResponse
    const keys: (keyof ComplexityDimensions)[] = [
      'reasoning_depth', 'step_count', 'domain_expertise',
      'tool_dependency', 'coordination', 'uncertainty',
    ]
    const dimensions = Object.fromEntries(
      keys.map((key) => [key, clampDimension(data.dimensions?.[key]?.score)]),
    ) as unknown as ComplexityDimensions
    const dimensionConfidence = Object.fromEntries(
      keys.map((key) => [key, clampProbability(data.dimensions?.[key]?.confidence)]),
    ) as Record<keyof ComplexityDimensions, number>
    return {
      complexity: clampLevel(data.complexity),
      dimensions,
      dimension_confidence: dimensionConfidence,
      confidence: clampProbability(data.confidence),
      model: data.model || 'tripathyShaswata/QueryComplexityRouter',
      latency_ms: Number.isFinite(data.latency_ms) ? data.latency_ms : 0,
      method: 'distilbert_anchor_similarity_v1',
      rubric_version: COMPLEXITY_RUBRIC_VERSION,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('DistilBERT complexity service 请求超时，请确认 npm run classifier:dev 已启动。')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

function clampProbability(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
}
