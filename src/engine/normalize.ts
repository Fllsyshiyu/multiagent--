/**
 * 结构归一化 · 真实 LLM 的 JSON 输出形态不一，统一兜底：
 * - asArray：数组找不到就去对象的其他键里找，再找不到给默认空数组
 * - asStringArray：保证字符串数组
 * - pickObj：模型把工件多套了一层包裹时拆出来
 * 目标：任何一次调用返回异常都不中断整场运行（健壮性展示点）
 */

export function asArray<T = Record<string, unknown>>(data: unknown, preferredKey?: string): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (preferredKey && Array.isArray(obj[preferredKey])) return obj[preferredKey] as T[]
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length > 0) return v as T[]
    }
  }
  return []
}

export function asStringArray(data: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(data)) return data.filter((x) => typeof x === 'string') as string[]
  if (typeof data === 'string' && data.trim()) return [data]
  return fallback
}

/** 模型有时把工件包成 {"initial_assessment_card": {...}}，拆出内层 */
export function pickObj<T>(data: unknown, mustHaveKey: string): T {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    if (mustHaveKey in obj) return obj as T
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && mustHaveKey in (v as Record<string, unknown>)) {
        return v as T
      }
    }
    return obj as T
  }
  return {} as T
}
