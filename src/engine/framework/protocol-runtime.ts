import { validateVote } from './validation'

export interface DelphiSubmission {
  round: number
  agent_id: string
  value: number
  confidence: number
  rationale: string
  uncertainty_sources: string[]
}

export interface DelphiAggregate {
  round: number
  count: number
  mean: number
  median: number
  standard_deviation: number
  mean_confidence: number
  rationale_digest: string[]
  uncertainty_sources: string[]
  identity_exposed: false
}

export function aggregateDelphiRound(submissions: DelphiSubmission[]): DelphiAggregate {
  if (submissions.length === 0) throw new Error('Delphi 轮次至少需要一份提交')
  const round = submissions[0].round
  if (submissions.some((submission) => submission.round !== round)) throw new Error('Delphi 聚合不得混合不同轮次')
  if (new Set(submissions.map((submission) => submission.agent_id)).size !== submissions.length) throw new Error('同一 Agent 每轮只能提交一次')
  const values = submissions.map((submission) => submission.value).sort((left, right) => left - right)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const middle = Math.floor(values.length / 2)
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return {
    round, count: submissions.length, mean: Number(mean.toFixed(4)), median: Number(median.toFixed(4)),
    standard_deviation: Number(Math.sqrt(variance).toFixed(4)),
    mean_confidence: Number((submissions.reduce((sum, item) => sum + item.confidence, 0) / submissions.length).toFixed(4)),
    rationale_digest: [...new Set(submissions.map((submission) => submission.rationale).filter(Boolean))],
    uncertainty_sources: [...new Set(submissions.flatMap((submission) => submission.uncertainty_sources))],
    identity_exposed: false,
  }
}

export function delphiConverged(history: DelphiAggregate[], k = 1, meanThreshold = 0.08, dispersionThreshold = 0.15): boolean {
  if (history.length < k + 1) return false
  const recent = history.slice(-(k + 1))
  return recent.slice(1).every((current, index) => Math.abs(current.mean - recent[index].mean) <= meanThreshold
    && current.standard_deviation <= dispersionThreshold)
}

export interface DialecticalChallenge {
  id: string
  claim: string
  counterexample: string
  evidence_gap?: string
  severity: number
}

export interface DialecticalResponse {
  challenge_id: string
  response: string
  revision?: string
  evidence_refs: string[]
}

export function evaluateDialecticalReview(challenges: DialecticalChallenge[], responses: DialecticalResponse[]) {
  const responseMap = new Map(responses.map((response) => [response.challenge_id, response]))
  const unresolved = challenges.filter((challenge) => {
    const response = responseMap.get(challenge.id)
    return !response || (challenge.severity >= 0.7 && response.evidence_refs.length === 0 && !response.revision)
  })
  return {
    resolved_challenge_ids: challenges.filter((challenge) => !unresolved.includes(challenge)).map((challenge) => challenge.id),
    unresolved_challenge_ids: unresolved.map((challenge) => challenge.id),
    passed: unresolved.every((challenge) => challenge.severity < 0.7),
  }
}

export interface ParliamentaryMotion {
  id: string
  text: string
  mover_id: string
  seconder_id?: string
  eligible_voter_ids: string[]
  quorum_ratio: number
}

export function executeRobertsVote(input: {
  motion: ParliamentaryMotion
  votes: { agent_id: string; vote: 'yes' | 'no' | 'abstain'; reason: string }[]
  amendments?: { id: string; text: string; adopted: boolean }[]
}) {
  const validation = validateVote({
    eligibleVoterIds: input.motion.eligible_voter_ids, candidateIds: ['yes', 'no', 'abstain'],
    votes: input.votes, quorumRatio: input.motion.quorum_ratio,
  })
  const yes = input.votes.filter((vote) => vote.vote === 'yes').length
  const no = input.votes.filter((vote) => vote.vote === 'no').length
  return {
    valid: validation.ok && Boolean(input.motion.seconder_id),
    validation_issues: [...validation.issues.map((issue) => issue.code), ...(!input.motion.seconder_id ? ['MOTION_NOT_SECONDED'] : [])],
    adopted: validation.ok && Boolean(input.motion.seconder_id) && yes > no,
    tally: { yes, no, abstain: input.votes.length - yes - no },
    final_motion_text: [input.motion.text, ...(input.amendments ?? []).filter((amendment) => amendment.adopted).map((amendment) => `修正：${amendment.text}`)].join('；'),
  }
}

export type ProtocolRuntimeInput =
  | { protocol_id: 'delphi_v1'; rounds: DelphiSubmission[][]; convergence_k?: number; mean_threshold?: number; dispersion_threshold?: number }
  | { protocol_id: 'dialectical_review_v1'; challenges: DialecticalChallenge[]; responses: DialecticalResponse[] }
  | { protocol_id: 'roberts_rules_v1'; motion: ParliamentaryMotion; votes: { agent_id: string; vote: 'yes' | 'no' | 'abstain'; reason: string }[]; amendments?: { id: string; text: string; adopted: boolean }[] }

export type ProtocolRuntimeResult =
  | { protocol_id: 'delphi_v1'; aggregates: DelphiAggregate[]; converged: boolean; terminal: 'DECIDED' | 'PROVISIONAL' }
  | { protocol_id: 'dialectical_review_v1'; review: ReturnType<typeof evaluateDialecticalReview>; terminal: 'DECIDED' | 'PROVISIONAL' }
  | { protocol_id: 'roberts_rules_v1'; vote: ReturnType<typeof executeRobertsVote>; terminal: 'DECIDED' | 'PROVISIONAL' }

/** 三类 M3 协议的确定性执行入口。LLM 负责产出工件，此处负责聚合、门槛和状态转换。 */
export function executeProtocolRuntime(input: ProtocolRuntimeInput): ProtocolRuntimeResult {
  if (input.protocol_id === 'delphi_v1') {
    const aggregates = input.rounds.map(aggregateDelphiRound)
    const converged = delphiConverged(aggregates, input.convergence_k ?? 1, input.mean_threshold ?? 0.08, input.dispersion_threshold ?? 0.15)
    return { protocol_id: input.protocol_id, aggregates, converged, terminal: converged ? 'DECIDED' : 'PROVISIONAL' }
  }
  if (input.protocol_id === 'dialectical_review_v1') {
    const review = evaluateDialecticalReview(input.challenges, input.responses)
    return { protocol_id: input.protocol_id, review, terminal: review.passed ? 'DECIDED' : 'PROVISIONAL' }
  }
  const vote = executeRobertsVote(input)
  return { protocol_id: input.protocol_id, vote, terminal: vote.valid && vote.adopted ? 'DECIDED' : 'PROVISIONAL' }
}
