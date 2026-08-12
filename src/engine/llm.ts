/**
 * 浏览器 LLM 客户端
 * - 直连用户配置的 OpenAI 兼容端点（密钥只发往用户自选服务商）
 * - JSON 输出约束 + 一次自动重试（解析失败也计入框架健壮性展示）
 * - 每次调用记账到 TokenLedger
 */
import type { LLMConfig } from './types'
import { z } from 'zod'

export interface CallResult {
  text: string
  tokens: number
  invocation?: {
    mode: 'live' | 'replay' | 'mock'
    model: string
    latency_ms: number
    result_status: 'success' | 'error'
  }
}

export type LLMCaller = (system: string, user: string, opts?: { json?: boolean; max_tokens?: number }) => Promise<CallResult>

export function createLLMCaller(
  config: LLMConfig,
  onUsage?: (tokens: number) => void,
): LLMCaller {
  return async (system, user, opts) => {
    const startedAt = performance.now()
    // 保险一：OpenAI 系 json_object 模式要求 prompt 中必须出现 "json" 一词，统一补齐
    const sys = opts?.json
      ? system + '\n【输出要求】请严格以 JSON（json）格式输出，不要输出任何其他内容。'
      : system

    const url = config.base_url.replace(/\/$/, '') + '/chat/completions'
    const post = async (withFormat: boolean): Promise<Response> => {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: config.temperature ?? 0.7,
        max_tokens: opts?.max_tokens ?? 2048,
      }
      if (withFormat && opts?.json) body.response_format = { type: 'json_object' }
      try {
        return await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.api_key}`,
          },
          body: JSON.stringify(body),
        })
      } catch (e) {
        throw new Error(
          '无法连接到该 LLM 端点（可能是该服务商不允许浏览器跨域调用，或网络不可达）。' +
            '请更换端点（DeepSeek / Moonshot 通常支持浏览器直连），或检查 Base URL。原始错误：' +
            (e instanceof Error ? e.message : String(e)),
        )
      }
    }

    let resp = await post(true)
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      // 保险二：JSON 模式被服务商拒绝（400）时，降级为普通文本模式重试一次，
      // 之后仍由 extractJSON 负责稳健解析
      if (resp.status === 400 && opts?.json && /json|response_format/i.test(errText)) {
        resp = await post(false)
        if (!resp.ok) {
          const errText2 = await resp.text().catch(() => '')
          throw new Error(`LLM API 返回 ${resp.status}：${errText2.slice(0, 300)}`)
        }
      } else {
        throw new Error(`LLM API 返回 ${resp.status}：${errText.slice(0, 300)}`)
      }
    }
    const data = await resp.json()
    const text: string = data.choices?.[0]?.message?.content ?? ''
    const tokens: number = data.usage?.total_tokens ?? Math.ceil((sys.length + user.length + text.length) / 3)
    onUsage?.(tokens)
    return {
      text,
      tokens,
      invocation: { mode: 'live', model: config.model, latency_ms: performance.now() - startedAt, result_status: 'success' },
    }
  }
}

/** 从 LLM 输出中稳健抽取 JSON（兼容 ```json 包裹、前后多余文本） */
export function extractJSON<T>(text: string): T {
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  const start = s.search(/[{[]/)
  if (start > 0) s = s.slice(start)
  // 尝试整体解析，失败则截取到匹配的闭合括号
  try {
    return JSON.parse(s) as T
  } catch {
    const open = s[0]
    const close = open === '{' ? '}' : ']'
    let depth = 0
    let end = -1
    for (let i = 0; i < s.length; i++) {
      if (s[i] === open) depth++
      else if (s[i] === close) {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end > 0) return JSON.parse(s.slice(0, end + 1)) as T
    throw new Error('JSON 解析失败')
  }
}

/** 带一次重试的 JSON 调用：第一次失败时把错误反馈给模型重试（框架健壮性展示点） */
export async function callJSON<T>(
  caller: LLMCaller,
  system: string,
  user: string,
  onRetry?: (attempt: number) => void,
): Promise<{ data: T; tokens: number }> {
  const first = await caller(system, user, { json: true })
  try {
    return { data: extractJSON<T>(first.text), tokens: first.tokens }
  } catch {
    onRetry?.(2)
    const retryUser =
      user +
      '\n\n【系统提示】你上一次的输出不是合法 JSON。请只输出一个严格合法的 JSON 对象，不要任何解释性文字、不要 Markdown 代码块。'
    const second = await caller(system, retryUser, { json: true })
    try {
      return { data: extractJSON<T>(second.text), tokens: first.tokens + second.tokens }
    } catch (e) {
      throw new Error('两次尝试后仍无法获得合法 JSON：' + (e instanceof Error ? e.message : String(e)))
    }
  }
}

/** JSON 解析 + Zod 运行时校验。正式工件优先使用此入口，避免类型断言把异常输出写入黑板。 */
export async function callValidatedJSON<T>(
  caller: LLMCaller,
  system: string,
  user: string,
  schema: z.ZodType<T>,
  onRetry?: (attempt: number) => void,
): Promise<{ data: T; tokens: number }> {
  const first = await caller(system, user, { json: true })
  const parse = (text: string): T => schema.parse(extractJSON<unknown>(text))
  try {
    return { data: parse(first.text), tokens: first.tokens }
  } catch {
    onRetry?.(2)
    const second = await caller(
      system,
      user + '\n\n【系统提示】上一次输出未通过 JSON Schema 校验。请补齐所有必需字段，只输出严格合法 JSON。',
      { json: true },
    )
    try {
      return { data: parse(second.text), tokens: first.tokens + second.tokens }
    } catch (error) {
      throw new Error('两次尝试后输出仍未通过运行时 Schema 校验：' + (error instanceof Error ? error.message : String(error)))
    }
  }
}

/** 模拟 LLM 调用（用于无 Key 时的本地 smoke test，非演示主路径） */
export function createMockCaller(onUsage?: (tokens: number) => void): LLMCaller {
  return async (_system, user) => {
    const tokens = Math.ceil(user.length / 3) + 120
    onUsage?.(tokens)
    return { text: '{}', tokens, invocation: { mode: 'mock', model: 'mock', latency_ms: 0, result_status: 'success' } }
  }
}
