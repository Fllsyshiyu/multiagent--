/**
 * TokenLedger · 成本账本（《优化框架》第六节）
 * 记录每一次 LLM 调用，按阶段归集，支撑"值不值得编排"的成本对比叙事
 */
export class TokenLedger {
  total = 0
  calls = 0
  byPhase: Record<string, number> = {}
  private currentPhase = 'dispatch'

  setPhase(id: string) {
    this.currentPhase = id
  }

  record(tokens: number) {
    this.total += tokens
    this.calls += 1
    this.byPhase[this.currentPhase] = (this.byPhase[this.currentPhase] ?? 0) + tokens
  }

  snapshot() {
    return { total_tokens: this.total, calls: this.calls, by_phase: { ...this.byPhase } }
  }
}
