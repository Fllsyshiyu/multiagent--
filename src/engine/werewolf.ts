/**
 * Werewolf Extension · 博弈扩展（《优化框架》第九节：不进核心）
 * 复用最终框架：communication_mode:private Modifier、B3 角色路由、A1 全体激活、E5 投票决议
 * 扩展独有：淘汰、秘密角色分派、胜负判定
 * Demo 规模：6 人局（2狼 / 预言家 / 女巫 / 2平民），一个完整昼夜循环 + 复盘
 */
import type { AgentCard, WerewolfAction, WerewolfSpeech } from './types'
import { callJSON, type LLMCaller } from './llm'
import { TokenLedger } from './ledger'
import type { Emit } from './engine'
import { validateVote } from './framework/validation'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Player extends AgentCard {
  alive: boolean
}

const ROLE_INFO: Record<string, { team: string; desc: string }> = {
  werewolf: { team: '狼人阵营', desc: '夜晚通过私密通信 Modifier 与同伴选择袭击目标；白天隐藏身份' },
  seer: { team: '好人阵营', desc: '每晚查验一名玩家身份（B3：结果仅自己可见）' },
  witch: { team: '好人阵营', desc: '拥有一瓶解药和一瓶毒药（B3：仅自己知道用药情况）' },
  villager: { team: '好人阵营', desc: '无特殊能力，通过发言与投票找出狼人' },
}

export function buildWerewolfPlayers(): Player[] {
  const defs: [string, string, string][] = [
    ['p1', '沈默', 'werewolf'],
    ['p2', '阿岚', 'werewolf'],
    ['p3', '陆一', 'seer'],
    ['p4', '苏叶', 'witch'],
    ['p5', '老周', 'villager'],
    ['p6', '小满', 'villager'],
  ]
  return defs.map(([id, name, role]) => ({
    id,
    name,
    archetype: ROLE_INFO[role].team,
    relationship: '狼人杀玩家',
    interests: [ROLE_INFO[role].team === '狼人阵营' ? '隐藏身份并淘汰好人' : '找出并投票淘汰狼人'],
    stance: '未知',
    can_say: ['分析局势', '质疑他人', '表达自己的判断'],
    cannot_say: role === 'werewolf' ? ['暴露自己和同伴的狼人身份'] : ['编造游戏规则外的信息'],
    secret_role: role,
    team: ROLE_INFO[role].team,
    private_info: `你的秘密身份是「${roleName(role)}」。${ROLE_INFO[role].desc}。`,
    alive: true,
  }))
}

function roleName(role: string): string {
  return { werewolf: '狼人', seer: '预言家', witch: '女巫', villager: '平民' }[role] ?? role
}

export class WerewolfGame {
  private ledger = new TokenLedger()
  private caller: LLMCaller
  private emit: Emit
  private fast: boolean

  constructor(caller: LLMCaller, emit: Emit, opts?: { fast?: boolean }) {
    this.caller = caller
    this.emit = emit
    this.fast = opts?.fast ?? false
  }

  private async paced(ms = 400) {
    if (!this.fast) await sleep(ms)
  }

  async run(userInput: string): Promise<void> {
    const start = Date.now()
    const players = buildWerewolfPlayers()
    const transcript: string[] = []

    // ---- 阶段：秘密角色分派（扩展独有逻辑） ----
    this.ledger.setPhase('game_setup')
    this.emit({
      t: 'phase_start', phase_id: 'setup', name: '秘密角色分派', purpose: '扩展独有逻辑：身份按 B3 角色路由，仅本人可见',
      strategy: { A: ['A1'], B: 'B3', C: 'C1', D: 'D1', E: ['E1'], notes: ['B3 角色路由：每个玩家只能看到自己的身份牌'] },
    })
    for (const p of players) {
      this.emit({ t: 'game_event', event: { kind: 'WerewolfAction', round: 0, actor: p.id, action: 'reveal', result: `${p.name} 抽到了身份牌（仅本人可见）`, visible_to: [p.id] } })
      await this.paced(220)
    }
    this.emit({ t: 'game_state', alive: players.map((p) => p.id), dead: [], phase: 'night_1' })
    this.emit({ t: 'phase_done', phase_id: 'setup', name: '秘密角色分派' })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })

    // ---- 夜晚：狼人私聊（communication_mode:private Modifier） ----
    this.ledger.setPhase('night_1')
    this.emit({
      t: 'phase_start', phase_id: 'night_1', name: '第 1 夜 · 狼人私聊', purpose: 'A2 代表制 + 私密通信 Modifier：内容不进入公共工件',
      strategy: { A: ['A2'], B: 'B3', C: 'C1', D: 'D1', E: ['E1'], notes: ['Modifier:private_channel，仅狼人阵营可见'] },
    })
    const wolves = players.filter((p) => p.secret_role === 'werewolf')
    const wolfPlan: { speaker: string; content: string; target: string }[] = []
    for (const w of wolves) {
      const { data, tokens } = await callJSON<{ content: string; suggest_target: string }>(
        this.caller,
        `你正在玩狼人杀，你是「${w.name}」（${w.id}），身份：狼人。同伴是 ${wolves.filter((x) => x.id !== w.id).map((x) => x.name).join('、')}。
现在是夜晚，你在私密通信频道与同伴商议今晚袭击谁。其他玩家：${players.filter((p) => p.secret_role !== 'werewolf').map((p) => `${p.name}(${p.id})`).join('、')}。
${wolfPlan.length ? `同伴刚才说：${wolfPlan[0].content}` : '你先发言。'}`,
        `输出 JSON：{"content":"<40字内私聊内容>","suggest_target":"<建议袭击的玩家id>"}`,
        (n) => this.emit({ t: 'retry', reason: '狼人私聊 JSON 解析失败', attempt: n }),
      )
      this.ledger.record(tokens)
      wolfPlan.push({ speaker: w.id, content: data.content, target: data.suggest_target })
      this.emit({ t: 'game_event', event: { kind: 'WerewolfSpeech', phase: 'night', round: 1, agent_id: w.id, audience: 'private', content: data.content } satisfies WerewolfSpeech })
      await this.paced(300)
    }
    // 狼群达成目标：采纳最后一狼的建议（须为非狼人）；退化为预言家（对观众更有戏剧性）
    let victim = players.find((p) => p.id === wolfPlan[wolfPlan.length - 1].target && p.secret_role !== 'werewolf')
    if (!victim) victim = players.find((p) => p.secret_role === 'seer' && p.alive)!
    this.emit({ t: 'game_event', event: { kind: 'WerewolfAction', round: 1, actor: 'wolves', action: 'kill', target: victim.id, result: `狼人决定袭击 ${victim.name}`, visible_to: wolves.map((w) => w.id).concat(['god']) } satisfies WerewolfAction })

    // ---- 夜晚：预言家查验（B3） ----
    const seer = players.find((p) => p.secret_role === 'seer')!
    {
      const candidates = players.filter((p) => p.id !== seer.id)
      const { data, tokens } = await callJSON<{ target: string; reasoning: string }>(
        this.caller,
        `你是狼人杀玩家「${seer.name}」，身份：预言家。夜晚你可以查验一名玩家的身份。玩家：${candidates.map((c) => `${c.name}(${c.id})`).join('、')}。`,
        `选择一名你最想查验的玩家。输出 JSON：{"target":"<玩家id>","reasoning":"<30字内>"}`,
        (n) => this.emit({ t: 'retry', reason: '预言家查验 JSON 解析失败', attempt: n }),
      )
      this.ledger.record(tokens)
      const target = candidates.find((c) => c.id === data.target) ?? candidates[0]
      const isWolf = target.secret_role === 'werewolf'
      transcript.push(`预言家查验 ${target.name}：${isWolf ? '狼人' : '好人'}`)
      this.emit({ t: 'game_event', event: { kind: 'WerewolfAction', round: 1, actor: seer.id, action: 'check', target: target.id, result: `预言家查验 ${target.name} → ${isWolf ? '🐺 狼人' : '好人'}（B3：仅预言家可见）`, visible_to: [seer.id, 'god'] } })
      await this.paced(280)
    }

    // ---- 夜晚：女巫决策（B3） ----
    const witch = players.find((p) => p.secret_role === 'witch')!
    let saved = false
    let poisonVictim: Player | null = null
    {
      const { data, tokens } = await callJSON<{ use_antidote: boolean; poison_target: string | null; reasoning: string }>(
        this.caller,
        `你是狼人杀玩家「${witch.name}」，身份：女巫。今晚 ${victim.name} 被狼人袭击。你有一瓶解药（可救活他/她）和一瓶毒药。第一夜通常是信息最少的时刻。`,
        `是否使用解药？是否使用毒药？输出 JSON：{"use_antidote":<true|false>,"poison_target":<玩家id或null>,"reasoning":"<30字内>"}`,
        (n) => this.emit({ t: 'retry', reason: '女巫决策 JSON 解析失败', attempt: n }),
      )
      this.ledger.record(tokens)
      saved = data.use_antidote
      if (!saved && data.poison_target) poisonVictim = players.find((p) => p.id === data.poison_target && p.alive) ?? null
      this.emit({ t: 'game_event', event: { kind: 'WerewolfAction', round: 1, actor: witch.id, action: saved ? 'save' : 'poison', target: saved ? victim.id : (poisonVictim?.id ?? undefined), result: saved ? `女巫使用解药救下 ${victim.name}（B3：仅女巫可见）` : `女巫选择不救${poisonVictim ? `，并对 ${poisonVictim.name} 使用毒药` : ''}（B3：仅女巫可见）`, visible_to: [witch.id, 'god'] } })
      await this.paced(280)
    }

    // ---- 天亮：公布结果 ----
    const nightDead: Player[] = []
    if (!saved) nightDead.push(victim)
    if (poisonVictim) nightDead.push(poisonVictim)
    for (const d of nightDead) d.alive = false
    const dead: string[] = nightDead.map((d) => d.id)
    this.emit({ t: 'phase_done', phase_id: 'night_1', name: '第 1 夜 · 狼人私聊' })
    this.emit({
      t: 'phase_start', phase_id: 'day_1', name: '第 1 天 · 全体发言', purpose: 'A1 全体激活 + B3：每人只掌握自己的信息',
      strategy: { A: ['A1'], B: 'B3', C: 'C1', D: 'D1', E: ['E1'], notes: ['A1 按顺序全体发言'] },
    })
    this.emit({ t: 'game_event', event: { kind: 'WerewolfAction', round: 1, actor: 'system', action: 'reveal', result: nightDead.length === 0 ? '天亮了，昨晚是平安夜（无人死亡）' : `天亮了，昨晚 ${nightDead.map((d) => d.name).join('、')} 死亡`, visible_to: ['all'] } })
    this.emit({ t: 'game_state', alive: players.filter((p) => p.alive).map((p) => p.id), dead, phase: 'day_1' })

    // ---- 白天发言（A3） ----
    this.ledger.setPhase('day_1')
    const publicLog: string[] = []
    for (const p of players.filter((x) => x.alive)) {
      const known = p.secret_role === 'seer' ? transcript.join('；') : ''
      const { data, tokens } = await callJSON<{ content: string; suspect: string | null }>(
        this.caller,
        `你是狼人杀玩家「${p.name}」（${p.id}）。${p.private_info}
昨晚：${saved ? '平安夜' : `${victim.name} 死亡`}。
${known ? `你掌握的信息：${known}（注意：直接报身份会被狼人针对，斟酌措辞）。` : ''}
${publicLog.length ? `之前的发言：\n${publicLog.join('\n')}` : '你是第一个发言。'}
${p.secret_role === 'werewolf' ? '你是狼人，要误导好人、嫁祸他人，但不能暴露自己和同伴（同伴是 ' + wolves.filter((w) => w.id !== p.id).map((w) => w.name).join('') + '）。' : ''}`,
        `输出 JSON：{"content":"<80字内白天发言>","suspect":"<你最怀疑的玩家id或null>"}`,
        (n) => this.emit({ t: 'retry', reason: '白天发言 JSON 解析失败', attempt: n }),
      )
      this.ledger.record(tokens)
      publicLog.push(`${p.name}：${data.content}`)
      this.emit({ t: 'game_event', event: { kind: 'WerewolfSpeech', phase: 'day', round: 1, agent_id: p.id, audience: 'public', content: data.content } satisfies WerewolfSpeech })
      await this.paced(320)
    }

    // ---- 投票（E5 投票决议） ----
    this.emit({ t: 'phase_done', phase_id: 'day_1', name: '第 1 天 · 全体发言' })
    this.emit({
      t: 'phase_start', phase_id: 'vote_1', name: '投票表决', purpose: 'E5 投票决议：资格校验 → 独立投票 → 计票 → 执行结果',
      strategy: { A: ['A1'], B: 'B3', C: 'C1', D: 'D2', E: ['E5'], notes: ['E5：存活玩家具备资格，得票最多者出局'] },
    })
    const votes: { agent_id: string; vote: string; reason: string }[] = []
    const tally: Record<string, number> = {}
    for (const p of players.filter((x) => x.alive)) {
      const { data, tokens } = await callJSON<{ target: string; reason: string }>(
        this.caller,
        `你是狼人杀玩家「${p.name}」（${p.id}）。${p.secret_role === 'werewolf' ? '你是狼人，投票要给好人。' : ''}
今天的发言：\n${publicLog.join('\n')}
${p.secret_role === 'seer' ? `你掌握：${transcript.join('；')}。` : ''}`,
        `投出你认为最像狼人的一名玩家（不能投自己）。输出 JSON：{"target":"<玩家id>","reason":"<25字内>"}`,
        (n) => this.emit({ t: 'retry', reason: '投票 JSON 解析失败', attempt: n }),
      )
      this.ledger.record(tokens)
      const target = players.find((x) => x.id === data.target && x.id !== p.id) ?? players.find((x) => x.alive && x.id !== p.id)!
      tally[target.id] = (tally[target.id] ?? 0) + 1
      votes.push({ agent_id: p.id, vote: target.id, reason: data.reason })
      await this.paced(200)
    }
    const voteValidation = validateVote({
      eligibleVoterIds: players.filter((player) => player.alive).map((player) => player.id),
      candidateIds: players.filter((player) => player.alive).map((player) => player.id),
      votes,
      quorumRatio: 0.5,
    })
    if (!voteValidation.ok) throw new Error('E5 投票校验失败：' + voteValidation.issues.map((entry) => entry.message).join('；'))
    const eliminatedId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]
    const eliminated = players.find((p) => p.id === eliminatedId)!
    eliminated.alive = false
    const wolvesLeft = players.filter((p) => p.alive && p.secret_role === 'werewolf').length
    const goodLeft = players.filter((p) => p.alive && p.secret_role !== 'werewolf').length
    const resultText = `${eliminated.name} 以 ${tally[eliminatedId]} 票出局，其身份是「${roleName(eliminated.secret_role!)}」。${wolvesLeft === 0 ? '狼人全部出局，好人阵营获胜！' : wolvesLeft >= goodLeft ? '狼人数量已不少于好人，狼人阵营获胜！' : '游戏将继续（Demo 演示到此为一个完整昼夜循环）。'}`
    this.emit({ t: 'vote', votes, result: resultText })
    this.emit({ t: 'game_state', alive: players.filter((p) => p.alive).map((p) => p.id), dead: players.filter((p) => !p.alive).map((p) => p.id), phase: 'end' })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })

    // ---- 复盘（扩展独有：胜负判定 + 策略复用清单） ----
    this.ledger.setPhase('review')
    this.emit({ t: 'phase_done', phase_id: 'vote_1', name: '投票表决' })
    this.emit({
      t: 'phase_start', phase_id: 'review', name: '复盘', purpose: '胜负判定 + 通用策略复用清单',
      strategy: { A: [], B: 'B2', C: 'C1', D: 'D2', E: [], notes: [] },
    })
    const markdown = [
      `## 狼人杀对局复盘`,
      ``,
      `**用户输入**：${userInput}`,
      ``,
      `### 对局结果`,
      `- ${resultText}`,
      `- 出局：${players.filter((p) => !p.alive).map((p) => `${p.name}（${roleName(p.secret_role!)}）`).join('、') || '无'}`,
      ``,
      `### 本局复用的通用策略（核心框架代码零改动）`,
      `- **私密通信 Modifier**：狼人夜间密谋，内容不进入公共工件`,
      `- **B3 角色路由**：身份牌、预言家查验、女巫用药均按权限路由`,
      `- **A1 全体激活**：白天按序发言`,
      `- **E5 投票决议**：资格校验后收集投票并执行淘汰`,
      ``,
      `### 扩展独有逻辑（不进核心框架）`,
      `- 秘密角色分派 / 淘汰 / 胜负判定`,
      ``,
      `> 同一引擎、同一套原子策略：换个 extension 就能支撑谈判、竞拍、扑克等博弈场景。`,
    ].join('\n')
    this.emit({ t: 'report', markdown })
    this.emit({ t: 'phase_done', phase_id: 'review', name: '复盘' })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })
    this.emit({ t: 'run_done', elapsed_ms: Date.now() - start, terminal_state: 'DECIDED' })
  }
}
