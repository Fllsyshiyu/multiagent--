/**
 * Observer · 过程观察与评估（讨论记录第四周 Observer 指标体系）
 * 从事件流中累计计算：发言公平性(Gini)、Grounding率、回应率、少数保留、
 * 轮换率、外圈吸收率、共识趋势与坍缩警报
 */
import type { MetricsSnapshot } from './types'

export class Observer {
  private speechCounts: Record<string, number> = {}
  private grounded = 0
  private verifiable = 0
  private questions = 0
  private answered = 0
  private minorityTotal = 0
  private minorityKept = 0
  private rotationNums: number[] = []
  private outerValid = 0
  private outerAbsorbed = 0
  private consensus: number[] = []
  private anomalies: string[] = []

  recordSpeech(agentId: string, hasEvidenceRef: boolean, replyTo?: string) {
    this.speechCounts[agentId] = (this.speechCounts[agentId] ?? 0) + 1
    this.verifiable += 1
    if (hasEvidenceRef) this.grounded += 1
    if (replyTo) {
      this.questions += 0 // 质询由引擎单独记账
      this.answered += 1
    }
  }

  recordQuestion() {
    this.questions += 1
  }

  recordMinority(total: number, kept: number) {
    this.minorityTotal += total
    this.minorityKept += kept
  }

  recordRotation(rotated: number, innerSize: number) {
    if (innerSize > 0) this.rotationNums.push(rotated / innerSize)
  }

  recordOuter(valid: number, absorbed: number) {
    this.outerValid += valid
    this.outerAbsorbed += absorbed
  }

  recordConsensus(value: number) {
    this.consensus.push(value)
  }

  hasConverged(k = 2, threshold = 0.08): boolean {
    if (this.consensus.length < k + 1) return false
    const recent = this.consensus.slice(-(k + 1))
    return recent.slice(1).every((value, index) => Math.abs(value - recent[index]) <= threshold)
  }

  hasLowChange(k = 2, threshold = 0.08): boolean {
    return this.hasConverged(k, threshold)
  }

  consensusTrend(): number[] {
    return [...this.consensus]
  }

  flag(anomaly: string) {
    if (!this.anomalies.includes(anomaly)) this.anomalies.push(anomaly)
  }

  private gini(): number {
    const values = Object.values(this.speechCounts)
    if (values.length <= 1) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const n = sorted.length
    const sum = sorted.reduce((a, b) => a + b, 0)
    if (sum === 0) return 0
    let numerator = 0
    sorted.forEach((v, i) => (numerator += (2 * (i + 1) - n - 1) * v))
    return numerator / (n * sum)
  }

  snapshot(): MetricsSnapshot {
    const total = Object.values(this.speechCounts).reduce((a, b) => a + b, 0)
    const share: Record<string, number> = {}
    for (const [k, v] of Object.entries(this.speechCounts)) share[k] = total ? v / total : 0
    // 共识坍缩警报：共识快速上升但回应率/少数保留偏低
    const responseRate = this.questions ? Math.min(1, this.answered / this.questions) : 1
    const minorityRetention = this.minorityTotal ? Math.min(1, this.minorityKept / this.minorityTotal) : 1
    const riseFast = this.consensus.length >= 2 && this.consensus[this.consensus.length - 1] - this.consensus[0] > 0.35
    const collapse = riseFast && (responseRate < 0.6 || minorityRetention < 0.5)
    return {
      speaking_share: share,
      fairness_gini: this.gini(),
      grounding_rate: this.verifiable ? this.grounded / this.verifiable : 0,
      response_rate: responseRate,
      minority_retention: minorityRetention,
      rotation_rate: this.rotationNums.length ? this.rotationNums.reduce((a, b) => a + b, 0) / this.rotationNums.length : 0,
      outer_absorption_rate: this.outerValid ? this.outerAbsorbed / this.outerValid : 0,
      consensus_trend: [...this.consensus],
      consensus_collapse_warning: collapse,
      anomalies: [...this.anomalies],
    }
  }
}
