import { classifyWithDistilBert } from './routerClient'
import type { ComplexityClassification } from './types'

/** Only DistilBERT is used. No LLM prompt and no keyword heuristic fallback. */
export async function classifyComplexity(query: string): Promise<ComplexityClassification> {
  return {
    result: await classifyWithDistilBert(query),
    tokens: 0,
    source: 'distilbert',
  }
}
