import type { LLMCaller } from './llm'
import type { TaskProfile } from './types'
import { parseGameRequest } from './game-request'
import { createScriptedCaller, type ScriptData } from './scripted'

interface ReplayGameContext {
  game_type: string
  action_id: string
  primitive: string
  round: number
  player: { id: string; name: string; role: string; role_label: string; team: string; private_info: string }
  alive_players: { id: string; name: string }[]
  valid_targets: { id: string; name: string }[]
  proposed_team: string[]
  required_team_size: number | null
  quest_number: number
  public_log: string[]
}

const OFFLINE_GAME_DEFAULTS: Record<string, number> = {
  werewolf: 6,
  undercover: 6,
  mafia: 8,
  cyber_defense: 8,
  fraud_audit: 8,
  avalon: 8,
}

export function offlineProfile(userInput: string): TaskProfile {
  const request = parseGameRequest(userInput)
  const defaultCount = request.gameType ? OFFLINE_GAME_DEFAULTS[request.gameType] : undefined
  if (request.gameType && defaultCount) {
    return {
      agent_count: request.playerCount ?? defaultCount,
      task_type: 'competitive',
      game_type: request.gameType,
      domain: 'game',
      time_pressure: 'sustained',
      information_asymmetry: 'high',
      agent_relations: 'adversarial',
      decision_pattern: 'sequential',
      resource_scarcity: 'high',
      verifiability: 'automatable',
      reasoning: `离线规则识别：${request.gameType}${request.playerCount ? `，${request.playerCount} 名玩家` : ''}`,
    }
  }
  return {
    agent_count: 1,
    task_type: 'single',
    game_type: null,
    domain: 'general',
    time_pressure: 'relaxed',
    information_asymmetry: 'low',
    agent_relations: 'cooperative',
    decision_pattern: 'single_shot',
    resource_scarcity: 'low',
    verifiability: 'subjective',
    reasoning: '离线模式未识别到可离线运行的任务；使用单 Agent 提示用户配置 Live 模式。',
  }
}

function extractContext(system: string): ReplayGameContext | null {
  const marker = '[GAME_CONTEXT]\n'
  const start = system.lastIndexOf(marker)
  if (start < 0) return null
  try {
    return JSON.parse(system.slice(start + marker.length).trim()) as ReplayGameContext
  } catch {
    return null
  }
}

function nextTarget(context: ReplayGameContext): string {
  if (!context.valid_targets.length) return ''
  const ownNumber = Number(context.player.id.replace(/\D/g, '')) || 0
  return context.valid_targets[ownNumber % context.valid_targets.length].id
}

const UNDERCOVER_CLUES: Record<'civilian' | 'spy', string[]> = {
  civilian: [
    '它常见的颜色不止一种，口感有甜也有微酸。',
    '一只手就能拿住，切开后里面的籽排列得很规整。',
    '它经常出现在午餐盒里，也常被做成派。',
    '表皮通常比较光滑，放久后口感会逐渐变软。',
    '很多故事和品牌都会借用它的形象。',
  ],
  spy: [
    '它成熟时汁水很多，外形通常不是正圆的。',
    '果肉清甜，靠近果核的位置口感会更明显。',
    '它也有不同颜色，顶部常能看到一小段果柄。',
  ],
}

function undercoverSpeech(context: ReplayGameContext): string {
  const role = context.player.role === 'spy' ? 'spy' : 'civilian'
  const playerNumber = Number(context.player.id.replace(/\D/g, '')) || 1
  const clues = UNDERCOVER_CLUES[role]
  return clues[(playerNumber + context.round - 2) % clues.length]
}

function undercoverSuspect(context: ReplayGameContext): string {
  const suspiciousLine = context.public_log.find((line) => /不是正圆|靠近果核/.test(line))
  const suspect = suspiciousLine
    ? context.alive_players.find((player) => suspiciousLine.startsWith(`${player.name}：`))
    : undefined
  return suspect?.id ?? nextTarget(context)
}

function gameResponse(context: ReplayGameContext): Record<string, unknown> {
  switch (context.primitive) {
    case 'private_chat':
      return { content: `建议观察并针对 ${nextTarget(context)}，避免暴露同伴。`, suggest_target: nextTarget(context) }
    case 'select_target':
    case 'inspect_role':
      return { target: nextTarget(context), reason: '基于当前公开信息选择' }
    case 'decide_life':
      return { use_antidote: context.quest_number === 1, poison_target: null, reason: '首轮优先保留更多公开信息' }
    case 'public_speech':
      if (context.game_type === 'undercover') {
        return { content: undercoverSpeech(context), suspect: null }
      }
      return { content: `我是${context.player.name}。目前信息有限，我会结合前序发言、组队记录和投票变化继续判断。`, suspect: context.valid_targets[0]?.id ?? null }
    case 'vote': {
      if (context.game_type === 'undercover') {
        if (context.round === 1) return { target: nextTarget(context), reason: '首轮线索不足，先保留判断' }
        const target = context.player.role === 'spy' ? nextTarget(context) : undercoverSuspect(context)
        return { target, reason: context.player.role === 'spy' ? '尝试把怀疑引向描述较模糊的人' : '其关于形状和果核的描述与多数线索不一致' }
      }
      return { target: nextTarget(context), reason: '其当前行为与公开信息最不一致' }
    }
    case 'propose_team': {
      const required = context.required_team_size ?? Math.min(2, context.alive_players.length)
      const ownIndex = Math.max(0, context.alive_players.findIndex((player) => player.id === context.player.id))
      const team: string[] = []
      for (let offset = 0; offset < context.alive_players.length && team.length < required; offset++) {
        const candidate = context.alive_players[(ownIndex + offset) % context.alive_players.length]
        if (!team.includes(candidate.id)) team.push(candidate.id)
      }
      return { team, reason: '采用轮换队长下的可追踪组队方案' }
    }
    case 'approve_team':
      return { approve: true, reason: context.proposed_team.includes(context.player.id) ? '我在队内，愿意接受检验' : '先用任务结果获取信息' }
    case 'quest_vote':
      return { quest_success: context.player.team !== 'evil', reason: context.player.team === 'evil' ? '选择破坏任务' : '好人必须提交成功票' }
    case 'assassinate':
      return { target: nextTarget(context), reason: '根据组队与投票轨迹判断关键角色' }
    default:
      return {}
  }
}

/** 预设文本继续使用预录剧本；自由输入使用与人数、游戏相匹配的确定性离线应答。 */
export function createReplayCaller(userInput: string, script?: ScriptData | null): LLMCaller {
  if (script) return createScriptedCaller(script)
  const profile = offlineProfile(userInput)
  const result = (value: unknown, tokens = 160) => Promise.resolve({
    text: typeof value === 'string' ? value : JSON.stringify(value),
    tokens,
    invocation: { mode: 'replay' as const, model: 'adaptive-offline-replay', latency_ms: 0, result_status: 'success' as const },
  })

  return async (system: string) => {
    if (system.includes('Query Complexity 评估器')) {
      return result({
        dimensions: {
          reasoning_depth: { score: 3, confidence: 0.82 }, step_count: { score: 4, confidence: 0.82 },
          domain_expertise: { score: 2, confidence: 0.82 }, tool_dependency: { score: 1, confidence: 0.9 },
          coordination: { score: profile.task_type === 'competitive' ? 5 : 1, confidence: 0.88 },
          uncertainty: { score: profile.task_type === 'competitive' ? 4 : 2, confidence: 0.82 },
        },
        confidence: 0.84,
      }, 220)
    }
    if (system.includes('MA-Collab 编排框架的 Dispatcher')) return result(profile, 220)
    if (system.includes('直接、可靠的助手')) {
      return result('当前未配置 API Key。离线模式可运行内置博弈或预设演示；其他自由任务请配置 Live 模式。', 80)
    }
    const context = extractContext(system)
    if (context) return result(gameResponse(context), 120)
    return result({}, 80)
  }
}
