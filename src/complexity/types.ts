/** DistilBERT-only five-level task complexity contract. */
export type ComplexityLevel = 1 | 2 | 3 | 4 | 5
export type DimensionScore = 0 | 1 | 2 | 3 | 4

export interface ComplexityDimensions {
  reasoning_depth: DimensionScore
  step_count: DimensionScore
  domain_expertise: DimensionScore
  tool_dependency: DimensionScore
  coordination: DimensionScore
  uncertainty: DimensionScore
}

export interface ComplexityResult {
  complexity: ComplexityLevel
  dimensions: ComplexityDimensions
  dimension_confidence: Record<keyof ComplexityDimensions, number>
  confidence: number
  model: string
  latency_ms: number
  method: 'distilbert_anchor_similarity_v1'
  rubric_version: string
}

export interface ComplexityClassification {
  result: ComplexityResult
  tokens: 0
  source: 'distilbert'
}
