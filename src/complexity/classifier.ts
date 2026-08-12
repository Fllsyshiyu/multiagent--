import { callJSON, type LLMCaller } from '../engine/llm'
import {
  calculateComplexity,
  clampDimension,
  COMPLEXITY_RUBRIC_VERSION,
} from './rubric'
import type { ComplexityClassification, ComplexityDimensions } from './types'

const DIMENSION_KEYS: (keyof ComplexityDimensions)[] = [
  'reasoning_depth',
  'step_count',
  'domain_expertise',
  'tool_dependency',
  'coordination',
  'uncertainty',
]

const CLASSIFIER_SYSTEM = `你是 Query Complexity 评估器。只评估任务本身的复杂度，不回答任务。
请严格依据固定 rubric，分别给六个维度打 0-4 整数分：

1. reasoning_depth（推理深度）
0=复制、提取、格式转换或基础计算；1=一次简单推断；2=标准多步分析、比较或规划；3=深入推导、调试或迭代验证；4=开放研究、原创发现或无已知解法。
2. step_count（执行步骤）
0=一个直接操作；1=两三个基本独立的小步骤；2=多个有顺序依赖的步骤；3=包含实现和验证的多个相互依赖阶段；4=需根据真实世界反馈长期动态执行。
3. domain_expertise（专业知识）
0=无需专业知识；1=常见基础知识；2=一般职业或本科专业知识；3=高级专家知识或跨学科知识；4=前沿研究或尚未发现的知识。
4. tool_dependency（工具依赖）
0=无需工具、检索、代码或文件；1=一次简单查询、计算或工具调用；2=围绕单一工具、数据、文件或代码环境重复操作；3=多工具、迭代执行、测试、浏览或部署；4=物理实验、生产操作、临床试验或真实世界行动。
5. coordination（协调复杂度）
0=单人独立完成；1=少量上下文一致性协调；2=跨多个模块、组件、角色或观点；3=利益冲突、复杂依赖、谈判或团队协调；4=长期跨组织协调或动态战略互动。
6. uncertainty（不确定性）
0=要求完整明确且答案易验证；1=基本明确，仅有少量无害选择；2=需要假设、权衡或从多个可行方案中选择；3=信息缺失、验证困难或结果高度不确定；4=高度开放、不可预测且没有已知正确答案。

不要因文字长就自动给高分；按任务实际所需能力评分。只输出 JSON。`

interface ApiDimension {
  score?: unknown
  confidence?: unknown
}

interface ApiClassification {
  dimensions?: Partial<Record<keyof ComplexityDimensions, ApiDimension | number>>
  confidence?: unknown
}

export async function classifyComplexity(
  query: string,
  caller: LLMCaller,
): Promise<ComplexityClassification> {
  const startedAt = performance.now()
  const { data, tokens } = await callJSON<ApiClassification>(
    caller,
    CLASSIFIER_SYSTEM,
    `待评估任务：${query}\n\n输出 JSON：\n{\n  "dimensions": {\n    "reasoning_depth": {"score": 0, "confidence": 0.0},\n    "step_count": {"score": 0, "confidence": 0.0},\n    "domain_expertise": {"score": 0, "confidence": 0.0},\n    "tool_dependency": {"score": 0, "confidence": 0.0},\n    "coordination": {"score": 0, "confidence": 0.0},\n    "uncertainty": {"score": 0, "confidence": 0.0}\n  },\n  "confidence": 0.0\n}`,
  )

  if (!data.dimensions) throw new Error('复杂度 API 未返回 dimensions')
  const dimensions = Object.fromEntries(DIMENSION_KEYS.map((key) => {
    const value = data.dimensions?.[key]
    const score = typeof value === 'object' && value !== null ? value.score : value
    const numericScore = typeof score === 'number' ? score : Number(score)
    if (!Number.isFinite(numericScore)) throw new Error(`复杂度 API 缺少有效维度：${key}`)
    return [key, clampDimension(numericScore)]
  })) as unknown as ComplexityDimensions

  const dimensionConfidence = Object.fromEntries(DIMENSION_KEYS.map((key) => {
    const value = data.dimensions?.[key]
    const confidence = typeof value === 'object' && value !== null ? value.confidence : data.confidence
    return [key, clampProbability(confidence, 0.65)]
  })) as Record<keyof ComplexityDimensions, number>

  const averageConfidence = DIMENSION_KEYS.reduce(
    (sum, key) => sum + dimensionConfidence[key],
    0,
  ) / DIMENSION_KEYS.length

  return {
    result: {
      complexity: calculateComplexity(dimensions),
      dimensions,
      dimension_confidence: dimensionConfidence,
      confidence: clampProbability(data.confidence, averageConfidence),
      model: 'OpenAI-compatible API',
      latency_ms: performance.now() - startedAt,
      method: 'rubric_llm_api_v1',
      rubric_version: COMPLEXITY_RUBRIC_VERSION,
    },
    tokens,
    source: 'api',
  }
}

function clampProbability(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback
}
