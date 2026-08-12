import type { EvidenceSubmission, EventRuleEvaluation, GraphRecompileResult, ScenarioConfig } from '../types'
import { EventRuleEngine } from './events'
import { StructuredBlackboard } from './memory'
import { recompileForNewEvidence } from './recompiler'

export interface EvidenceReopenResult {
  accepted: boolean
  evaluations: EventRuleEvaluation[]
  recompile: GraphRecompileResult
  invalidated_entry_ids: string[]
  config: ScenarioConfig
}

/**
 * 新证据事件的确定性执行边界：未核验证据只登记为未知项；
 * 已核验且影响决策的证据会重开议题、废止下游工件并重编译 DAG。
 */
export function processNewEvidence(input: {
  config: ScenarioConfig
  blackboard: StructuredBlackboard
  evidence: EvidenceSubmission
  affectedIssueIds: string[]
  decisionRelevant: boolean
}): EvidenceReopenResult {
  const { config, blackboard, evidence } = input
  const evaluations = new EventRuleEngine(config.event_rules).evaluate('new_material_evidence', {
    conflicts: blackboard.snapshot().conflicts, lowChange: false, highResidualDisagreement: false,
    noNewEvidence: false, retryLimitReached: false, authorityRequired: config.guards.human_authority_required,
    evidenceVerified: evidence.verified, evidenceDecisionRelevant: input.decisionRelevant,
  })
  const accepted = evaluations.some((evaluation) => evaluation.matched)
  blackboard.writeRecord({
    register: accepted ? 'evidence' : 'unknowns', issueId: evidence.issue_id, phaseId: 'event:new_material_evidence',
    payload: evidence, createdBy: 'evidence_event_rule', sourceRefs: [evidence.source], visibility: ['public', 'audit'],
  })
  if (!accepted) {
    return {
      accepted: false, evaluations, invalidated_entry_ids: [], config,
      recompile: { graph: config.phase_graph, reopened_issue_ids: [], inserted_phase_ids: [], reason: evidence.verified ? 'evidence_not_decision_relevant' : 'evidence_not_verified' },
    }
  }

  const affected = new Set(input.affectedIssueIds)
  const invalidated = blackboard.invalidateEntries((entry) => affected.has(entry.issue_id)
    && entry.phase_id !== 'event:new_material_evidence'
    && (entry.register === 'decisions' || entry.register === 'artifacts'))
  const recompile = recompileForNewEvidence(config.phase_graph, evidence, input.affectedIssueIds)
  const issueGraph = {
    ...config.issue_graph,
    issues: config.issue_graph.issues.map((issue) => affected.has(issue.id) ? { ...issue, status: 'open' as const } : issue),
  }
  const nextConfig: ScenarioConfig = {
    ...config, issue_graph: issueGraph, phase_graph: recompile.graph, phases: recompile.graph.phases,
  }
  return { accepted: true, evaluations, recompile, invalidated_entry_ids: invalidated.map((entry) => entry.id), config: nextConfig }
}
