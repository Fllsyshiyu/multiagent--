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
  [key: string]: unknown
}

export interface GamePlayerState {
  id: string
  name: string
  role: string
  team: string
  alive: boolean
  private_info: string
}

export interface GameState {
  players: GamePlayerState[]
  round: number
  phase_id: string
  public_log: string[]
  private_logs: Record<string, string[]>
  pending_kill?: string
  pending_save?: boolean
  pending_poison?: string
  winner?: string | null
  votes?: { agent_id: string; vote: string; reason: string }[]
}

export interface GameRoleSpec {
  id: string
  name: string
  team: string
  description: string
  actions: string[]
}

export interface GameCompositionSpec {
  fixed: { role: string; count: number }[]
  ratio: { role: string; denominator: number; min?: number; max?: number }[]
  fill_role: string
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

export interface GameWinConditionSpec {
  id: string
  description: string
  type: 'role_eliminated' | 'team_ge' | 'llm'
  role?: string
  team_a?: string
  team_b?: string
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
}
