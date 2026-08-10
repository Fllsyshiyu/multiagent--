import type { ComplexityDimensions, ComplexityLevel, DimensionScore } from './types'

export const COMPLEXITY_RUBRIC_VERSION = 'ma-collab-complexity-v2-distilbert'

export const COMPLEXITY_LEVELS: Record<ComplexityLevel, { name: string; description: string }> = {
  1: { name: '直接执行', description: '单步转换、提取或基础计算。' },
  2: { name: '轻量处理', description: '基础理解、少量组织或一次简单工具操作。' },
  3: { name: '标准多步', description: '多步分析、比较、规划、文件或代码处理。' },
  4: { name: '复杂任务', description: '多个相互依赖阶段、深入专业分析、验证或协调。' },
  5: { name: '高度复杂', description: '开放研究、长期真实世界执行、实验或无已知解法。' },
}

export const DIMENSION_LABELS: Record<keyof ComplexityDimensions, string> = {
  reasoning_depth: '推理深度',
  step_count: '执行步骤',
  domain_expertise: '专业知识',
  tool_dependency: '工具依赖',
  coordination: '协调复杂度',
  uncertainty: '不确定性',
}

export function clampDimension(value: unknown): DimensionScore {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(4, Math.round(n))) as DimensionScore
}

export function clampLevel(value: unknown): ComplexityLevel {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 3
  return Math.max(1, Math.min(5, Math.round(n))) as ComplexityLevel
}

export function calculateComplexity(dimensions: ComplexityDimensions): ComplexityLevel {
  const values = Object.values(dimensions)
  const level4Count = values.filter((v) => v === 4).length
  const highCount = values.filter((v) => v >= 3).length
  const mediumCount = values.filter((v) => v >= 2).length
  if (
    (dimensions.reasoning_depth === 4 && (dimensions.domain_expertise >= 3 || dimensions.uncertainty >= 3)) ||
    (dimensions.tool_dependency === 4 && dimensions.step_count >= 3) ||
    level4Count >= 3
  ) return 5
  if (highCount >= 2 || (highCount >= 1 && mediumCount >= 3)) return 4
  if (mediumCount >= 2 || dimensions.reasoning_depth >= 2 || dimensions.step_count >= 2) return 3
  if (values.some((v) => v >= 1)) return 2
  return 1
}
