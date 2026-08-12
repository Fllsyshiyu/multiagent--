import type {
  BaseStrategyId, EventRule, PhasePolicy, PolicyModifier, ProtocolContract,
  StrategyCombo,
} from '../types'

export interface StrategyDefinition {
  id: BaseStrategyId
  family: 'A' | 'B' | 'C' | 'D' | 'E'
  name: string
  description: string
}

export const STRATEGY_REGISTRY: Record<BaseStrategyId, StrategyDefinition> = {
  A1: { id: 'A1', family: 'A', name: '全体激活', description: '所有合格 Agent 均获得基本表达机会' },
  A2: { id: 'A2', family: 'A', name: '代表制', description: '按利益群体、能力或配额选择代表' },
  A3: { id: 'A3', family: 'A', name: '最小能力团队', description: '激活覆盖必要能力的最小 Agent 集合' },
  A4: { id: 'A4', family: 'A', name: '动态轮换', description: '按事件、冲突和参与度动态调整席位' },
  B1: { id: 'B1', family: 'B', name: '全量路由', description: '传递完整历史和前序产出' },
  B2: { id: 'B2', family: 'B', name: '摘要路由', description: '仅传递结构化摘要和未决项' },
  B3: { id: 'B3', family: 'B', name: '角色路由', description: '按角色、权限和职责差异化分发信息' },
  C1: { id: 'C1', family: 'C', name: '自由思考', description: '不施加主导认知框架' },
  C2: { id: 'C2', family: 'C', name: '立场制', description: '按指定利益立场组织推理' },
  C3: { id: 'C3', family: 'C', name: '六帽思考', description: '按轮次统一切换思维角度' },
  C4: { id: 'C4', family: 'C', name: '对抗制', description: '以正反交替方式压力测试方案' },
  C5: { id: 'C5', family: 'C', name: 'Delphi', description: '匿名独立判断、聚合反馈与迭代修订' },
  D1: { id: 'D1', family: 'D', name: '自由文本', description: '自然语言输出，无 Schema 约束' },
  D2: { id: 'D2', family: 'D', name: '结构化工件', description: '按预定义 Schema 输出可比较工件' },
  D3: { id: 'D3', family: 'D', name: '置信度工件', description: '结构化字段附置信度和不确定性来源' },
  E1: { id: 'E1', family: 'E', name: '固定轮次', description: '达到固定轮次或时间窗口后转换' },
  E2: { id: 'E2', family: 'E', name: '收敛检测', description: '连续 K 轮变化低于阈值后转换' },
  E3: { id: 'E3', family: 'E', name: '对抗循环', description: '正反方完成预设交替回合后转换' },
  E4: { id: 'E4', family: 'E', name: '时序循环', description: '完成预定义模板序列后转换' },
  E5: { id: 'E5', family: 'E', name: '投票决议', description: '资格校验、独立投票、计票后转换' },
}

export const MODIFIER_REGISTRY: Record<string, PolicyModifier> = {
  private_channel: { id: 'private_channel', kind: 'communication_mode', config: { mode: 'private' } },
  topic_filter: { id: 'topic_filter', kind: 'topic_filter', config: { topics: [] } },
  anonymous_submission: { id: 'anonymous_submission', kind: 'anonymous_submission', config: {} },
  minority_seat: { id: 'minority_seat', kind: 'minority_seat_required', config: { min_seats: 1 } },
  speaking_quota: { id: 'speaking_quota', kind: 'speaking_quota', config: { max_share: 0.4 } },
  outer_ring: { id: 'outer_ring', kind: 'outer_ring_observer', config: {} },
  independent_commit: { id: 'independent_commit', kind: 'independent_commit', config: {} },
  evidence_priority: { id: 'evidence_priority', kind: 'evidence_priority', config: { source_required: true } },
}

const fishbowlPolicy: PhasePolicy = { A: 'A4', B: 'B2', C: 'C2', D: 'D2', E: 'E1' }

export const PROTOCOL_REGISTRY: Record<string, ProtocolContract> = {
  fishbowl_v1: {
    id: 'fishbowl_v1', version: '1.0.0',
    entry_conditions: ['participants_gte_5', 'rotation_enabled'],
    default_policy: fishbowlPolicy,
    modifiers: [MODIFIER_REGISTRY.outer_ring, MODIFIER_REGISTRY.speaking_quota, MODIFIER_REGISTRY.minority_seat],
    events: ['low_participation_rotate', 'material_conflict_route'],
    exit_conditions: ['every_key_issue_has_response', 'fixed_rounds_complete'],
  },
  independent_commit_v1: {
    id: 'independent_commit_v1', version: '1.0.0',
    entry_conditions: ['participants_gte_1'],
    default_policy: { A: 'A1', B: 'B3', C: 'C2', D: 'D2', E: 'E1' },
    modifiers: [MODIFIER_REGISTRY.independent_commit], events: [], exit_conditions: ['all_required_artifacts_valid'],
  },
  dialectical_review_v1: {
    id: 'dialectical_review_v1', version: '1.0.0',
    entry_conditions: ['candidate_exists'],
    default_policy: { A: 'A4', B: 'B2', C: 'C4', D: 'D2', E: 'E3' },
    modifiers: [MODIFIER_REGISTRY.evidence_priority], events: ['material_conflict_route'], exit_conditions: ['review_rounds_complete'],
  },
  delphi_v1: {
    id: 'delphi_v1', version: '1.0.0',
    entry_conditions: ['expert_judgment_required', 'anonymous_submission_available'],
    default_policy: { A: 'A3', B: 'B2', C: 'C5', D: 'D3', E: 'E2' },
    modifiers: [MODIFIER_REGISTRY.anonymous_submission, MODIFIER_REGISTRY.independent_commit],
    events: ['new_evidence_reopen'], exit_conditions: ['confidence_distribution_stable', 'max_rounds_complete'],
  },
  roberts_rules_v1: {
    id: 'roberts_rules_v1', version: '1.0.0',
    entry_conditions: ['eligible_members_valid', 'quorum_valid', 'single_motion_exists'],
    default_policy: { A: 'A2', B: 'B1', C: 'C2', D: 'D2', E: 'E5' },
    modifiers: [], events: ['motion_amended', 'new_evidence_reopen'],
    exit_conditions: ['motion_disposed', 'meeting_adjourned'],
  },
  rules_based_vote_v1: {
    id: 'rules_based_vote_v1', version: '1.0.0',
    entry_conditions: ['eligible_voters_valid', 'quorum_valid', 'candidate_exists'],
    default_policy: { A: 'A2', B: 'B2', C: 'C2', D: 'D2', E: 'E5' },
    modifiers: [], events: [], exit_conditions: ['vote_complete'],
  },
  structured_synthesis_v1: {
    id: 'structured_synthesis_v1', version: '1.0.0',
    entry_conditions: ['required_inputs_available'],
    default_policy: { A: 'A3', B: 'B2', C: 'C1', D: 'D2', E: 'E1' },
    modifiers: [], events: [], exit_conditions: ['artifact_valid'],
  },
  structured_scoring_v1: {
    id: 'structured_scoring_v1', version: '1.0.0',
    entry_conditions: ['candidate_exists'],
    default_policy: { A: 'A1', B: 'B3', C: 'C2', D: 'D2', E: 'E1' },
    modifiers: [MODIFIER_REGISTRY.independent_commit], events: [], exit_conditions: ['all_scores_valid'],
  },
  evidence_evaluation_v1: {
    id: 'evidence_evaluation_v1', version: '1.0.0',
    entry_conditions: ['candidate_exists', 'mandatory_evidence_state_known'],
    default_policy: { A: 'A3', B: 'B2', C: 'C4', D: 'D2', E: 'E1' },
    modifiers: [MODIFIER_REGISTRY.evidence_priority], events: [], exit_conditions: ['mandatory_gates_evaluated'],
  },
  audit_report_v1: {
    id: 'audit_report_v1', version: '1.0.0',
    entry_conditions: ['evaluation_complete'],
    default_policy: { A: 'A3', B: 'B2', C: 'C1', D: 'D2', E: 'E1' },
    modifiers: [], events: [], exit_conditions: ['terminal_report_created'],
  },
}

export const EVENT_RULE_REGISTRY: Record<string, EventRule> = {
  material_conflict_route_v1: {
    id: 'material_conflict_route_v1', event: 'material_conflict_detected',
    conditions: { same_issue: true, severity_gte: 0.7, decision_relevant: true },
    actions: ['register_conflict', 'route_by_conflict_type', 'request_targeted_response', 'update_position_snapshot'],
    retry_limit: 2, on_unresolved: 'evaluate_impasse_or_escalate',
  },
  deadline_finalize_v1: {
    id: 'deadline_finalize_v1', event: 'soft_or_hard_deadline', conditions: {},
    actions: ['stop_new_branches', 'run_mandatory_gates', 'finalize_best_valid_candidate'],
    retry_limit: 0, on_unresolved: 'provisional_or_aborted',
  },
  impasse_detection_v1: {
    id: 'impasse_detection_v1', event: 'low_change_high_disagreement',
    conditions: { no_new_evidence: true, retry_limit_reached: true },
    actions: ['classify_impasse', 'create_impasse_report'], retry_limit: 0, on_unresolved: 'IMPASSE',
  },
  new_evidence_reopen_v1: {
    id: 'new_evidence_reopen_v1', event: 'new_material_evidence',
    conditions: { verified: true, decision_relevant: true },
    actions: ['register_evidence', 'reopen_affected_issue', 'invalidate_downstream_artifacts', 'recompile_phase_graph'],
    retry_limit: 1, on_unresolved: 'WAITING_FOR_EVIDENCE',
  },
}

export function deriveOutputStrategy(policy: Omit<PhasePolicy, 'D'>, risk: 'low' | 'medium' | 'high' | 'critical'): PhasePolicy['D'] {
  if (policy.C === 'C5' || risk === 'high' || risk === 'critical') return 'D3'
  if (policy.C === 'C2' || policy.C === 'C3' || policy.C === 'C4') return 'D2'
  return 'D1'
}

export function policyToLegacyCombo(policy: PhasePolicy, modifiers: PolicyModifier[] = [], notes: string[] = []): StrategyCombo {
  const modifierNotes = modifiers.map((modifier) => `Modifier:${modifier.id}`)
  return { A: [policy.A], B: policy.B, C: policy.C, D: policy.D, E: [policy.E], notes: [...notes, ...modifierNotes] }
}

export const STRATEGY_LABELS = Object.fromEntries(
  Object.values(STRATEGY_REGISTRY).map((strategy) => [strategy.id, strategy.name]),
) as Record<BaseStrategyId, string>
