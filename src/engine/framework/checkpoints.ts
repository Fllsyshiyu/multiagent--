import type {
  AlignmentDriftFlag, BlackboardEntry, CheckpointDecision, CheckpointTrigger, ConflictRecord,
  IssueNode, Phase, ScenarioConfig, SemanticAlignmentReview, TaskCheckpoint,
} from '../types'

function checkpointId(sequence: number): string {
  return `checkpoint_${Date.now()}_${sequence}`
}

function textOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textOf)
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(textOf)
}

function hasKind(entries: BlackboardEntry[], kind: string): boolean {
  return entries.some((entry) => Boolean(entry.payload) && typeof entry.payload === 'object' && (entry.payload as { kind?: string }).kind === kind)
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function issueLists(issues: IssueNode[], phase: Phase, entries: BlackboardEntry[], conflicts: ConflictRecord[]) {
  const valid = entries.filter((entry) => entry.status === 'valid')
  const has = (register: BlackboardEntry['register']) => valid.some((entry) => entry.register === register)
  const effectiveStatus = (issue: IssueNode): IssueNode['status'] => {
    if (issue.id === inputRootId(entries) && hasKind(valid, 'ExamResult')) return 'resolved'
    if (issue.id.endsWith('_stakeholders') && valid.some((entry) => entry.phase_id === 'first_round')) return 'resolved'
    if (issue.id.endsWith('_evidence') && has('unknowns')) return 'blocked'
    if (issue.id.endsWith('_evidence') && (has('facts') || has('evidence'))) return 'resolved'
    if (issue.id.endsWith('_conflicts') && conflicts.length > 0 && conflicts.every((conflict) => conflict.resolution_status !== 'open')) return 'resolved'
    if (issue.id.endsWith('_solution') && hasKind(valid, 'FinalProposal')) return 'resolved'
    if (issue.id.endsWith('_authority') && (phase.kind === 'evaluate' || phase.kind === 'report') && hasKind(valid, 'ExamResult')) return 'resolved'
    return issue.status
  }
  return {
    resolved: issues.filter((issue) => effectiveStatus(issue) === 'resolved').map((issue) => issue.title),
    open: issues.filter((issue) => effectiveStatus(issue) === 'open').map((issue) => issue.title),
    blocked: issues.filter((issue) => effectiveStatus(issue) === 'blocked').map((issue) => issue.title),
  }
}

function inputRootId(entries: BlackboardEntry[]): string {
  return entries.find((entry) => entry.register !== 'checkpoints')?.issue_id ?? ''
}

function decisionFor(flags: AlignmentDriftFlag[], trigger: CheckpointTrigger, missingEvidence: string[], conflicts: ConflictRecord[]): { decision: CheckpointDecision; reasons: string[] } {
  if (flags.includes('OBJECTIVE_DRIFT') || flags.includes('CONSTRAINT_VIOLATION')) {
    return { decision: 'HUMAN_ESCALATION', reasons: flags.filter((flag) => flag === 'OBJECTIVE_DRIFT' || flag === 'CONSTRAINT_VIOLATION') }
  }
  if (flags.includes('UNMAPPED_ISSUE') || flags.includes('LOCAL_SOLUTION_PRESENTED_AS_GLOBAL')) {
    return { decision: 'RECOMPILE', reasons: flags.filter((flag) => flag === 'UNMAPPED_ISSUE' || flag === 'LOCAL_SOLUTION_PRESENTED_AS_GLOBAL') }
  }
  if (trigger === 'PRE_TERMINAL' && missingEvidence.length > 0 && conflicts.some((conflict) => conflict.conflict_type === 'fact' && conflict.decision_relevant && conflict.resolution_status === 'open')) {
    return { decision: 'WAITING_FOR_EVIDENCE', reasons: ['decision_relevant_fact_conflict_requires_evidence'] }
  }
  if (flags.some((flag) => flag === 'REQUIRED_ARTIFACT_MISSING' || flag === 'MINORITY_POSITION_LOST' || flag === 'UNKNOWN_PROMOTED_TO_FACT' || flag === 'UNRESOLVED_ISSUE_DROPPED')) {
    return { decision: 'RETRY_PHASE', reasons: flags.filter((flag) => flag === 'REQUIRED_ARTIFACT_MISSING' || flag === 'MINORITY_POSITION_LOST' || flag === 'UNKNOWN_PROMOTED_TO_FACT' || flag === 'UNRESOLVED_ISSUE_DROPPED') }
  }
  return { decision: 'CONTINUE', reasons: ['checkpoint_rules_passed'] }
}

export interface CheckpointInput {
  config: ScenarioConfig
  phase: Phase
  trigger: CheckpointTrigger
  sequence: number
  entries: BlackboardEntry[]
  conflicts: ConflictRecord[]
  minorityPositions: string[]
  semanticReview?: SemanticAlignmentReview
}

/**
 * 先执行确定性一致性检查。语义 Reviewer 仅作为可选输入，最终门控仍由代码决定。
 */
export function createTaskCheckpoint(input: CheckpointInput): TaskCheckpoint {
  const valid = input.entries.filter((entry) => entry.status === 'valid')
  const issueIds = new Set(input.config.issue_graph.issues.map((issue) => issue.id))
  const flags = new Set<AlignmentDriftFlag>(input.semanticReview?.drift_flags ?? [])
  const currentOutputs = valid.filter((entry) => entry.phase_id === input.phase.id && entry.register !== 'checkpoints')
  if (input.trigger === 'PHASE_EXIT' && input.phase.required && currentOutputs.length === 0) flags.add('REQUIRED_ARTIFACT_MISSING')
  if (valid.some((entry) => !issueIds.has(entry.issue_id))) flags.add('UNMAPPED_ISSUE')

  const unknownText = unique(valid.filter((entry) => entry.register === 'unknowns').flatMap((entry) => textOf(entry.payload)))
  const factText = unique(valid.filter((entry) => entry.register === 'facts').flatMap((entry) => textOf(entry.payload)))
  if (factText.some((fact) => unknownText.some((unknown) => fact.includes(unknown) || unknown.includes(fact)))) flags.add('UNKNOWN_PROMOTED_TO_FACT')

  const unresolvedConflicts = input.conflicts.filter((conflict) => conflict.decision_relevant && (conflict.resolution_status === 'open' || conflict.resolution_status === 'retained'))
  if (input.trigger === 'TERMINAL' && unresolvedConflicts.length > 0
    && valid.every((entry) => entry.register !== 'decisions' || !textOf(entry.payload).some((value) => /未解决|异议|impasse|missing|unresolved/i.test(value)))) {
    flags.add('UNRESOLVED_ISSUE_DROPPED')
  }

  const retainedMinority = unique(valid.filter((entry) => entry.register === 'objections').flatMap((entry) => textOf(entry.payload)))
  if (input.trigger === 'TERMINAL' && input.config.guards.minority_report_required
    && input.minorityPositions.some((position) => !retainedMinority.some((stored) => stored.includes(position)))) {
    flags.add('MINORITY_POSITION_LOST')
  }

  const allText = valid.flatMap((entry) => textOf(entry.payload)).join('\n')
  for (const constraint of input.config.scenario_spec.hard_constraints) {
    if (/不得编造证据|不得将未验证/.test(constraint) && /数据已经确定|事实证明|必然|毫无疑问/.test(allText) && unknownText.length > 0) flags.add('CONSTRAINT_VIOLATION')
  }

  const issueState = issueLists(input.config.issue_graph.issues, input.phase, valid, input.conflicts)
  const missingEvidence = unique(valid.filter((entry) => entry.register === 'unknowns').flatMap((entry) => {
    const payload = entry.payload as { kind?: string; claim?: string }
    return payload.kind === 'EvidenceGap' && payload.claim ? [payload.claim] : []
  }))
  const provisionalDecisions = unique(valid.filter((entry) => entry.register === 'decisions').flatMap((entry) => textOf(entry.payload)))
  const driftFlags = [...flags]
  const gate = decisionFor(driftFlags, input.trigger, missingEvidence, input.conflicts)
  const openItems = unique([...issueState.open, ...unresolvedConflicts.map((conflict) => `${conflict.conflict_type}:${conflict.resolution_status}`)])

  return {
    id: checkpointId(input.sequence), version: 1, created_at: new Date().toISOString(), created_by: 'alignment_checkpoint_v1',
    source_refs: currentOutputs.map((entry) => entry.id), visibility: ['audit', 'public'], status: 'valid',
    sequence: input.sequence, trigger: input.trigger, issue_id: input.config.issue_graph.root_issue_id, phase_id: input.phase.id,
    original_objective: input.config.scenario_spec.objective, current_focus: input.semanticReview?.current_focus ?? input.phase.purpose,
    resolved_items: issueState.resolved, open_items: openItems, blocked_items: issueState.blocked,
    confirmed_facts: factText, unverified_claims: unknownText, missing_evidence: missingEvidence,
    active_constraints: [...input.config.scenario_spec.hard_constraints], minority_positions: unique(input.minorityPositions),
    provisional_decisions: provisionalDecisions, next_required_actions: gate.decision === 'CONTINUE' ? input.phase.transitions.map((transition) => transition.target) : gate.reasons,
    drift_flags: driftFlags, checkpoint_decision: gate.decision, decision_reasons: gate.reasons,
    semantic_review: input.semanticReview,
  }
}

export function isCheckpointPhase(phase: Phase): boolean {
  if (phase.kind === 'analyze' || phase.kind === 'propose' || phase.kind === 'evaluate' || phase.kind === 'report') return true
  return phase.kind === 'fishbowl' && Number(phase.config.round ?? 0) >= 2
}
