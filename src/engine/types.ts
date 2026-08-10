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
  game_type: 'werewolf' | 'poker' | null
  domain: string
  time_pressure: TimePressure
  information_asymmetry: InfoAsymmetry
  agent_relations: AgentRelations
  decision_pattern: DecisionPattern
  resource_scarcity: Scarcity
  verifiability: Verifiability
  reasoning: string // Dispatcher 的分类理由（展示用）
}

// ============ 原子策略 A/B/C/D/E ============

export interface StrategyCombo {
  A: string[] // 发言者选择：A1 配额 / A2 层级 / A3 全体 / A4 指定对抗 / A5 私下沟通
  B: string // 信息路由：B1 全量 / B2 摘要 / B3 角色约束 / B4 框架约束 / B5 角色权限
  C: string // 思维模式：C1 自由 / C2 立场制 / C3 帽制 / C4 对抗制 / C5 Delphi
  D: string // 输出格式：D1 自由文本 / D2 结构化工件 / D3 置信度工件
  E: string[] // 状态转换：E1 固定轮次 / E2 收敛检测 / E3 对抗循环 / E4 时序循环 / E7 投票决议
  notes: string[] // 自动推断与叠加说明（展示用）
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
  private_info?: string // B5 / 博弈扩展：仅自己可见的信息（狼人杀身份等）
  secret_role?: string // werewolf extension
  team?: string
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
  kind: 'speak' | 'aggregate' | 'score' | 'analyze' | 'fishbowl' | 'propose' | 'evaluate' | 'game_night' | 'game_day' | 'vote' | 'report'
  config: Record<string, unknown>
  transitions: PhaseTransition[]
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
  case_context: string
  hard_constraints: string[]
  exam_blueprint?: ExamBlueprint
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

// ============ 狼人杀扩展工件 ============

export interface WerewolfSpeech {
  kind: 'WerewolfSpeech'
  phase: 'night' | 'day'
  round: number
  agent_id: string
  audience: 'private' | 'public' // A5 私聊 / 公开
  content: string
}

export interface WerewolfAction {
  kind: 'WerewolfAction'
  round: number
  actor: string
  action: 'kill' | 'check' | 'save' | 'poison' | 'vote' | 'eliminate' | 'reveal'
  target?: string
  result: string
  visible_to: string[] // B5 权限：哪些角色可见此信息
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
  | { t: 'complexity_done'; result: ComplexityResult; tokens: number; source: 'distilbert' }
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
  | { t: 'game_event'; event: WerewolfAction | WerewolfSpeech }
  | { t: 'game_state'; alive: string[]; dead: string[]; phase: string }
  | { t: 'vote'; votes: { agent_id: string; vote: string; reason: string }[]; result: string }
  | { t: 'phase_done'; phase_id: string; name: string }
  | { t: 'final_proposal'; proposal: FinalProposal }
  | { t: 'report'; markdown: string }
  | { t: 'ledger'; total_tokens: number; calls: number; by_phase: Record<string, number> }
  | { t: 'run_done'; elapsed_ms: number }
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

// ============ LLM 配置 ============

export type ForceTrack = 'auto' | 'single' | 'multi'

export interface LLMConfig {
  base_url: string
  api_key: string
  model: string
  temperature?: number
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
