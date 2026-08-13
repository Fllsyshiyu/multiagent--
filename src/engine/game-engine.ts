/**
 * GenericGameEngine · 通用博弈运行时
 * 引擎只认 GameSpec 中的原语、阶段和胜负条件，不认具体游戏。
 * 狼人杀、扑克等博弈都通过 GameSpec 描述，而不是各自硬编码。
 */
import type {
  GameActionOutput, GameActionSpec, GamePlayerState, GamePrimitive, GameSpec, GameState,
  GameWinConditionSpec,
} from './game-types'
import type { Emit } from './engine'
import type { LLMCaller } from './llm'
import type { WerewolfRosterEntry } from './types'
import { callJSON } from './llm'
import { TokenLedger } from './ledger'
import { policyToLegacyCombo } from './framework/registry'
import { parsePlayerCount } from './game-request'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function roleName(role: string): string {
  return { werewolf: '狼人', seer: '预言家', witch: '女巫', villager: '平民' }[role] ?? role
}

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
      knowledge: role.knowledge && typeof role.knowledge === 'object'
        ? {
            teams: Array.isArray((role.knowledge as Record<string, unknown>).teams) ? ((role.knowledge as Record<string, unknown>).teams as unknown[]).map(String) : undefined,
            roles: Array.isArray((role.knowledge as Record<string, unknown>).roles) ? ((role.knowledge as Record<string, unknown>).roles as unknown[]).map(String) : undefined,
            except_roles: Array.isArray((role.knowledge as Record<string, unknown>).except_roles) ? ((role.knowledge as Record<string, unknown>).except_roles as unknown[]).map(String) : undefined,
            label: String((role.knowledge as Record<string, unknown>).label ?? '你额外知道'),
          }
        : undefined,
    }
  })
  const actions = asNonEmptyArray(input.actions, 'actions').map((item) => {
    const action = item as Record<string, unknown>
    const primitive = action.primitive as GamePrimitive
    if (!VALID_PRIMITIVES.includes(primitive)) {
      throw new Error(`GameSpec 动作原语不合法：${String(action.primitive)}`)
    }
    return {
      id: String(action.id ?? 'action'),
      name: String(action.name ?? action.id ?? '动作'),
      primitive,
      role: String(action.role ?? 'all'),
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
      ? compositionRaw.by_player_count as Record<string, string[]>
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
  const loopRaw = input.game_loop && typeof input.game_loop === 'object' ? input.game_loop as Record<string, unknown> : null
  const questRaw = input.quest_rules && typeof input.quest_rules === 'object' ? input.quest_rules as Record<string, unknown> : null
  return {
    game_type: String(input.game_type ?? 'unknown'),
    name: String(input.name ?? input.game_type ?? '博弈游戏'),
    description: String(input.description ?? ''),
    min_players: Number(input.min_players ?? 2),
    max_players: Number(input.max_players ?? 20),
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
        role: condition.role ? String(condition.role) : undefined,
        team_a: condition.team_a ? String(condition.team_a) : undefined,
        team_b: condition.team_b ? String(condition.team_b) : undefined,
        winner: condition.winner ? String(condition.winner) : undefined,
        winner_label: condition.winner_label ? String(condition.winner_label) : undefined,
      }
    }),
    fallback_rule: String(input.fallback_rule ?? ''),
    game_loop: loopRaw ? {
      cycle_phase_ids: Array.isArray(loopRaw.cycle_phase_ids) ? loopRaw.cycle_phase_ids.map(String) : [],
      max_rounds: Math.max(1, Number(loopRaw.max_rounds ?? 1)),
      break_on_winner: loopRaw.break_on_winner !== false,
    } : undefined,
    quest_rules: questRaw ? {
      team_sizes_by_player_count: (questRaw.team_sizes_by_player_count ?? {}) as Record<string, number[]>,
      fail_threshold_by_round: (questRaw.fail_threshold_by_round ?? {}) as Record<string, number>,
      fail_threshold_by_player_count: (questRaw.fail_threshold_by_player_count ?? {}) as Record<string, Record<string, number>>,
      successes_to_win: Number(questRaw.successes_to_win ?? 3),
      failures_to_win: Number(questRaw.failures_to_win ?? 3),
      max_rejected_teams: Number(questRaw.max_rejected_teams ?? 5),
      assassin_role: questRaw.assassin_role ? String(questRaw.assassin_role) : undefined,
      protected_role: questRaw.protected_role ? String(questRaw.protected_role) : undefined,
      good_team: String(questRaw.good_team ?? 'good'),
      evil_team: String(questRaw.evil_team ?? 'evil'),
      good_win_label: String(questRaw.good_win_label ?? '好人阵营'),
      evil_win_label: String(questRaw.evil_win_label ?? '邪恶阵营'),
    } : undefined,
  }
}

/** 按 GameSpec.composition 生成角色列表。 */
export function buildRoleList(spec: GameSpec, playerCount: number): string[] {
  const count = Math.max(spec.min_players, Math.min(spec.max_players, Math.floor(playerCount)))
  const exact = spec.composition.by_player_count?.[String(count)]
  if (exact?.length === count) return [...exact]
  const roles: string[] = []
  for (const fixed of spec.composition.fixed) {
    for (let i = 0; i < fixed.count; i++) roles.push(fixed.role)
  }
  for (const ratio of spec.composition.ratio) {
    let amount = Math.max(ratio.min ?? 1, Math.floor(count / ratio.denominator))
    amount = Math.min(amount, ratio.max ?? amount)
    for (let i = 0; i < amount; i++) roles.push(ratio.role)
  }
  while (roles.length < count) roles.push(spec.composition.fill_role)
  return roles.slice(0, count)
}

function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = 2166136261
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  const result = [...items]
  const random = () => {
    seed += 0x6d2b79f5
    let value = seed
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function addRoleKnowledge(spec: GameSpec, players: GamePlayerState[]) {
  for (const player of players) {
    const role = spec.roles.find((item) => item.id === player.role)
    if (!role?.knowledge) continue
    const visible = players.filter((candidate) => {
      if (candidate.id === player.id) return false
      if (role.knowledge?.except_roles?.includes(candidate.role)) return false
      return Boolean(role.knowledge?.teams?.includes(candidate.team) || role.knowledge?.roles?.includes(candidate.role))
    })
    if (visible.length) {
      player.private_info += `\n${role.knowledge.label ?? '你额外知道'}：${visible.map((item) => `${item.name}(${item.id})`).join('、')}。`
    }
  }
}

/** 生成玩家名单；明确人数优先，角色在非固定六人回放局中做可复现洗牌。 */
export function buildPlayers(spec: GameSpec, userInput: string, playerCount?: number): GamePlayerState[] {
  const requested = parsePlayerCount(userInput) ?? playerCount ?? spec.min_players
  const baseRoles = buildRoleList(spec, requested)
  const keepPresetOrder = spec.game_type === 'werewolf' && baseRoles.length === 6
  const roleList = keepPresetOrder ? baseRoles : seededShuffle(baseRoles, `${spec.game_type}:${userInput}:${baseRoles.length}`)
  const count = roleList.length
  const presetNames = ['沈默', '阿岚', '陆一', '苏叶', '老周', '小满']
  const players = roleList.map((role, index) => {
    const id = `p${index + 1}`
    const name = count === 6 ? presetNames[index] : `玩家${index + 1}`
    const roleSpec = spec.roles.find((item) => item.id === role)
    return {
      id,
      name,
      role,
      role_label: roleSpec?.name ?? roleName(role),
      team: roleSpec?.team ?? role,
      alive: true,
      private_info: `${roleSpec?.name ?? roleName(role)} · ${roleSpec?.description ?? ''}`,
    }
  })
  addRoleKnowledge(spec, players)
  return players
}

function toRoster(players: GamePlayerState[]): WerewolfRosterEntry[] {
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
  if (condition.type === 'team_ge' && condition.team_a && condition.team_b) {
    const a = alive.filter((player) => player.team === condition.team_a).length
    const b = alive.filter((player) => player.team === condition.team_b).length
    return a >= b
  }
  return false
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
      winner_label: null,
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

    this.emitReport(spec, userInput, state)
    this.emit({ t: 'game_state', alive: state.players.filter((p) => p.alive).map((p) => p.id), dead: state.players.filter((p) => !p.alive).map((p) => p.id), phase: 'end', roster: toRoster(state.players) })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })
    this.emit({ t: 'run_done', elapsed_ms: Date.now() - start, terminal_state: 'DECIDED' })
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
    // UI 的每个 PhaseBlock 独立归约事件，因此每阶段都发送完整名单，
    // 防止后续阶段因 roster 缺失而回退成旧的六人狼人杀展示。
    this.emit({
      t: 'game_state',
      alive: state.players.filter((player) => player.alive).map((player) => player.id),
      dead: state.players.filter((player) => !player.alive).map((player) => player.id),
      phase: phase.id,
      roster: toRoster(state.players),
    })
    await this.paced()

    if (phase.kind === 'setup') {
      for (const player of state.players) {
        this.emit({
          t: 'game_event',
          event: {
            kind: 'GameAction', phase: state.phase_id, phase_label: state.phase_label, round: 0,
            actor: player.id, action: 'reveal', action_label: '初始信息',
            result: `${player.name} 获得初始信息（仅本人可见）`, visible_to: [player.id],
          },
        })
        await this.paced(180)
      }
    } else if (phase.kind === 'end') {
      this.runJudge(spec, state)
    } else {
      await this.runPhaseActions(spec, state, phase.actions)
    }

    this.emit({ t: 'phase_done', phase_id: phase.id, name: phase.name })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })
  }

  private async runPhaseActions(spec: GameSpec, state: GameState, actionIds: string[]) {
    for (const actionId of actionIds) {
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
      const participants = this.participantsFor(action.role, state)
      for (const player of participants) {
        await this.executeAction(spec, state, action, player)
      }
    }
  }

  private participantsFor(role: string, state: GameState): GamePlayerState[] {
    if (role === 'all') return state.players.filter((player) => player.alive)
    if (role === '__leader') {
      const alive = state.players.filter((player) => player.alive)
      return alive.length ? [alive[(state.leader_index ?? 0) % alive.length]] : []
    }
    if (role === '__proposed_team') {
      if (!state.team_approved) return []
      return state.players.filter((player) => player.alive && state.proposed_team?.includes(player.id))
    }
    return state.players.filter((player) => player.alive && player.role === role)
  }

  private actionContext(spec: GameSpec, state: GameState, action: GameActionSpec, player: GamePlayerState) {
    const alive = state.players.filter((candidate) => candidate.alive)
    const questNumber = state.quest_number ?? 1
    const teamSizes = spec.quest_rules?.team_sizes_by_player_count[String(state.players.length)] ?? []
    return {
      game_type: spec.game_type,
      game_name: spec.name,
      action_id: action.id,
      primitive: action.primitive,
      phase: state.phase_label,
      round: state.round,
      player: { id: player.id, name: player.name, role: player.role, role_label: player.role_label, team: player.team, private_info: player.private_info },
      alive_players: alive.map((candidate) => ({ id: candidate.id, name: candidate.name })),
      valid_targets: alive.filter((candidate) => candidate.id !== player.id).map((candidate) => ({ id: candidate.id, name: candidate.name })),
      proposed_team: state.proposed_team ?? [],
      required_team_size: teamSizes[questNumber - 1] ?? null,
      quest_number: questNumber,
      quest_score: { success: state.quest_successes ?? 0, failure: state.quest_failures ?? 0 },
      public_log: state.public_log.slice(-20),
    }
  }

  private async executeAction(spec: GameSpec, state: GameState, action: GameActionSpec, player: GamePlayerState) {
    const context = this.actionContext(spec, state, action, player)
    const system = `${replacePlaceholders(action.prompt, player, state)}\n\n你的秘密信息：${player.private_info}\n\n[GAME_CONTEXT]\n${JSON.stringify(context)}`
    const { data, tokens } = await callJSON<GameActionOutput>(
      this.caller,
      system,
      `输出 JSON：${action.output_schema}`,
      (attempt) => this.emit({ t: 'retry', reason: `${action.name} JSON 解析失败`, attempt }),
    )
    this.ledger.record(tokens)
    this.applyPrimitive(spec, action.primitive, state, player, data)
    this.emitAction(action, state, player, data)
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
        const candidates = state.players.filter((item) => item.alive && item.id !== player.id)
        const target = candidates.find((item) => item.id === data.target) ?? candidates[0]
        if (target) player.private_info += `\n查验结果：${target.name} 是「${target.role_label}」。`
        break
      }
      case 'decide_life':
        state.pending_save = Boolean(data.use_antidote)
        state.pending_poison = data.poison_target ?? undefined
        break
      case 'mark_dead':
        if (data.target) {
          const target = state.players.find((item) => item.id === data.target)
          if (target) target.alive = false
        }
        break
      case 'revive':
        if (data.target) {
          const target = state.players.find((item) => item.id === data.target)
          if (target) target.alive = true
        }
        break
      case 'poison':
        if (state.pending_poison) {
          const target = state.players.find((item) => item.id === state.pending_poison)
          if (target) target.alive = false
        }
        break
      case 'public_speech':
        state.public_log.push(`${player.name}：${data.content ?? ''}`)
        break
      case 'vote':
        {
          const candidates = state.players.filter((candidate) => candidate.alive && candidate.id !== player.id)
          const target = candidates.find((candidate) => candidate.id === data.target) ?? candidates[0]
          state.votes = [...(state.votes ?? []), { agent_id: player.id, vote: target?.id ?? '', reason: data.reason ?? '' }]
          state.public_log.push(`${player.name} 投票给 ${target?.name ?? '弃权'}（${data.reason ?? ''}）`)
        }
        break
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
        const rules = spec.quest_rules
        const sizes = rules?.team_sizes_by_player_count[String(state.players.length)] ?? []
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
        const rules = spec.quest_rules
        const success = player.team === rules?.good_team ? true : data.quest_success !== false
        state.quest_votes = [...(state.quest_votes ?? []), { agent_id: player.id, success }]
        break
      }
      case 'assassinate': {
        const candidates = state.players.filter((candidate) => candidate.alive && candidate.id !== player.id && candidate.team !== player.team)
        state.pending_kill = candidates.find((candidate) => candidate.id === data.target)?.id ?? candidates[0]?.id
        break
      }
      case 'resolve_team_vote':
      case 'resolve_quest':
      case 'resolve_assassination':
      case 'private_chat':
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
  }

  private resolveVote(state: GameState) {
    const votes = state.votes ?? []
    const tally: Record<string, number> = {}
    for (const vote of votes) {
      if (!vote.vote) continue
      tally[vote.vote] = (tally[vote.vote] ?? 0) + 1
    }
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1])
    if (ranked.length === 0) return
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
      state.winner = rules.evil_team
      state.winner_label = rules.evil_win_label
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
    state.public_log.push(`第 ${questNumber} 次任务${succeeded ? '成功' : '失败'}（出现 ${failures} 张失败票）。`)
    this.emitSystemResult(state, 'resolve_quest', '任务结算', `第 ${questNumber} 次任务${succeeded ? '成功' : '失败'}：${failures} 张失败票，失败阈值为 ${threshold}。`)
    state.quest_number = questNumber + 1
    state.leader_index = (state.leader_index ?? 0) + 1
    state.team_approved = false
    state.proposed_team = []
    state.team_votes = []
    state.quest_votes = []

    if ((state.quest_failures ?? 0) >= rules.failures_to_win) {
      state.winner = rules.evil_team
      state.winner_label = rules.evil_win_label
    } else if ((state.quest_successes ?? 0) >= rules.successes_to_win) {
      if (rules.assassin_role && rules.protected_role && state.players.some((player) => player.alive && player.role === rules.assassin_role)) {
        state.awaiting_assassination = true
      } else {
        state.winner = rules.good_team
        state.winner_label = rules.good_win_label
      }
    }
  }

  private resolveAssassination(state: GameState, spec: GameSpec) {
    const rules = spec.quest_rules
    if (!rules || !state.awaiting_assassination) return
    const target = state.players.find((player) => player.id === state.pending_kill)
    const hit = target?.role === rules.protected_role
    state.winner = hit ? rules.evil_team : rules.good_team
    state.winner_label = hit ? rules.evil_win_label : rules.good_win_label
    state.awaiting_assassination = false
    this.emitSystemResult(
      state,
      'resolve_assassination',
      '刺杀结算',
      target ? `刺客选择了 ${target.name}（${target.role_label}），${hit ? '成功找到关键角色，邪恶阵营翻盘。' : '未命中关键角色，好人阵营获胜。'}` : '刺客未能选择有效目标，好人阵营获胜。',
    )
  }

  private runJudge(spec: GameSpec, state: GameState) {
    this.runJudgeForState(state, spec)
  }

  private runJudgeForState(state: GameState, spec: GameSpec | null) {
    if (!spec) return
    for (const condition of spec.win_conditions) {
      if (winCondition(state, condition)) {
        state.winner = condition.winner ?? condition.team_a ?? condition.id
        state.winner_label = condition.winner_label ?? condition.description
        return
      }
    }
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
              : `${player.name} 执行「${action.name}」${data.target ? ` → ${state.players.find((p) => p.id === data.target)?.name ?? data.target}` : ''}`
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
      ...(spec.quest_rules ? [`- 任务比分：成功 ${state.quest_successes ?? 0} / 失败 ${state.quest_failures ?? 0}`] : []),
      `- 胜负：${state.winner_label ?? (state.winner ? state.winner : '未分胜负')}`,
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
    roles: [{ id: '<role_id>', name: '<角色名>', team: '<阵营>', description: '<能力说明>', actions: ['<action_id>'] }],
    actions: [{ id: '<action_id>', name: '<动作名>', primitive: '<见下方原语>', role: '<角色或all>', audience: 'self|team|public|god', prompt: '<给Agent的指令>', output_schema: '<JSON schema>' }],
    composition: { fixed: [], ratio: [], fill_role: '<角色id>', by_player_count: {} },
    phases: [{ id: '<phase_id>', name: '<阶段名>', purpose: '<阶段目的>', kind: 'setup|action|speak|vote|end', participants: 'all|all_alive|["role"]', actions: ['<action_id>'], policy: { A: 'A1', B: 'B1', C: 'C1', D: 'D1', E: 'E1' }, order: 'sequential' }],
    win_conditions: [{ id: '<win_id>', description: '<胜负条件>', type: 'role_eliminated|team_ge|llm' }],
    fallback_rule: '<无法判定时的兜底规则>',
    game_loop: { cycle_phase_ids: ['<需要循环的phase_id>'], max_rounds: 5, break_on_winner: true },
  })
  const { data } = await callJSON<GameSpec>(
    caller,
    `你是通用博弈规则编译器。你的任务是把用户指定的游戏转换成可执行的 GameSpec，而不是复制任何已有模板。
禁止默认输出狼人杀规则。必须依据用户描述或下方检索到的规则，真实描述该游戏的阵营、角色能力、回合流程和胜负条件。
可用原语：assign_roles, private_chat, select_target, inspect_role, mark_dead, revive, poison, decide_life, public_speech, vote, resolve_night, resolve_vote, judge_winner, propose_team, approve_team, resolve_team_vote, quest_vote, resolve_quest, assassinate, resolve_assassination。
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
