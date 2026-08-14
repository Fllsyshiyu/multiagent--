/**
 * GenericGameEngine · 通用博弈运行时
 * 引擎只认 GameSpec 中的原语、阶段和胜负条件，不认具体游戏。
 * 狼人杀、扑克等博弈都通过 GameSpec 描述，而不是各自硬编码。
 */
import type {
  GameActionOutput, GameActionSpec, GamePlayerState, GamePrimitive, GameSpec, GameState,
  GameTiebreakSpec, GameWinConditionSpec,
} from './game-types'
import type { Emit } from './engine'
import type { LLMCaller } from './llm'
import type { GameResult, GameRosterEntry } from './types'
import { callJSON } from './llm'
import { TokenLedger } from './ledger'
import { policyToLegacyCombo } from './framework/registry'
import { parsePlayerCount } from './game-request'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const VALID_PRIMITIVES: GamePrimitive[] = [
  'assign_roles', 'private_chat', 'select_target', 'inspect_role', 'mark_dead', 'revive',
  'poison', 'decide_life', 'public_speech', 'vote', 'resolve_night', 'resolve_vote', 'judge_winner',
  'propose_team', 'approve_team', 'resolve_team_vote', 'quest_vote', 'resolve_quest',
  'assassinate', 'resolve_assassination',
]

const VALID_PHASE_KINDS = ['setup', 'action', 'speak', 'vote', 'end'] as const

function asNonEmptyArray<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`GameSpec 缺少有效的 ${name} 数组`)
  }
  return value as T[]
}

/** 对 LLM 生成的 GameSpec 做运行时归一化与校验，缺字段补默认，结构性错误明确抛出。 */
export function normalizeGameSpec(raw: unknown): GameSpec {
  if (!raw || typeof raw !== 'object') throw new Error('LLM 未返回有效的 GameSpec 对象')
  const input = raw as Record<string, unknown>
  const roles = asNonEmptyArray(input.roles, 'roles').map((item) => {
    const role = item as Record<string, unknown>
    return {
      id: String(role.id ?? 'role'),
      name: String(role.name ?? role.id ?? '角色'),
      team: String(role.team ?? 'neutral'),
      description: String(role.description ?? ''),
      actions: Array.isArray(role.actions) ? role.actions.map(String) : [],
      knowledge: role.knowledge && typeof role.knowledge === 'object' ? {
        teams: Array.isArray((role.knowledge as Record<string, unknown>).teams) ? ((role.knowledge as Record<string, unknown>).teams as unknown[]).map(String) : undefined,
        roles: Array.isArray((role.knowledge as Record<string, unknown>).roles) ? ((role.knowledge as Record<string, unknown>).roles as unknown[]).map(String) : undefined,
        except_roles: Array.isArray((role.knowledge as Record<string, unknown>).except_roles) ? ((role.knowledge as Record<string, unknown>).except_roles as unknown[]).map(String) : undefined,
        label: (role.knowledge as Record<string, unknown>).label ? String((role.knowledge as Record<string, unknown>).label) : undefined,
      } : undefined,
    }
  })
  const roleNameToId = new Map(roles.map((role) => [role.name, role.id]))
  const actions = asNonEmptyArray(input.actions, 'actions').map((item) => {
    const action = item as Record<string, unknown>
    const primitive = action.primitive as GamePrimitive
    if (!VALID_PRIMITIVES.includes(primitive)) {
      throw new Error(`GameSpec 动作原语不合法：${String(action.primitive)}`)
    }
    const rawRole = String(action.role ?? 'all').trim()
    const specialRoles = ['all', '__system', '__leader', '__proposed_team']
    const role = specialRoles.includes(rawRole)
      ? rawRole
      : roles.find((candidate) => candidate.id === rawRole)?.id
        ?? roleNameToId.get(rawRole)
        ?? 'all'
    return {
      id: String(action.id ?? 'action'),
      name: String(action.name ?? action.id ?? '动作'),
      primitive,
      role,
      audience: String(action.audience ?? 'public') as GameActionSpec['audience'],
      prompt: String(action.prompt ?? '请执行你的游戏动作。'),
      output_schema: String(action.output_schema ?? '{}'),
      effect: (action.effect as Record<string, string>) ?? {},
    }
  })
  const compositionRaw = (input.composition ?? {}) as Record<string, unknown>
  const composition = {
    fixed: Array.isArray(compositionRaw.fixed) ? compositionRaw.fixed : [],
    ratio: Array.isArray(compositionRaw.ratio) ? compositionRaw.ratio : [],
    fill_role: String(compositionRaw.fill_role ?? roles[roles.length - 1]?.id ?? 'role'),
    by_player_count: compositionRaw.by_player_count && typeof compositionRaw.by_player_count === 'object'
      ? Object.fromEntries(Object.entries(compositionRaw.by_player_count as Record<string, unknown>).map(([count, list]) => [count, Array.isArray(list) ? list.map(String) : []]))
      : undefined,
  } as GameSpec['composition']
  const phases = asNonEmptyArray(input.phases, 'phases').map((item) => {
    const phase = item as Record<string, unknown>
    const kind = phase.kind as typeof VALID_PHASE_KINDS[number]
    if (!VALID_PHASE_KINDS.includes(kind)) throw new Error(`GameSpec 阶段类型不合法：${String(phase.kind)}`)
    const policyRaw = (phase.policy ?? {}) as Record<string, unknown>
    return {
      id: String(phase.id ?? 'phase'),
      name: String(phase.name ?? phase.id ?? '阶段'),
      purpose: String(phase.purpose ?? ''),
      kind,
      participants: (phase.participants ?? 'all') as 'all' | 'all_alive' | string[],
      actions: Array.isArray(phase.actions) ? phase.actions.map(String) : [],
      policy: {
        A: (policyRaw.A as 'A1') ?? 'A1',
        B: (policyRaw.B as 'B1') ?? 'B1',
        C: (policyRaw.C as 'C1') ?? 'C1',
        D: (policyRaw.D as 'D1') ?? 'D1',
        E: (policyRaw.E as 'E1') ?? 'E1',
      },
      order: (phase.order ?? 'sequential') as 'sequential' | 'simultaneous',
      round: typeof phase.round === 'number' ? phase.round : undefined,
    }
  })
  return {
    game_type: String(input.game_type ?? 'unknown'),
    name: String(input.name ?? input.game_type ?? '博弈游戏'),
    description: String(input.description ?? ''),
    min_players: Number(input.min_players ?? 2),
    max_players: Number(input.max_players ?? 20),
    teams: Array.isArray(input.teams)
      ? input.teams.map((item) => {
        const team = item as Record<string, unknown>
        return { id: String(team.id ?? 'team'), name: String(team.name ?? team.id ?? '阵营'), description: team.description ? String(team.description) : undefined }
      })
      : [...new Set(roles.map((role) => role.team))].map((team) => ({ id: team, name: team })),
    roles,
    actions,
    composition,
    phases,
    win_conditions: asNonEmptyArray(input.win_conditions, 'win_conditions').map((item) => {
      const condition = item as Record<string, unknown>
      return {
        id: String(condition.id ?? 'win'),
        description: String(condition.description ?? ''),
        type: (condition.type ?? 'llm') as GameWinConditionSpec['type'],
        winner_team: condition.winner_team ? String(condition.winner_team) : undefined,
        role: condition.role ? String(condition.role) : undefined,
        team: condition.team ? String(condition.team) : undefined,
        team_a: condition.team_a ? String(condition.team_a) : undefined,
        team_b: condition.team_b ? String(condition.team_b) : undefined,
      }
    }),
    fallback_rule: String(input.fallback_rule ?? ''),
    tiebreak: input.tiebreak && typeof input.tiebreak === 'object' ? {
      type: String((input.tiebreak as Record<string, unknown>).type ?? 'alive_count') as GameTiebreakSpec['type'],
      team_order: Array.isArray((input.tiebreak as Record<string, unknown>).team_order)
        ? ((input.tiebreak as Record<string, unknown>).team_order as unknown[]).map(String)
        : undefined,
      description: String((input.tiebreak as Record<string, unknown>).description ?? input.fallback_rule ?? '按存活人数判定胜负'),
    } : { type: 'alive_count', description: String(input.fallback_rule ?? '按存活人数判定胜负') },
    game_loop: input.game_loop && typeof input.game_loop === 'object' ? {
      cycle_phase_ids: Array.isArray((input.game_loop as Record<string, unknown>).cycle_phase_ids)
        ? ((input.game_loop as Record<string, unknown>).cycle_phase_ids as unknown[]).map(String)
        : phases.filter((phase) => phase.kind !== 'setup' && phase.kind !== 'end').map((phase) => phase.id),
      max_rounds: Math.max(1, Number((input.game_loop as Record<string, unknown>).max_rounds ?? 5)),
      break_on_winner: (input.game_loop as Record<string, unknown>).break_on_winner !== false,
    } : undefined,
    quest_rules: input.quest_rules && typeof input.quest_rules === 'object' ? {
      team_sizes_by_player_count: Object.fromEntries(Object.entries(((input.quest_rules as Record<string, unknown>).team_sizes_by_player_count ?? {}) as Record<string, unknown>).map(([count, sizes]) => [count, Array.isArray(sizes) ? sizes.map(Number) : []])),
      fail_threshold_by_round: (input.quest_rules as Record<string, unknown>).fail_threshold_by_round as Record<string, number> | undefined,
      fail_threshold_by_player_count: (input.quest_rules as Record<string, unknown>).fail_threshold_by_player_count as Record<string, Record<string, number>> | undefined,
      successes_to_win: Number((input.quest_rules as Record<string, unknown>).successes_to_win ?? 3),
      failures_to_win: Number((input.quest_rules as Record<string, unknown>).failures_to_win ?? 3),
      max_rejected_teams: Number((input.quest_rules as Record<string, unknown>).max_rejected_teams ?? 5),
      assassin_role: (input.quest_rules as Record<string, unknown>).assassin_role ? String((input.quest_rules as Record<string, unknown>).assassin_role) : undefined,
      protected_role: (input.quest_rules as Record<string, unknown>).protected_role ? String((input.quest_rules as Record<string, unknown>).protected_role) : undefined,
      good_team: String((input.quest_rules as Record<string, unknown>).good_team ?? 'good'),
      evil_team: String((input.quest_rules as Record<string, unknown>).evil_team ?? 'evil'),
      good_win_label: String((input.quest_rules as Record<string, unknown>).good_win_label ?? '好人阵营'),
      evil_win_label: String((input.quest_rules as Record<string, unknown>).evil_win_label ?? '邪恶阵营'),
    } : undefined,
  }
}

/** 按 GameSpec.composition 生成角色列表。 */
export function buildRoleList(spec: GameSpec, playerCount: number): string[] {
  const count = Math.max(spec.min_players, Math.min(spec.max_players, Math.floor(playerCount)))
  const exact = spec.composition.by_player_count?.[String(count)]
  if (exact?.length === count) return [...exact]
  const roles: string[] = []
  // 比例阵营优先，保证 p1... 可稳定映射到主要对抗方；固定特殊角色随后分配。
  // 这既兼容回放剧本，也让所有 GameSpec 的名单顺序可预测。
  for (const ratio of spec.composition.ratio) {
    let amount = Math.max(ratio.min ?? 1, Math.floor(count / ratio.denominator))
    amount = Math.min(amount, ratio.max ?? amount)
    for (let i = 0; i < amount; i++) roles.push(ratio.role)
  }
  for (const fixed of spec.composition.fixed) {
    for (let i = 0; i < fixed.count; i++) roles.push(fixed.role)
  }
  while (roles.length < count) roles.push(spec.composition.fill_role)
  return roles.slice(0, count)
}

/** 生成玩家名单。6 人局保持回放剧本完全兼容；其他人数动态命名。 */
function buildPlayers(spec: GameSpec, userInput: string, playerCount?: number): GamePlayerState[] {
  const requested = parsePlayerCount(userInput) ?? playerCount ?? spec.min_players
  const roleList = buildRoleList(spec, requested)
  const count = roleList.length
  const presetNames = ['沈默', '阿岚', '陆一', '苏叶', '老周', '小满']
  const players = roleList.map((role, index) => {
    const id = `p${index + 1}`
    const name = spec.game_type === 'werewolf' && count === 6 ? presetNames[index] : `玩家${index + 1}`
    const roleSpec = spec.roles.find((item) => item.id === role)
    return {
      id,
      name,
      role,
      role_label: roleSpec?.name ?? role,
      team: roleSpec?.team ?? role,
      alive: true,
      private_info: `${roleSpec?.name ?? role} · ${roleSpec?.description ?? ''}`,
      resources: roleSpec?.actions.some((actionId) => spec.actions.find((action) => action.id === actionId)?.primitive === 'decide_life')
        ? { antidote: 1, poison: 1 }
        : undefined,
    }
  })
  for (const player of players) {
    const knowledge = spec.roles.find((role) => role.id === player.role)?.knowledge
    if (!knowledge) continue
    const excluded = new Set(knowledge.except_roles ?? [])
    const visible = players.filter((candidate) => {
      if (candidate.id === player.id || excluded.has(candidate.role)) return false
      return Boolean(knowledge.teams?.includes(candidate.team) || knowledge.roles?.includes(candidate.role))
    })
    if (visible.length) player.private_info += `\n${knowledge.label ?? '你知道的玩家'}：${visible.map((candidate) => `${candidate.name}(${candidate.id})`).join('、')}`
  }
  return players
}

function toRoster(players: GamePlayerState[]): GameRosterEntry[] {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    role: player.role,
    role_label: player.role_label,
    team: player.team,
  }))
}

function replacePlaceholders(template: string, player: GamePlayerState, state: GameState): string {
  const teammates = state.players
    .filter((item) => item.team === player.team && item.id !== player.id)
    .map((item) => `${item.name}(${item.id})`)
    .join('、')
  return template
    .replaceAll('{name}', player.name)
    .replaceAll('{id}', player.id)
    .replaceAll('{teammates}', teammates || '无')
    .replaceAll('{victim}', state.players.find((item) => item.id === state.pending_kill)?.name ?? '未知')
}

function winCondition(state: GameState, condition: GameWinConditionSpec): boolean {
  const alive = state.players.filter((player) => player.alive)
  if (condition.type === 'role_eliminated' && condition.role) {
    return !alive.some((player) => player.role === condition.role)
  }
  if (condition.type === 'team_eliminated' && condition.team) {
    return !alive.some((player) => player.team === condition.team)
  }
  if (condition.type === 'team_ge' && condition.team_a && condition.team_b) {
    const a = alive.filter((player) => player.team === condition.team_a).length
    const b = alive.filter((player) => player.team === condition.team_b).length
    return a >= b
  }
  if (condition.type === 'last_team') {
    return new Set(alive.map((player) => player.team)).size === 1
  }
  return false
}

function inferWinnerTeam(state: GameState, condition: GameWinConditionSpec): string {
  if (condition.winner_team) return condition.winner_team
  if (condition.type === 'team_ge' && condition.team_a) return condition.team_a
  if (condition.type === 'role_eliminated' && condition.role) {
    const eliminatedTeam = state.players.find((player) => player.role === condition.role)?.team
    return state.players.find((player) => player.team !== eliminatedTeam)?.team ?? 'unknown'
  }
  if (condition.type === 'team_eliminated' && condition.team) {
    return state.players.find((player) => player.team !== condition.team)?.team ?? 'unknown'
  }
  const aliveTeams = [...new Set(state.players.filter((player) => player.alive).map((player) => player.team))]
  return aliveTeams.length === 1 ? aliveTeams[0] : 'unknown'
}

export class GenericGameEngine {
  private ledger = new TokenLedger()
  private caller: LLMCaller
  private emit: Emit
  private fast: boolean
  private currentSpec: GameSpec | null = null

  constructor(caller: LLMCaller, emit: Emit, opts?: { fast?: boolean }) {
    this.caller = caller
    this.emit = emit
    this.fast = opts?.fast ?? false
  }

  private async paced(ms = 260) {
    if (!this.fast) await sleep(ms)
  }

  async run(spec: GameSpec, userInput: string, opts?: { playerCount?: number }): Promise<void> {
    const start = Date.now()
    this.currentSpec = spec
    const players = buildPlayers(spec, userInput, opts?.playerCount)
    const state: GameState = {
      players,
      round: 1,
      phase_id: 'setup',
      phase_label: 'setup',
      public_log: [],
      private_logs: {},
      winner: null,
      winner_team: null,
      winner_description: null,
      winner_label: null,
      result_reason: null,
      leader_index: 0,
      proposed_team: [],
      team_votes: [],
      team_approved: false,
      quest_votes: [],
      quest_number: 1,
      quest_successes: 0,
      quest_failures: 0,
      rejected_teams: 0,
      awaiting_assassination: false,
    }

    const loop = spec.game_loop
    const cycleIds = new Set(loop?.cycle_phase_ids ?? [])
    const isCyclePhase = (phase: GameSpec['phases'][number]) => cycleIds.has(phase.id)
    const executeOne = async (phase: GameSpec['phases'][number]) => {
      await this.executePhase(spec, state, phase)
    }

    if (loop) {
      for (const phase of spec.phases.filter((phase) => phase.kind === 'setup')) await executeOne(phase)
      for (const phase of spec.phases.filter((phase) => phase.kind !== 'setup' && phase.kind !== 'end' && !isCyclePhase(phase))) {
        await executeOne(phase)
        if (state.winner && loop.break_on_winner) break
      }
      for (let round = 1; round <= loop.max_rounds && !(state.winner && loop.break_on_winner); round++) {
        state.round = round
        state.pending_kill = undefined
        state.pending_save = undefined
        state.pending_poison = undefined
        for (const phaseId of loop.cycle_phase_ids) {
          const phase = spec.phases.find((candidate) => candidate.id === phaseId)
          if (!phase) continue
          await executeOne(phase)
          if (state.winner && loop.break_on_winner) break
        }
      }
      for (const phase of spec.phases.filter((phase) => phase.kind === 'end')) await executeOne(phase)
    } else {
      for (const phase of spec.phases) {
        await executeOne(phase)
        if (state.winner) break
      }
    }

    if (!state.winner) this.applyTiebreak(spec, state)
    this.emitGameResult(spec, state)
    this.emitReport(spec, userInput, state)
    this.emit({ t: 'game_state', alive: state.players.filter((p) => p.alive).map((p) => p.id), dead: state.players.filter((p) => !p.alive).map((p) => p.id), phase: 'end', roster: toRoster(state.players) })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })
    this.emit({ t: 'run_done', elapsed_ms: Date.now() - start, terminal_state: 'DECIDED' })
  }

  private emitState(state: GameState, phase = state.phase_id) {
    this.emit({
      t: 'game_state',
      alive: state.players.filter((player) => player.alive).map((player) => player.id),
      dead: state.players.filter((player) => !player.alive).map((player) => player.id),
      phase,
      roster: toRoster(state.players),
    })
  }

  private async executePhase(spec: GameSpec, state: GameState, phase: GameSpec['phases'][number]) {
    this.ledger.setPhase(phase.id)
    state.phase_id = phase.id
    state.phase_label = phase.name
    this.emit({
      t: 'phase_start',
      phase_id: phase.id,
      name: phase.name,
      purpose: phase.purpose ?? '',
      strategy: policyToLegacyCombo(phase.policy),
    })
    await this.paced()

    this.emitState(state, phase.id)

    if (phase.kind === 'setup') {
      for (const player of state.players) {
        this.emit({
          t: 'game_event',
          event: {
            kind: 'GameAction',
            phase: state.phase_id,
            phase_label: state.phase_label,
            round: 0,
            actor: player.id,
            action: 'setup',
            action_label: '初始信息',
            result: `${player.name} 获得初始信息（仅本人可见）`, visible_to: [player.id],
          },
        })
        await this.paced(180)
      }
    } else if (phase.kind === 'end') {
      this.runJudge(spec, state)
    } else {
      await this.runPhaseActions(spec, state, phase)
    }

    this.emit({ t: 'phase_done', phase_id: phase.id, name: phase.name })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })
  }

  private async runPhaseActions(spec: GameSpec, state: GameState, phase: GameSpec['phases'][number]) {
    for (const actionId of phase.actions) {
      const action = spec.actions.find((item) => item.id === actionId)
      if (!action) continue
      if (action.role === '__system') {
        if (action.primitive === 'resolve_night') this.resolveNight(state)
        if (action.primitive === 'resolve_vote') this.resolveVote(state)
        if (action.primitive === 'judge_winner') this.runJudgeForState(state, spec)
        if (action.primitive === 'resolve_team_vote') this.resolveTeamVote(state, spec)
        if (action.primitive === 'resolve_quest') this.resolveQuest(state, spec)
        if (action.primitive === 'resolve_assassination') this.resolveAssassination(state, spec)
        continue
      }
      if (action.primitive === 'assassinate' && !state.awaiting_assassination) continue
      const participants = this.participantsFor(action.role, state, phase.participants)
      if (phase.order === 'simultaneous') await Promise.all(participants.map((player) => this.executeAction(spec, state, action, player)))
      else for (const player of participants) await this.executeAction(spec, state, action, player)
    }
  }

  private participantsFor(role: string, state: GameState, phaseParticipants: GameSpec['phases'][number]['participants']): GamePlayerState[] {
    const alive = state.players.filter((player) => player.alive)
    const phaseEligible = phaseParticipants === 'all'
      ? new Set(state.players.map((player) => player.id))
      : phaseParticipants === 'all_alive'
        ? new Set(alive.map((player) => player.id))
        : new Set(alive.filter((player) => phaseParticipants.includes(player.role)).map((player) => player.id))
    let candidates: GamePlayerState[]
    if (role === 'all') candidates = alive
    else if (role === '__leader') candidates = alive.length ? [alive[(state.leader_index ?? 0) % alive.length]] : []
    else if (role === '__proposed_team') candidates = state.team_approved ? alive.filter((player) => state.proposed_team?.includes(player.id)) : []
    else candidates = alive.filter((player) => player.role === role)
    return candidates.filter((player) => phaseEligible.has(player.id))
  }

  private normalizeActionOutput(data: GameActionOutput): GameActionOutput {
    if (data.content && data.content.trim()) return data
    const firstString = Object.values(data).find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    return firstString ? { ...data, content: firstString } : { ...data, content: '' }
  }

  private actionContext(spec: GameSpec, state: GameState, action: GameActionSpec, player: GamePlayerState) {
    const alive = state.players.filter((candidate) => candidate.alive)
    const questNumber = state.quest_number ?? 1
    const teamSizes = spec.quest_rules?.team_sizes_by_player_count[String(state.players.length)] ?? []
    const opponents = alive.filter((candidate) => candidate.id !== player.id && candidate.team !== player.team)
    const nonSelf = alive.filter((candidate) => candidate.id !== player.id)
    const validTargets = action.primitive === 'select_target' || action.primitive === 'assassinate'
      ? (opponents.length ? opponents : nonSelf)
      : nonSelf
    return {
      game_type: spec.game_type,
      action_id: action.id,
      primitive: action.primitive,
      phase: state.phase_label,
      round: state.round,
      player: { id: player.id, name: player.name, role: player.role, role_label: player.role_label, team: player.team, private_info: player.private_info },
      alive_players: alive.map((candidate) => ({ id: candidate.id, name: candidate.name })),
      valid_targets: validTargets.map((candidate) => ({ id: candidate.id, name: candidate.name })),
      proposed_team: state.proposed_team ?? [],
      required_team_size: teamSizes[questNumber - 1] ?? null,
      quest_number: questNumber,
      quest_score: { success: state.quest_successes ?? 0, failure: state.quest_failures ?? 0 },
      public_log: state.public_log.slice(-20),
    }
  }

  private async executeAction(spec: GameSpec, state: GameState, action: GameActionSpec, player: GamePlayerState) {
    try {
      const context = this.actionContext(spec, state, action, player)
      const system = `${replacePlaceholders(action.prompt, player, state)}\n\n你的秘密信息：${player.private_info}\n\n[GAME_CONTEXT]\n${JSON.stringify(context)}`
      const { data, tokens } = await callJSON<GameActionOutput>(
        this.caller,
        system,
        `输出 JSON：${action.output_schema}`,
        (attempt) => this.emit({ t: 'retry', reason: `${action.name} JSON 解析失败`, attempt }),
      )
      this.ledger.record(tokens)
      const normalized = this.normalizeActionOutput(data)
      this.applyPrimitive(spec, action.primitive, state, player, normalized)
      this.emitAction(action, state, player, normalized)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emit({ t: 'retry', reason: `${player.name} 的「${action.name}」执行失败：${message}`, attempt: 1 })
      this.emit({
        t: 'game_event',
        event: {
          kind: 'GameAction',
          phase: state.phase_id,
          phase_label: state.phase_label,
          round: state.round,
          actor: player.id,
          action: action.id,
          action_label: action.name,
          result: `${player.name} 执行「${action.name}」失败：${message}`,
          visible_to: ['all'],
        },
      })
    }
    await this.paced(220)
  }

  private applyPrimitive(spec: GameSpec, primitive: GamePrimitive, state: GameState, player: GamePlayerState, data: GameActionOutput) {
    switch (primitive) {
      case 'select_target': {
        const opponents = state.players.filter((candidate) => candidate.alive && candidate.id !== player.id && candidate.team !== player.team)
        const candidates = opponents.length ? opponents : state.players.filter((candidate) => candidate.alive && candidate.id !== player.id)
        state.pending_kill = candidates.find((candidate) => candidate.id === data.target)?.id ?? candidates[0]?.id
        break
      }
      case 'inspect_role': {
        const candidates = state.players.filter((candidate) => candidate.alive && candidate.id !== player.id)
        const target = candidates.find((candidate) => candidate.id === data.target) ?? candidates[0]
        if (target) player.private_info += `\n查验结果：${target.name} 是「${target.role_label}」。`
        break
      }
      case 'decide_life': {
        const resources = player.resources ?? { antidote: 1, poison: 1 }
        const canSave = Boolean(data.use_antidote) && (resources.antidote ?? 0) > 0 && Boolean(state.pending_kill)
        state.pending_save = canSave
        if (canSave) resources.antidote = Math.max(0, (resources.antidote ?? 0) - 1)
        const poisonTarget = state.players.find((candidate) => candidate.alive && candidate.id !== player.id && candidate.id === data.poison_target)
        const canPoison = Boolean(poisonTarget) && (resources.poison ?? 0) > 0
        state.pending_poison = canPoison ? poisonTarget?.id : undefined
        if (canPoison) resources.poison = Math.max(0, (resources.poison ?? 0) - 1)
        player.resources = resources
        break
      }
      case 'mark_dead':
        if (data.target) {
          const target = state.players.find((item) => item.alive && item.id === data.target)
          if (target) {
            target.alive = false
            this.emitState(state)
          }
        }
        break
      case 'revive':
        if (data.target) {
          const target = state.players.find((item) => !item.alive && item.id === data.target)
          if (target) {
            target.alive = true
            this.emitState(state)
          }
        }
        break
      case 'poison':
        if (state.pending_poison) {
          const target = state.players.find((item) => item.id === state.pending_poison)
          if (target) {
            target.alive = false
            this.emitState(state)
          }
        }
        break
      case 'public_speech':
        state.public_log.push(`${player.name}：${data.content ?? ''}`)
        break
      case 'vote': {
        const candidates = state.players.filter((candidate) => candidate.alive && candidate.id !== player.id)
        const target = candidates.find((candidate) => candidate.id === data.target) ?? candidates[0]
        state.votes = [...(state.votes ?? []), { agent_id: player.id, vote: target?.id ?? '', reason: data.reason ?? '' }]
        state.public_log.push(`${player.name} 投票给 ${target?.name ?? '弃权'}（${data.reason ?? ''}）`)
        break
      }
      case 'resolve_night':
        this.resolveNight(state)
        break
      case 'resolve_vote':
        this.resolveVote(state)
        break
      case 'judge_winner':
        this.runJudgeForState(state, this.currentSpec)
        break
      case 'propose_team': {
        const sizes = spec.quest_rules?.team_sizes_by_player_count[String(state.players.length)] ?? []
        const required = sizes[(state.quest_number ?? 1) - 1] ?? Math.min(2, state.players.length)
        const requested = Array.isArray(data.team) ? data.team.map(String) : []
        const valid = [...new Set(requested)].filter((id) => state.players.some((candidate) => candidate.alive && candidate.id === id))
        for (const candidate of state.players.filter((item) => item.alive)) {
          if (valid.length >= required) break
          if (!valid.includes(candidate.id)) valid.push(candidate.id)
        }
        state.proposed_team = valid.slice(0, required)
        state.team_votes = []
        state.team_approved = false
        state.quest_votes = []
        state.public_log.push(`${player.name} 提名任务队伍：${state.proposed_team.map((id) => state.players.find((item) => item.id === id)?.name ?? id).join('、')}`)
        break
      }
      case 'approve_team':
        state.team_votes = [...(state.team_votes ?? []), { agent_id: player.id, approve: Boolean(data.approve), reason: data.reason ?? '' }]
        break
      case 'quest_vote': {
        const success = player.team === spec.quest_rules?.good_team ? true : data.quest_success !== false
        state.quest_votes = [...(state.quest_votes ?? []), { agent_id: player.id, success }]
        break
      }
      case 'assassinate': {
        const candidates = state.players.filter((candidate) => candidate.alive && candidate.id !== player.id && candidate.team !== player.team)
        state.pending_kill = candidates.find((candidate) => candidate.id === data.target)?.id ?? candidates[0]?.id
        break
      }
      case 'private_chat': {
        const visibleIds = state.players.filter((candidate) => candidate.team === player.team).map((candidate) => candidate.id)
        for (const id of visibleIds) state.private_logs[id] = [...(state.private_logs[id] ?? []), `${player.name}：${data.content ?? ''}`]
        break
      }
      case 'resolve_team_vote':
      case 'resolve_quest':
      case 'resolve_assassination':
      case 'assign_roles':
        break
    }
  }

  private resolveNight(state: GameState) {
    const killTarget = state.players.find((player) => player.id === state.pending_kill)
    if (killTarget && !state.pending_save) killTarget.alive = false
    if (state.pending_poison) {
      const poisonTarget = state.players.find((player) => player.id === state.pending_poison)
      if (poisonTarget) poisonTarget.alive = false
    }
    this.runJudgeForState(state, this.currentSpec)
    this.emitState(state)
  }

  private resolveVote(state: GameState) {
    const votes = state.votes ?? []
    const tally: Record<string, number> = {}
    for (const vote of votes) {
      if (!vote.vote) continue
      tally[vote.vote] = (tally[vote.vote] ?? 0) + 1
    }
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1])
    if (ranked.length === 0) {
      state.votes = []
      this.emitState(state)
      return
    }
    if (ranked[1]?.[1] === ranked[0][1]) {
      const tied = ranked.filter(([, count]) => count === ranked[0][1]).map(([id]) => state.players.find((player) => player.id === id)?.name ?? id)
      this.emit({ t: 'vote', votes, result: `最高票平票（${tied.join('、')}），本轮无人出局。` })
      state.public_log.push(`最高票平票（${tied.join('、')}），本轮无人出局。`)
      state.votes = []
      this.emitState(state)
      return
    }
    const eliminatedId = ranked[0][0]
    const eliminated = state.players.find((player) => player.id === eliminatedId)
    if (eliminated) {
      eliminated.alive = false
      const roleLabel = eliminated.role_label
      state.public_log.push(`${eliminated.name} 以 ${ranked[0][1]} 票出局，身份是「${roleLabel}」。`)
      this.emit({
        t: 'vote',
        votes,
        result: `${eliminated.name} 以 ${ranked[0][1]} 票出局，其身份是「${roleLabel}」。`,
      })
    }
    state.votes = []
    this.runJudgeForState(state, this.currentSpec)
    this.emitState(state)
  }

  private emitSystemResult(state: GameState, action: string, actionLabel: string, result: string) {
    this.emit({
      t: 'game_event',
      event: {
        kind: 'GameAction', phase: state.phase_id, phase_label: state.phase_label, round: state.round,
        actor: '__system', action, action_label: actionLabel, result, visible_to: ['all'],
      },
    })
  }

  private setWinner(spec: GameSpec, state: GameState, winnerId: string, team: string, label: string, description: string) {
    state.winner = winnerId
    state.winner_team = team
    state.winner_label = label || spec.teams?.find((item) => item.id === team)?.name || team
    state.winner_description = description
    state.result_reason = 'condition'
  }

  private resolveTeamVote(state: GameState, spec: GameSpec) {
    const rules = spec.quest_rules
    if (!rules || !state.proposed_team?.length) return
    const approvals = (state.team_votes ?? []).filter((vote) => vote.approve).length
    const rejections = (state.team_votes ?? []).length - approvals
    state.team_approved = approvals > rejections
    if (state.team_approved) {
      state.rejected_teams = 0
      this.emitSystemResult(state, 'resolve_team_vote', '组队表决', `组队通过：${approvals} 票赞成，${rejections} 票反对。`)
      return
    }
    state.rejected_teams = (state.rejected_teams ?? 0) + 1
    state.leader_index = (state.leader_index ?? 0) + 1
    this.emitSystemResult(state, 'resolve_team_vote', '组队表决', `组队未通过：${approvals} 票赞成，${rejections} 票反对；连续否决 ${state.rejected_teams} 次。`)
    if ((state.rejected_teams ?? 0) >= rules.max_rejected_teams) {
      this.setWinner(spec, state, 'avalon_rejections_evil', rules.evil_team, rules.evil_win_label, `连续 ${rules.max_rejected_teams} 次组队被否决，邪恶阵营获胜。`)
    }
  }

  private resolveQuest(state: GameState, spec: GameSpec) {
    const rules = spec.quest_rules
    if (!rules || !state.team_approved) return
    const questNumber = state.quest_number ?? 1
    const failures = (state.quest_votes ?? []).filter((vote) => !vote.success).length
    const threshold = rules.fail_threshold_by_player_count?.[String(state.players.length)]?.[String(questNumber)]
      ?? rules.fail_threshold_by_round?.[String(questNumber)]
      ?? 1
    const succeeded = failures < threshold
    if (succeeded) state.quest_successes = (state.quest_successes ?? 0) + 1
    else state.quest_failures = (state.quest_failures ?? 0) + 1
    const summary = `第 ${questNumber} 次任务${succeeded ? '成功' : '失败'}：${failures} 张失败票，失败阈值为 ${threshold}。`
    state.public_log.push(summary)
    this.emitSystemResult(state, 'resolve_quest', '任务结算', summary)
    state.quest_number = questNumber + 1
    state.leader_index = (state.leader_index ?? 0) + 1
    state.team_approved = false
    state.proposed_team = []
    state.team_votes = []
    state.quest_votes = []

    if ((state.quest_failures ?? 0) >= rules.failures_to_win) {
      this.setWinner(spec, state, 'avalon_quests_evil', rules.evil_team, rules.evil_win_label, `邪恶阵营已破坏 ${state.quest_failures} 次任务。`)
    } else if ((state.quest_successes ?? 0) >= rules.successes_to_win) {
      if (rules.assassin_role && rules.protected_role && state.players.some((player) => player.alive && player.role === rules.assassin_role)) {
        state.awaiting_assassination = true
      } else {
        this.setWinner(spec, state, 'avalon_quests_good', rules.good_team, rules.good_win_label, `好人阵营已完成 ${state.quest_successes} 次任务。`)
      }
    }
  }

  private resolveAssassination(state: GameState, spec: GameSpec) {
    const rules = spec.quest_rules
    if (!rules || !state.awaiting_assassination || !rules.protected_role) return
    const target = state.players.find((player) => player.id === state.pending_kill)
    const hit = target?.role === rules.protected_role
    if (hit) {
      this.setWinner(spec, state, 'avalon_assassination_evil', rules.evil_team, rules.evil_win_label, `刺客成功识别并刺杀了${target?.name ?? '梅林'}，邪恶阵营翻盘。`)
    } else {
      this.setWinner(spec, state, 'avalon_assassination_good', rules.good_team, rules.good_win_label, `刺客选择了${target?.name ?? '错误目标'}，未能命中梅林；好人阵营获胜。`)
    }
    state.awaiting_assassination = false
    this.emitSystemResult(state, 'resolve_assassination', '刺杀结算', state.winner_description ?? '')
  }

  private runJudge(spec: GameSpec, state: GameState) {
    this.runJudgeForState(state, spec)
  }

  private runJudgeForState(state: GameState, spec: GameSpec | null) {
    if (!spec) return
    for (const condition of spec.win_conditions) {
      if (winCondition(state, condition)) {
        state.winner = condition.id
        state.winner_team = inferWinnerTeam(state, condition)
        state.winner_description = condition.description
        state.winner_label = spec.teams?.find((team) => team.id === state.winner_team)?.name ?? state.winner_team
        state.result_reason = 'condition'
        return
      }
    }
  }


  private applyTiebreak(spec: GameSpec, state: GameState) {
    const rule = spec.tiebreak ?? { type: 'alive_count' as const, description: spec.fallback_rule || '按存活人数判定胜负' }
    const counts = new Map<string, number>()
    for (const player of state.players.filter((item) => item.alive)) {
      counts.set(player.team, (counts.get(player.team) ?? 0) + 1)
    }
    const teams = [...new Set(spec.roles.map((role) => role.team))]
    let winnerTeam = 'draw'
    if (rule.type === 'team_priority') {
      winnerTeam = rule.team_order?.find((team) => (counts.get(team) ?? 0) > 0) ?? teams[0] ?? 'draw'
    } else if (rule.type === 'alive_count') {
      const order = rule.team_order ?? teams
      winnerTeam = [...order].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0] ?? 'draw'
    }
    state.winner = `tiebreak_${winnerTeam}`
    state.winner_team = winnerTeam
    state.winner_description = rule.description
    state.winner_label = winnerTeam === 'draw' ? '平局' : (spec.teams?.find((team) => team.id === winnerTeam)?.name ?? winnerTeam)
    state.result_reason = 'tiebreak'
  }

  private emitGameResult(spec: GameSpec, state: GameState) {
    const team = state.winner_team ?? 'unknown'
    const winningPlayers = state.players.filter((player) => player.team === team).map((player) => player.id)
    const result: GameResult = {
      game_type: spec.game_type,
      game_name: spec.name,
      winner_id: state.winner ?? 'unknown',
      winner_team: team,
      winner_label: state.winner_label ?? (team === 'draw' ? '平局' : team),
      description: state.winner_description ?? spec.fallback_rule,
      reason: state.result_reason ?? 'tiebreak',
      round: state.round,
      winning_players: winningPlayers,
      losing_players: state.players.filter((player) => !winningPlayers.includes(player.id)).map((player) => player.id),
    }
    this.emit({ t: 'game_result', result })
  }

  private emitAction(action: GameActionSpec, state: GameState, player: GamePlayerState, data: GameActionOutput) {
    if (action.primitive === 'private_chat') {
      this.emit({
        t: 'game_event',
        event: {
          kind: 'GameSpeech', phase: state.phase_id, phase_label: state.phase_label, round: state.round, agent_id: player.id,
          audience: 'private', content: data.content ?? '',
        },
      })
    } else if (action.primitive === 'public_speech') {
      this.emit({
        t: 'game_event',
        event: {
          kind: 'GameSpeech', phase: state.phase_id, phase_label: state.phase_label, round: state.round, agent_id: player.id,
          audience: 'public', content: data.content ?? '',
        },
      })
    } else if (action.primitive === 'vote') {
      // 投票事件单独用 vote 事件聚合，这里先记录
    } else {
      const result = action.primitive === 'propose_team'
        ? `${player.name} 提名：${(state.proposed_team ?? []).map((id) => state.players.find((candidate) => candidate.id === id)?.name ?? id).join('、')}`
        : action.primitive === 'approve_team'
          ? `${player.name} 对组队投下${data.approve ? '赞成' : '反对'}票${data.reason ? `（${data.reason}）` : ''}`
          : action.primitive === 'quest_vote'
            ? `${player.name} 已秘密提交任务票`
            : action.primitive === 'assassinate'
              ? `${player.name} 选择刺杀 ${state.players.find((candidate) => candidate.id === state.pending_kill)?.name ?? '未知目标'}`
              : `${player.name} 执行「${action.name}」${data.target ? ` → ${state.players.find((candidate) => candidate.id === data.target)?.name ?? data.target}` : ''}`
      this.emit({
        t: 'game_event',
        event: {
          kind: 'GameAction',
          phase: state.phase_id,
          phase_label: state.phase_label,
          round: state.round,
          actor: player.id,
          action: action.id,
          action_label: action.name,
          target: data.target ?? data.poison_target ?? undefined,
          result,
          visible_to: action.audience === 'public' ? ['all'] : [player.id, 'god'],
        },
      })
    }
  }

  private emitReport(spec: GameSpec, userInput: string, state: GameState) {
    const markdown = [
      `## ${spec.name} 对局复盘`,
      '',
      `**用户输入**：${userInput}`,
      '',
      `### 对局结果`,
      `- 存活：${state.players.filter((p) => p.alive).map((p) => `${p.name}（${p.role_label}）`).join('、') || '无'}`,
      `- 出局：${state.players.filter((p) => !p.alive).map((p) => `${p.name}（${p.role_label}）`).join('、') || '无'}`,
      `- 胜者：${state.winner_team === 'draw' ? '平局' : `${state.winner_label ?? state.winner_team}`}`,
      `- 判定：${state.winner_description ?? spec.fallback_rule}`,
      `- 判定方式：${state.result_reason === 'condition' ? '常规胜负条件' : '最大回合终局规则'}`,
      '',
      `### 通用框架复用`,
      `- 本局由 ${spec.name} GameSpec 声明式驱动`,
      `- 规则来源：${spec.description}`,
      '',
    ].join('\n')
    this.emit({ t: 'report', markdown })
  }
}

/** 对未知博弈，用 LLM 把用户输入动态编译成 GameSpec。 */
export async function generateGameSpec(caller: LLMCaller, userInput: string, ruleContext = ''): Promise<GameSpec> {
  const schema = JSON.stringify({
    game_type: '<英文snake_case>',
    name: '<中文名称>',
    description: '<规则概述>',
    min_players: 2,
    max_players: 20,
    teams: [{ id: '<team_id>', name: '<阵营显示名>' }],
    roles: [{ id: '<role_id>', name: '<角色名>', team: '<阵营>', description: '<能力说明>', actions: ['<action_id>'] }],
    actions: [{ id: '<action_id>', name: '<动作名>', primitive: '<见下方原语>', role: '<角色或all>', audience: 'self|team|public|god', prompt: '<给Agent的指令>', output_schema: '<JSON schema>' }],
    composition: { fixed: [], ratio: [], fill_role: '<角色id>', by_player_count: {} },
    phases: [{ id: '<phase_id>', name: '<阶段名>', purpose: '<阶段目的>', kind: 'setup|action|speak|vote|end', participants: 'all|all_alive|["role"]', actions: ['<action_id>'], policy: { A: 'A1', B: 'B1', C: 'C1', D: 'D1', E: 'E1' }, order: 'sequential' }],
    win_conditions: [{ id: '<win_id>', description: '<胜负条件>', type: 'role_eliminated|team_eliminated|team_ge|last_team', winner_team: '<获胜阵营>' }],
    fallback_rule: '<无法判定时的兜底规则>',
    tiebreak: { type: 'alive_count|team_priority|draw', team_order: ['<优先阵营>'], description: '<最大回合后的明确胜负规则>' },
    game_loop: { cycle_phase_ids: ['<循环阶段id>'], max_rounds: 5, break_on_winner: true },
    quest_rules: { team_sizes_by_player_count: {}, successes_to_win: 3, failures_to_win: 3, max_rejected_teams: 5, good_team: '<阵营>', evil_team: '<阵营>', good_win_label: '<显示名>', evil_win_label: '<显示名>' },
  })
  const { data } = await callJSON<GameSpec>(
    caller,
    `你是通用博弈规则编译器。你的任务是把用户指定的游戏转换成可执行的 GameSpec，而不是复制任何已有模板。
禁止默认输出狼人杀规则。必须依据用户描述或下方检索到的规则，真实描述该游戏的阵营、角色能力、回合流程和胜负条件。
可用原语：assign_roles, private_chat, select_target, inspect_role, mark_dead, revive, poison, decide_life, public_speech, vote, resolve_night, resolve_vote, judge_winner, propose_team, approve_team, resolve_team_vote, quest_vote, resolve_quest, assassinate, resolve_assassination。
必须提供至少两个可区分阵营、可执行的 win_conditions、game_loop 和 tiebreak，保证每局最终明确胜者或明确平局。
phases 必须包含至少一个非 setup/end 的阶段；每个非系统动作都必须指定执行它的角色。只输出 JSON。`,
    `用户输入：${userInput}
${ruleContext ? `检索到的游戏规则：\n${ruleContext}\n` : ''}
输出 GameSpec JSON，格式：\n${schema}`,
    (attempt) => { void attempt },
  )
  return normalizeGameSpec(data)
}

/** 从 Wikipedia 检索游戏规则摘要；网络不可用时返回空字符串，由 LLM 知识兜底。 */
export async function searchGameRules(gameType: string, userInput: string): Promise<string> {
  const query = gameType && gameType !== 'unknown' ? gameType : userInput
  try {
    const searchUrl = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`
    const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) })
    if (!searchResponse.ok) return ''
    const searchData = await searchResponse.json() as { query?: { search?: { title?: string }[] } }
    const titles = (searchData.query?.search ?? []).map((item) => item.title).filter(Boolean)
    if (titles.length === 0) return ''
    const extractUrl = `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&origin=*&titles=${encodeURIComponent(titles.join('|'))}`
    const extractResponse = await fetch(extractUrl, { signal: AbortSignal.timeout(6000) })
    if (!extractResponse.ok) return ''
    const extractData = await extractResponse.json() as { query?: { pages?: Record<string, { extract?: string }> } }
    return Object.values(extractData.query?.pages ?? {})
      .map((page) => page.extract ?? '')
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 4000)
  } catch {
    return ''
  }
}
