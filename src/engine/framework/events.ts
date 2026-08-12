import type {
  ConflictRecord, EventRule, EventRuleEvaluation, ImpasseReport, TerminalReport, TerminalState,
} from '../types'

function recordId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export interface EventRuntimeState {
  conflicts: ConflictRecord[]
  lowChange: boolean
  highResidualDisagreement: boolean
  noNewEvidence: boolean
  retryLimitReached: boolean
  authorityRequired: boolean
  deadlineReached?: boolean
  evidenceVerified?: boolean
  evidenceDecisionRelevant?: boolean
}

export class EventRuleEngine {
  private readonly rules: EventRule[]

  constructor(rules: EventRule[]) {
    this.rules = rules
  }

  evaluate(event: string, state: EventRuntimeState): EventRuleEvaluation[] {
    return this.rules.filter((rule) => rule.event === event).map((rule) => {
      const reason: string[] = []
      let matched = true
      const decisionConflicts = state.conflicts.filter((conflict) => conflict.decision_relevant)
      if (rule.conditions.same_issue === true && decisionConflicts.length === 0) {
        matched = false
        reason.push('no_decision_relevant_conflict')
      }
      if (typeof rule.conditions.severity_gte === 'number' && !decisionConflicts.some((conflict) => conflict.severity >= Number(rule.conditions.severity_gte))) {
        matched = false
        reason.push('severity_below_threshold')
      }
      if (rule.conditions.no_new_evidence === true && !state.noNewEvidence) {
        matched = false
        reason.push('new_evidence_available')
      }
      if (rule.conditions.retry_limit_reached === true && !state.retryLimitReached) {
        matched = false
        reason.push('retry_limit_not_reached')
      }
      if (event === 'low_change_high_disagreement') {
        if (!state.lowChange) {
          matched = false
          reason.push('change_not_low')
        }
        if (!state.highResidualDisagreement) {
          matched = false
          reason.push('residual_disagreement_not_high')
        }
      }
      if (event === 'soft_or_hard_deadline' && !state.deadlineReached) {
        matched = false
        reason.push('deadline_not_reached')
      }
      if (event === 'new_material_evidence') {
        if (rule.conditions.verified === true && !state.evidenceVerified) {
          matched = false
          reason.push('evidence_not_verified')
        }
        if (rule.conditions.decision_relevant === true && !state.evidenceDecisionRelevant) {
          matched = false
          reason.push('evidence_not_decision_relevant')
        }
      }
      let terminalState: TerminalState | undefined
      if (matched && rule.on_unresolved === 'IMPASSE') terminalState = 'IMPASSE'
      if (matched && event === 'material_conflict_detected' && state.authorityRequired && decisionConflicts.some((conflict) => conflict.conflict_type === 'authority')) terminalState = 'HUMAN_ESCALATION'
      return {
        rule_id: rule.id,
        event,
        matched,
        actions: matched ? [...rule.actions] : [],
        reason: matched ? 'conditions_satisfied' : reason.join(',') || 'conditions_not_satisfied',
        terminal_state: terminalState,
      }
    })
  }
}

export function classifyImpasse(conflicts: ConflictRecord[]): ConflictRecord['conflict_type'] {
  const ranked = conflicts.filter((conflict) => conflict.resolution_status === 'open' || conflict.resolution_status === 'retained')
    .sort((left, right) => Number(right.decision_relevant) - Number(left.decision_relevant) || right.severity - left.severity)
  return ranked[0]?.conflict_type ?? 'value'
}

export function createImpasseReport(input: {
  issueId: string
  conflicts: ConflictRecord[]
  agreedItems: string[]
  unresolvedClaims: string[]
  minorityPositions: string[]
  missingEvidence: string[]
  attemptedResolutions: string[]
}): ImpasseReport {
  const type = classifyImpasse(input.conflicts)
  const nextActions: Record<ConflictRecord['conflict_type'], string[]> = {
    fact: ['等待或委托独立证据核验', '证据补齐后重开相关议题'],
    interest: ['进入补偿与可接受区间调解', '由授权主体确认资源分配边界'],
    value: ['保留异议并寻找有限重叠共识', '避免将价值分歧伪装成事实结论'],
    procedure: ['依据规则表决或重开程序设计', '由程序监督者确认有效性'],
    authority: ['升级给具有最终权限的人类主体'],
    resource: ['缩小执行范围、延期或重新分配资源'],
  }
  return {
    id: recordId('impasse'), version: 1, created_at: new Date().toISOString(), created_by: 'impasse_detection_v1',
    source_refs: input.conflicts.map((conflict) => conflict.id), visibility: ['public', 'audit'], status: 'valid',
    decision_status: 'impasse', impasse_type: type, agreed_items: input.agreedItems,
    unresolved_claims: input.unresolvedClaims, blocking_constraints: input.conflicts.map((conflict) => `${conflict.conflict_type}:${conflict.severity}`),
    minority_positions: input.minorityPositions, missing_evidence: input.missingEvidence,
    attempted_resolutions: input.attemptedResolutions, recommended_next_actions: nextActions[type],
  }
}

export function createTerminalReport(input: {
  terminalState: TerminalState
  trace: { phase_id: string; state: string }[]
  reasonCodes: string[]
  unresolvedItems: string[]
  missingEvidence: string[]
  minorityPositions: string[]
  recommendedNextActions: string[]
  impasseReport?: ImpasseReport
}): TerminalReport {
  return {
    id: recordId('terminal'), version: 1, created_at: new Date().toISOString(), created_by: 'terminal_state_machine',
    source_refs: input.impasseReport ? [input.impasseReport.id] : [], visibility: ['public', 'audit'], status: 'valid',
    terminal_state: input.terminalState, reason_codes: input.reasonCodes,
    completed_phase_ids: [...new Set(input.trace.filter((entry) => entry.state === 'completed').map((entry) => entry.phase_id))],
    skipped_phase_ids: [...new Set(input.trace.filter((entry) => entry.state === 'skipped').map((entry) => entry.phase_id))],
    unresolved_items: input.unresolvedItems, missing_evidence: input.missingEvidence,
    minority_positions: input.minorityPositions, recommended_next_actions: input.recommendedNextActions,
    impasse_report: input.impasseReport,
  }
}
