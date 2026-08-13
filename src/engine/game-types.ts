/**
 * 通用博弈规格（GameSpec）· 声明式游戏规则
 * 目标：任何回合制、信息不对称、带角色与胜负判定的博弈，都用数据描述，
 * 而不是为每个游戏写一个硬编码的 Game 类。
 *
 * 规则可 JSON 序列化，因此既可来自内置注册表，也可由 LLM 对未知游戏动态生成。
 */
import type { PhasePolicy } from './types'

export type GamePrimitive =
  | 'assign_roles'
  | 'private_chat'
  | 'select_target'
  | 'inspect_role'
  | 'mark_dead'
  | 'revive'
  | 'poison'
  | 'decide_life'
  | 'public_speech'
  | 'vote'
  | 'resolve_night'
  | 'resolve_vote'
  | 'judge_winner'
  | 'propose_team'
  | 'approve_team'
  | 'resolve_team_vote'
  | 'quest_vote'
  | 'resolve_quest'
  | 'assassinate'
  | 'resolve_assassination'

export type GameActionAudience = 'self' | 'team' | 'public' | 'god'

export interface GameActionSpec {
  id: string
  name: string
  primitive: GamePrimitive
  role: string
  audience: GameActionAudience
  prompt: string
  output_schema: string
  effect?: Record<string, string>
}

export interface GameActionOutput {
  content?: string
  target?: string
  use_antidote?: boolean
  poison_target?: string | null
  suspect?: string | null
  reason?: string
  team?: string[]
  approve?: boolean
  quest_success?: boolean
  [key: string]: unknown
}

export interface GamePlayerState {
  id: string
  name: string
  role: string
  role_label: string
  team: string
  alive: boolean
  private_info: string
}

export interface GameState {
  players: GamePlayerState[]
  round: number
  phase_id: string
  phase_label: string
  public_log: string[]
  private_logs: Record<string, string[]>
  pending_kill?: string
  pending_save?: boolean
  pending_poison?: string
  winner?: string | null
  winner_label?: string | null
  votes?: { agent_id: string; vote: string; reason: string }[]
  leader_index?: number
  proposed_team?: string[]
  team_votes?: { agent_id: string; approve: boolean; reason: string }[]
  team_approved?: boolean
  quest_votes?: { agent_id: string; success: boolean }[]
  quest_number?: number
  quest_successes?: number
  quest_failures?: number
  rejected_teams?: number
  awaiting_assassination?: boolean
}

export interface GameRoleSpec {
  id: string
  name: string
  team: string
  description: string
  actions: string[]
  knowledge?: {
    teams?: string[]
    roles?: string[]
    except_roles?: string[]
    label?: string
  }
}

export interface GameCompositionSpec {
  fixed: { role: string; count: number }[]
  ratio: { role: string; denominator: number; min?: number; max?: number }[]
  fill_role: string
  /** 对角色配置严格依赖人数的游戏（如阿瓦隆）使用精确表。 */
  by_player_count?: Record<string, string[]>
}

export interface QuestRulesSpec {
  team_sizes_by_player_count: Record<string, number[]>
  fail_threshold_by_round?: Record<string, number>
  fail_threshold_by_player_count?: Record<string, Record<string, number>>
  successes_to_win: number
  failures_to_win: number
  max_rejected_teams: number
  assassin_role?: string
  protected_role?: string
  good_team: string
  evil_team: string
  good_win_label: string
  evil_win_label: string
}

export interface GamePhaseSpec {
  id: string
  name: string
  purpose: string
  kind: 'setup' | 'action' | 'speak' | 'vote' | 'end'
  participants: 'all' | 'all_alive' | string[]
  actions: string[]
  policy: PhasePolicy
  order: 'sequential' | 'simultaneous'
  round?: number
}

export interface GameLoopSpec {
  /** 循环执行的阶段 id 列表，例如狼人杀的 night/day/vote。 */
  cycle_phase_ids: string[]
  max_rounds: number
  break_on_winner: boolean
}

export interface GameWinConditionSpec {
  id: string
  description: string
  type: 'role_eliminated' | 'team_ge' | 'llm'
  role?: string
  team_a?: string
  team_b?: string
  winner?: string
  winner_label?: string
}

export interface GameSpec {
  game_type: string
  name: string
  description: string
  min_players: number
  max_players: number
  roles: GameRoleSpec[]
  actions: GameActionSpec[]
  composition: GameCompositionSpec
  phases: GamePhaseSpec[]
  win_conditions: GameWinConditionSpec[]
  fallback_rule: string
  game_loop?: GameLoopSpec
  quest_rules?: QuestRulesSpec
}
