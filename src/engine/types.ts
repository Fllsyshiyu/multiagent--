/**
 * MA-Collab v2.0 · 通用多智能体编排框架
 * 统一数据契约：Live 模式与回放模式共用的 Schema
 * 对应《优化框架》：Dispatcher / 原子策略 / 决策表 / 编排引擎 / 博弈扩展
 */

// ============ Dispatcher · TaskProfile ============

import type { ComplexityResult } from '../complexity/types'

export type TaskType = 'single' | 'collaborative' | 'competitive'
export type TimePressure = 'urgent' | 'sustained' | 'relaxed'
export type InfoAsymmetry = 'high' | 'medium' | 'low'
export type AgentRelations = 'cooperative' | 'adversarial' | 'mixed'
export type DecisionPattern = 'single_shot' | 'sequential'
export type Scarcity = 'high' | 'medium' | 'low'
export type Verifiability = 'automatable' | 'partially' | 'subjective'

export interface TaskProfile {
  agent_count: number
  task_type: TaskType
  game_type: string | null
  domain: string
  time_pressure: TimePressure
  information_asymmetry: InfoAsymmetry
  agent_relations: AgentRelations
  decision_pattern: DecisionPattern
  resource_scarcity: Scarcity
  verifiability: Verifiability
  reasoning: string // Dispatcher 的分类理由（展示用）
  /** 最终交付物。缺省等同于 text，保持旧配置与回放脚本兼容。 */
  deliverable?: 'text' | 'presentation'
}

// ============ 最终框架 · 五维 20 项 Base Strategy ============

export type ParticipationStrategy = 'A1' | 'A2' | 'A3' | 'A4'
export type InformationStrategy = 'B1' | 'B2' | 'B3'
export type ThinkingStrategy = 'C1' | 'C2' | 'C3' | 'C4' | 'C5'
export type OutputStrategy = 'D1' | 'D2' | 'D3'
export type TransitionStrategy = 'E1' | 'E2' | 'E3' | 'E4' | 'E5'
export type BaseStrategyId = ParticipationStrategy | InformationStrategy | ThinkingStrategy | OutputStrategy | TransitionStrategy

export interface PhasePolicy {
  A: ParticipationStrategy
  B: InformationStrategy
  C: ThinkingStrategy
  D: OutputStrategy
  E: TransitionStrategy
}

export type ModifierKind =
  | 'communication_mode'
  | 'topic_filter'
  | 'anonymous_submission'
  | 'hierarchical_reporting'
  | 'minority_seat_required'
  | 'evidence_priority'
  | 'speaking_quota'
  | 'outer_ring_observer'
  | 'independent_commit'

export interface PolicyModifier {
  id: string
  kind: ModifierKind
  config: Record<string, unknown>
}

/**
 * UI 兼容投影。内核不再用数组表达同族 Base 叠加；A/E 最多各包含一个值。
 * 等前端获批迁移后可直接展示 PhasePolicy + modifiers。
 */

export interface StrategyCombo {
  A: string[]
  B: string
  C: string
  D: string
  E: string[]
  notes: string[]
}

// ============ Agent ============

export interface AgentCard {
  id: string
  name: string
  archetype: string // 角色原型：直接受益者 / 直接受影响者 / 治理方 / 专业观察者 ...
  relationship: string
  interests: string[]
  stance: string
  can_say: string[]
  cannot_say: string[]
  private_info?: string // B3 角色路由下仅自己可见的信息
  secret_role?: string // werewolf extension
  team?: string
  capabilities?: string[]
  tools?: string[]
  authority?: AgentAuthority
  sop?: string[]
  visibility?: string[]
}

export interface AgentAuthority {
  can_recommend: boolean
  can_approve: boolean
  can_block_on_violation: boolean
}

export interface AgentContract extends AgentCard {
  capabilities: string[]
  tools: string[]
  authority: AgentAuthority
  sop: string[]
  visibility: string[]
}

// ============ 阶段与条件边 ============

export interface PhaseTransition {
  condition: string
  target: string
  max_retries?: number
}

export interface Phase {
  id: string
  name: string
  purpose: string
  strategy: StrategyCombo
  policy: PhasePolicy
  modifiers: PolicyModifier[]
  protocol_id: string
  kind: 'speak' | 'aggregate' | 'score' | 'analyze' | 'fishbowl' | 'propose' | 'evaluate' | 'game_night' | 'game_day' | 'vote' | 'report'
  config: Record<string, unknown>
  depends_on: string[]
  required: boolean
  skippable_on_deadline: boolean
  entry_conditions: string[]
  exit_conditions: string[]
  failure_target?: string
  transitions: PhaseTransition[]
}

export interface PhaseGraph {
  entry_phase_id: string
  phases: Phase[]
}

export type ProtocolTemplateId = 'fishbowl_v1' | 'delphi_v1' | 'dialectical_review_v1' | 'roberts_rules_v1'

export interface ProtocolTemplate {
  id: ProtocolTemplateId
  name: string
  description: string
  phases: Phase[]
}

export interface ScenarioSpec {
  scenario_id: string
  domain: string
  objective: string
  urgency: 'low' | 'medium' | 'high'
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  reversibility: 'reversible' | 'partially_reversible' | 'irreversible'
  stakeholders: string[]
  required_capabilities: string[]
  authority_map: Record<string, string[]>
  known_facts: string[]
  unknowns: string[]
  hard_constraints: string[]
  success_criteria: string[]
}

export interface IssueNode {
  id: string
  title: string
  description: string
  depends_on: string[]
  stakeholder_ids: string[]
  status: 'open' | 'resolved' | 'blocked'
}

export interface IssueGraph {
  root_issue_id: string
  issues: IssueNode[]
}

export interface GuardSet {
  max_tokens: number
  max_model_calls: number
  hard_timeout_ms: number
  soft_limit_ratio: number
  reserved_finalization_ratio: number
  human_authority_required: boolean
  minority_report_required: boolean
  mock_fallback_forbidden: boolean
  mandatory_gates: string[]
}

export interface ProtocolContract {
  id: string
  version: string
  entry_conditions: string[]
  default_policy: PhasePolicy
  modifiers: PolicyModifier[]
  events: string[]
  exit_conditions: string[]
}

export interface EventRule {
  id: string
  event: string
  conditions: Record<string, unknown>
  actions: string[]
  retry_limit: number
  on_unresolved: string
}

export type TerminalState = 'DECIDED' | 'PROVISIONAL' | 'IMPASSE' | 'WAITING_FOR_EVIDENCE' | 'HUMAN_ESCALATION' | 'ABORTED'

export interface CompileRationale {
  selected_protocol: string
  reasons: string[]
  alternatives: string[]
  confidence: number
  expected_model_calls: number
  expected_token_range: [number, number]
}

export interface VersionedRecord {
  id: string
  version: number
  created_at: string
  created_by: string
  source_refs: string[]
  visibility: string[]
  status: 'draft' | 'valid' | 'superseded' | 'rejected'
}

export type BlackboardRegister = 'facts' | 'claims' | 'evidence' | 'objections' | 'unknowns' | 'decisions' | 'checkpoints' | 'artifacts'

export interface BlackboardEntry extends VersionedRecord {
  register: BlackboardRegister
  issue_id: string
  phase_id: string
  payload: unknown
}

export interface ConflictRecord extends VersionedRecord {
  issue_id: string
  conflict_type: 'fact' | 'interest' | 'value' | 'procedure' | 'authority' | 'resource'
  severity: number
  decision_relevant: boolean
  claim_refs: string[]
  resolution_status: 'open' | 'resolved' | 'retained' | 'escalated'
  resolution?: string
}

export interface PositionRevision extends VersionedRecord {
  issue_id: string
  agent_id: string
  phase_id: string
  position_before: string
  position_after: string
  reasoning_before_ref?: string
  reasoning_after_ref?: string
  revision_reason: string
  cited_argument_ids: string[]
  self_reported_trigger: string
  confidence: number
  causal_status: 'self_reported' | 'observed_correlation'
}

export type AlignmentDriftFlag =
  | 'OBJECTIVE_DRIFT'
  | 'LOCAL_SOLUTION_PRESENTED_AS_GLOBAL'
  | 'UNMAPPED_ISSUE'
  | 'REQUIRED_ARTIFACT_MISSING'
  | 'UNKNOWN_PROMOTED_TO_FACT'
  | 'UNRESOLVED_ISSUE_DROPPED'
  | 'CONSTRAINT_VIOLATION'
  | 'MINORITY_POSITION_LOST'

export type CheckpointDecision = 'CONTINUE' | 'RETRY_PHASE' | 'RECOMPILE' | 'WAITING_FOR_EVIDENCE' | 'HUMAN_ESCALATION'
export type CheckpointTrigger = 'COMPILE' | 'PHASE_EXIT' | 'NEW_EVIDENCE' | 'PRE_TERMINAL' | 'TERMINAL'

export interface SemanticAlignmentReview {
  aligned: boolean
  current_focus: string
  drift_flags: Extract<AlignmentDriftFlag, 'OBJECTIVE_DRIFT' | 'LOCAL_SOLUTION_PRESENTED_AS_GLOBAL'>[]
  rationale: string
}

export interface TaskCheckpoint extends VersionedRecord {
  sequence: number
  trigger: CheckpointTrigger
  issue_id: string
  phase_id: string
  original_objective: string
  current_focus: string
  resolved_items: string[]
  open_items: string[]
  blocked_items: string[]
  confirmed_facts: string[]
  unverified_claims: string[]
  missing_evidence: string[]
  active_constraints: string[]
  minority_positions: string[]
  provisional_decisions: string[]
  next_required_actions: string[]
  drift_flags: AlignmentDriftFlag[]
  checkpoint_decision: CheckpointDecision
  decision_reasons: string[]
  semantic_review?: SemanticAlignmentReview
}

export interface SemanticReviewCandidate {
  original_objective: string
  current_focus: string
  phase_id: string
  phase_purpose: string
  open_items: string[]
  recent_artifacts: string[]
}

export interface ModelInvocation extends VersionedRecord {
  phase_id: string
  agent_id?: string
  mode: 'live' | 'replay' | 'mock'
  model: string
  system_prompt: string
  user_prompt: string
  parameters: Record<string, unknown>
  tokens: number
  latency_ms: number
  result_status: 'success' | 'error'
  error?: string
}

export interface RunTraceEntry extends VersionedRecord {
  run_id: string
  phase_id: string
  state: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  transition_reason: string
  input_refs: string[]
  output_refs: string[]
}

export interface ImpasseReport extends VersionedRecord {
  decision_status: 'impasse'
  impasse_type: ConflictRecord['conflict_type']
  agreed_items: string[]
  unresolved_claims: string[]
  blocking_constraints: string[]
  minority_positions: string[]
  missing_evidence: string[]
  attempted_resolutions: string[]
  recommended_next_actions: string[]
}

export interface EventRuleEvaluation {
  rule_id: string
  event: string
  matched: boolean
  actions: string[]
  reason: string
  terminal_state?: TerminalState
}

export interface EvidenceSubmission {
  id: string
  issue_id: string
  claim: string
  source: string
  observed_at: string
  scope: string
  confidence: number
  verified: boolean
}

export interface GraphRecompileResult {
  graph: PhaseGraph
  reopened_issue_ids: string[]
  inserted_phase_ids: string[]
  reason: string
}

export type ExperimentArmKind = 'single_agent' | 'fixed_multi_agent' | 'orchestrated_multi_agent' | 'strategy_ablation'

export interface ExperimentBudget {
  max_tokens: number
  max_model_calls: number
  hard_timeout_ms: number
}

export interface ExperimentObservation {
  quality: number
  evidence_grounding: number
  minority_retention: number
  conflict_resolution: number
  terminal_explainability: number
  tokens: number
  model_calls: number
  elapsed_ms: number
}

export interface ExperimentArmResult {
  arm_id: string
  kind: ExperimentArmKind
  protocol_id?: string
  ablated_strategy?: BaseStrategyId
  budget: ExperimentBudget
  observation: ExperimentObservation
  budget_compliant: boolean
  normalized_score: number
}

export interface ExperimentReport {
  experiment_id: string
  scenario_id: string
  equal_budget_verified: boolean
  arms: ExperimentArmResult[]
  winner_arm_id?: string
  ablation_effects: Record<string, number>
}

export interface TransferScenario {
  id: string
  domain: 'community_governance' | 'enterprise_resource_allocation' | 'incident_response'
  prompt: string
  profile: TaskProfile
  expected_protocols: ProtocolTemplateId[]
  required_capabilities: string[]
  expected_terminal_states: TerminalState[]
}

export interface TerminalReport extends VersionedRecord {
  terminal_state: TerminalState
  reason_codes: string[]
  completed_phase_ids: string[]
  skipped_phase_ids: string[]
  unresolved_items: string[]
  missing_evidence: string[]
  minority_positions: string[]
  recommended_next_actions: string[]
  impasse_report?: ImpasseReport
}

// ============ ScenarioConfig（Scenario Compiler 输出） ============

export interface ScenarioConfig {
  scenario_id: string
  title: string
  user_input: string
  profile: TaskProfile
  strategy: StrategyCombo
  agents: AgentCard[]
  phases: Phase[]
  scenario_spec: ScenarioSpec
  issue_graph: IssueGraph
  agent_contracts: AgentContract[]
  phase_graph: PhaseGraph
  guards: GuardSet
  protocol: ProtocolContract
  event_rules: EventRule[]
  terminal_states: TerminalState[]
  compile_rationale: CompileRationale
  case_context: string
  hard_constraints: string[]
  exam_blueprint?: ExamBlueprint
  /** 仅在首页“协作生成 PPT”任务中存在；普通议事配置不受影响。 */
  presentation_brief?: PresentationBrief
}

// ============ 协作轨道工件 ============

export interface InitialAssessmentCard {
  kind: 'InitialAssessmentCard'
  agent_id: string
  initial_stance: string
  main_concerns: string[]
  proposal_sketch: string[]
  non_negotiables: string[]
  possible_concessions: string[]
  content: string // 自然语言陈述
}

export interface CandidateProposal {
  kind: 'CandidateProposal'
  proposal_id: string
  title: string
  summary: string
  supporters: string[]
}

export interface PlanScoreCard {
  kind: 'PlanScoreCard'
  agent_id: string
  proposal_id: string
  support_score: number // 1-5
  feasibility_score: number
  fairness_score: number
  risk_score: number
  main_objection: string
  support_condition: string
}

export interface ConflictMap {
  kind: 'ConflictMap'
  leading_proposal: string
  main_supporters: string[]
  main_opponents: string[]
  veto_risks: string[]
  minority_opinions: string[]
  evidence_gaps: string[]
}

export interface ObjectionCard {
  kind: 'ObjectionCard'
  round: number
  agent_id: string
  objection_type: string // 利益受损 / 公共资源 / 可执行性 / 普遍化
  objection: string
  required_revision: string[]
  support_condition: string
  reply_to?: string
}

export interface OuterObservationCard {
  kind: 'OuterObservationCard'
  round: number
  agent_id: string
  missed_issue: string
  objection: string
  evidence_needed: string[]
  request_to_enter_inner_circle: boolean
  absorbed: boolean
}

export interface FishbowlSummaryCard {
  kind: 'FishbowlSummaryCard'
  round: number
  inner_circle: string[]
  outer_circle: string[]
  majority_views: string[]
  minority_views: string[]
  core_conflicts: string[]
  unanswered_questions: string[]
  absorbed_observations: string[]
  next_round_invitees: string[]
}

export interface FinalProposal {
  kind: 'FinalProposal'
  title: string
  goal: string
  measures: string[]
  responsible_parties: string[]
  resources: string
  timeline: string
  risk_control: string[]
  exit_mechanism: string
  review_mechanism: string
  revision_path: string[] // 方案如何由异议逐步修改而来
}

// ============ 演示文稿生产扩展工件 ============

export interface PresentationBrief {
  kind: 'PresentationBrief'
  title: string
  objective: string
  audience: string
  purpose: string
  language: string
  tone: string
  slide_count: number
  constraints: string[]
}

export interface PresentationResearchPlan {
  kind: 'PresentationResearchPlan'
  questions: string[]
  evidence_requirements: string[]
  assignments: { agent_id: string; task: string }[]
  limitations: string[]
}

export interface PresentationEvidenceCard {
  kind: 'PresentationEvidenceCard'
  evidence_id: string
  claim: string
  summary: string
  source_type: 'attachment' | 'user_input' | 'model_background' | 'evidence_gap'
  source_ref: string
  confidence: 'high' | 'medium' | 'low'
  verified: boolean
}

export interface PresentationOutline {
  kind: 'PresentationOutline'
  thesis: string
  storyline: string
  sections: { title: string; purpose: string; key_message: string; evidence_refs: string[] }[]
}

export type PresentationSlideType = 'cover' | 'agenda' | 'key_message' | 'comparison' | 'timeline' | 'process' | 'evidence' | 'conclusion'

export interface PresentationSlideSpec {
  slide_id: string
  type: PresentationSlideType
  title: string
  subtitle?: string
  key_message: string
  bullets: string[]
  columns?: { title: string; points: string[] }[]
  steps?: { title: string; detail: string }[]
  source_refs: string[]
  speaker_notes: string
}

export interface PresentationDeck {
  kind: 'PresentationDeck'
  title: string
  subtitle: string
  brief: PresentationBrief
  slides: PresentationSlideSpec[]
  sources: { id: string; label: string; verified: boolean }[]
  qa: { passed: boolean; checks: string[]; warnings: string[] }
}

export interface PresentationDeckReview {
  kind: 'PresentationDeckReview'
  passed: boolean
  score: number
  strengths: string[]
  issues: string[]
  revision_instructions: string[]
}

// ============ 试卷评估 ============

export interface ExamObjectiveItem {
  module: string
  full_score: number
  check: string
}

export interface ExamSubjectiveItem {
  module: string
  full_score: number
  rubric: string
}

export interface ExamBlueprint {
  kind: 'ExamBlueprint'
  red_lines: string[]
  objective: ExamObjectiveItem[]
  subjective: ExamSubjectiveItem[]
  frozen_at: string // 议事开始前冻结
}

export interface ExamResult {
  kind: 'ExamResult'
  red_line_gate: 'pass' | 'revise' | 'reject'
  red_line_notes: string[]
  objective_scores: { module: string; score: number; full_score: number; comment: string }[]
  subjective_scores: { module: string; score: number; full_score: number; comment: string }[]
  objective_total: number
  subjective_total: number
  total: number
  grade_comment: string
}

// ============ 通用博弈扩展工件 ============

/** 通用博弈发言事件。phase/action 均来自 GameSpec，不硬编码狼人杀语义。 */
export interface GameSpeechEvent {
  kind: 'GameSpeech'
  phase: string
  phase_label: string
  round: number
  agent_id: string
  audience: 'private' | 'public'
  content: string
}

export interface GameActionEvent {
  kind: 'GameAction'
  phase: string
  phase_label: string
  round: number
  actor: string
  action: string
  action_label: string
  target?: string
  result: string
  visible_to: string[]
}

export interface GameResult {
  game_type: string
  game_name: string
  winner_id: string
  winner_team: string
  winner_label: string
  description: string
  reason: 'condition' | 'tiebreak'
  round: number
  winning_players: string[]
  losing_players: string[]
}

export interface GameRosterEntry {
  id: string
  name: string
  role: string
  role_label: string
  team: string
}

// ============ Observer 指标 ============

export interface MetricsSnapshot {
  speaking_share: Record<string, number>
  fairness_gini: number
  grounding_rate: number
  response_rate: number
  minority_retention: number
  rotation_rate: number
  outer_absorption_rate: number
  consensus_trend: number[]
  consensus_collapse_warning: boolean
  anomalies: string[]
}

// ============ 引擎事件流（UI 的唯一数据源） ============

export type EngineEvent =
  | { t: 'complexity_start'; user_input: string }
  | { t: 'complexity_done'; result: ComplexityResult; tokens: number; source: 'api' }
  | { t: 'dispatch_start'; user_input: string }
  | { t: 'dispatch_done'; profile: TaskProfile; tokens: number }
  | { t: 'track_decided'; track: TaskType; reason: string }
  | { t: 'compile_step'; step: number; name: string; detail: string; tokens: number }
  | { t: 'compile_done'; config: ScenarioConfig }
  | { t: 'phase_start'; phase_id: string; name: string; purpose: string; strategy: StrategyCombo }
  | { t: 'agent_start'; agent_id: string; name: string; archetype: string; context_mode: string }
  | { t: 'artifact'; artifact: Artifact; agent_id?: string; tokens: number }
  | { t: 'speech'; agent_id: string; name: string; content: string; audience: string; tokens: number }
  | { t: 'fishbowl_plan'; round: number; inner: string[]; outer: string[]; reason: string }
  | { t: 'adaptation'; trigger: string; action: string; scope: string }
  | { t: 'retry'; reason: string; attempt: number }
  | { t: 'metrics'; snapshot: MetricsSnapshot }
  | { t: 'exam_frozen'; blueprint: ExamBlueprint }
  | { t: 'exam_result'; result: ExamResult }
  | { t: 'game_event'; event: GameActionEvent | GameSpeechEvent }
  | { t: 'game_state'; alive: string[]; dead: string[]; phase: string; roster?: GameRosterEntry[] }
  | { t: 'game_result'; result: GameResult }
  | { t: 'vote'; votes: { agent_id: string; vote: string; reason: string }[]; result: string }
  | { t: 'phase_done'; phase_id: string; name: string }
  | { t: 'final_proposal'; proposal: FinalProposal }
  | { t: 'report'; markdown: string }
  | { t: 'ledger'; total_tokens: number; calls: number; by_phase: Record<string, number> }
  | { t: 'audit_snapshot'; model_invocations: ModelInvocation[]; run_trace?: RunTraceEntry[]; checkpoints?: TaskCheckpoint[] }
  | { t: 'event_rule_fired'; evaluation: EventRuleEvaluation }
  | { t: 'impasse_report'; report: ImpasseReport }
  | { t: 'terminal_report'; report: TerminalReport }
  | { t: 'checkpoint_created'; checkpoint: TaskCheckpoint }
  | { t: 'run_done'; elapsed_ms: number; terminal_state?: TerminalState }
  | { t: 'error'; message: string }

export type Artifact =
  | InitialAssessmentCard
  | CandidateProposal
  | PlanScoreCard
  | ConflictMap
  | ObjectionCard
  | OuterObservationCard
  | FishbowlSummaryCard
  | FinalProposal
  | ExamBlueprint
  | ExamResult
  | PresentationBrief
  | PresentationResearchPlan
  | PresentationEvidenceCard
  | PresentationOutline
  | PresentationDeck
  | PresentationDeckReview

// ============ LLM 配置 ============

export type ForceTrack = 'auto' | 'single' | 'multi'
export type ForceDeliverable = 'text' | 'presentation'

export interface LLMConfig {
  base_url: string
  api_key: string
  model: string
  temperature?: number
}

/** 可持久化、可由 Agent 直接引用的一套完整基座模型配置。 */
export interface LLMProfile extends LLMConfig {
  id: string
  name: string
}

export interface LLMSettings {
  version: 2
  active_profile_id: string
  profiles: LLMProfile[]
}

export interface AgentLLMConfig {
  mode: 'shared' | 'per_agent'
  shared?: LLMConfig
  per_agent?: Record<string, LLMConfig>
}

export const LLM_PRESETS: { name: string; base_url: string; model: string }[] = [
  { name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Moonshot 国内站', base_url: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0905-preview' },
  { name: 'Moonshot 国际站', base_url: 'https://api.moonshot.ai/v1', model: 'kimi-k2-0905-preview' },
  { name: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '通义千问', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
]
