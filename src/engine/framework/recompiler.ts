import type { EvidenceSubmission, GraphRecompileResult, Phase, PhaseGraph } from '../types'
import { MODIFIER_REGISTRY, policyToLegacyCombo } from './registry'

function evidencePhase(id: string, issueId: string, evidenceId: string): Phase {
  const policy = { A: 'A3', B: 'B3', C: 'C4', D: 'D3', E: 'E1' } as const
  const modifiers = [MODIFIER_REGISTRY.evidence_priority]
  return {
    id, name: '新证据独立核验', purpose: '核验新证据的来源、时间、范围及对既有结论的影响',
    strategy: policyToLegacyCombo(policy, modifiers), policy, modifiers, protocol_id: 'evidence_evaluation_v1',
    kind: 'evaluate', config: { issue_id: issueId, evidence_id: evidenceId, dynamic_recompile: true },
    depends_on: [], required: true, skippable_on_deadline: false,
    entry_conditions: ['verified_new_evidence_registered'], exit_conditions: ['evidence_impact_assessed'], transitions: [],
  }
}

/** 确定性动态重编译：在受影响节点前插入核验阶段，并使下游节点依赖该核验。 */
export function recompileForNewEvidence(graph: PhaseGraph, evidence: EvidenceSubmission, affectedIssueIds: string[]): GraphRecompileResult {
  if (!evidence.verified) {
    return { graph, reopened_issue_ids: [], inserted_phase_ids: [], reason: 'evidence_not_verified' }
  }
  const suffix = evidence.id.replace(/[^a-zA-Z0-9_]/g, '_')
  const phaseId = `evidence_review_${suffix}`
  if (graph.phases.some((phase) => phase.id === phaseId)) {
    return { graph, reopened_issue_ids: affectedIssueIds, inserted_phase_ids: [], reason: 'evidence_already_compiled' }
  }
  const finalizationIndex = graph.phases.findIndex((phase) => phase.kind === 'evaluate' || phase.kind === 'report')
  const insertionIndex = finalizationIndex >= 0 ? finalizationIndex : graph.phases.length
  const phase = evidencePhase(phaseId, evidence.issue_id, evidence.id)
  const previous = graph.phases[insertionIndex - 1]
  phase.depends_on = previous ? [previous.id] : []
  const next = graph.phases[insertionIndex]
  if (next) phase.transitions = [{ condition: 'artifacts_valid', target: next.id }]

  const phases = graph.phases.map((item) => ({ ...item, depends_on: [...item.depends_on], transitions: item.transitions.map((transition) => ({ ...transition })) }))
  if (previous && next) {
    const previousCopy = phases[insertionIndex - 1]
    previousCopy.transitions = previousCopy.transitions.map((transition) => transition.target === next.id ? { ...transition, target: phaseId } : transition)
  }
  if (next) phases[insertionIndex] = { ...phases[insertionIndex], depends_on: [...new Set([...phases[insertionIndex].depends_on.filter((id) => id !== previous?.id), phaseId])] }
  phases.splice(insertionIndex, 0, phase)
  return {
    graph: { entry_phase_id: graph.entry_phase_id, phases }, reopened_issue_ids: [...new Set(affectedIssueIds)],
    inserted_phase_ids: [phaseId], reason: 'verified_decision_relevant_evidence_reopened_issue_and_recompiled_graph',
  }
}
