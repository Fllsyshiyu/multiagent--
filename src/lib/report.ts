import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { RunState } from '../hooks/useRunEngine'
import type { Artifact, EngineEvent } from '../engine/types'
import { STRATEGY_LABELS } from '../engine/dispatcher'

export type ReportTone = 'default' | 'success' | 'warning' | 'danger'

export interface ReportItem {
  kind: 'text' | 'metric' | 'list' | 'score' | 'status'
  label?: string
  text?: string
  items?: string[]
  score?: number
  max?: number
  tone?: ReportTone
}

export interface ReportSection {
  id: string
  title: string
  subtitle?: string
  items: ReportItem[]
}

export interface ReportMeta {
  title: string
  issue: string
  category: 'single' | 'collaborative' | 'competitive' | 'unknown'
  categoryLabel: string
  terminalState: string
  generatedAt: string
  tokens: number
  calls: number
  agentCount: number
}

export interface DeliberationReport {
  meta: ReportMeta
  sections: ReportSection[]
}

function section(id: string, title: string, items: ReportItem[] = [], subtitle?: string): ReportSection {
  return { id, title, subtitle, items }
}

function text(text: string, tone: ReportTone = 'default'): ReportItem {
  return { kind: 'text', text, tone }
}

function list(items: string[]): ReportItem {
  return { kind: 'list', items }
}

function metric(label: string, text: string): ReportItem {
  return { kind: 'metric', label, text }
}

function strategyText(strategy: { A: string[]; B: string; C: string; D: string; E: string[] } | undefined): string {
  if (!strategy) return '未记录'
  const label = (code: string) => STRATEGY_LABELS[code] ?? code
  const parts = [
    `A：${strategy.A.map(label).join(' + ') || '无'}`,
    `B：${label(strategy.B)}`,
    `C：${label(strategy.C)}`,
    `D：${label(strategy.D)}`,
    `E：${strategy.E.map(label).join(' + ') || '无'}`,
  ]
  return parts.join('  ')
}

export function buildDeliberationReport(state: RunState): DeliberationReport {
  const dispatch = state.blocks.find((block): block is Extract<RunState['blocks'][number], { kind: 'dispatch' }> => block.kind === 'dispatch')
  const track = state.blocks.find((block): block is Extract<RunState['blocks'][number], { kind: 'track' }> => block.kind === 'track')
  const compile = state.blocks.find((block): block is Extract<RunState['blocks'][number], { kind: 'compile' }> => block.kind === 'compile')
  const reportBlock = state.blocks.find((block): block is Extract<RunState['blocks'][number], { kind: 'report' }> => block.kind === 'report')
  const profile = dispatch?.profile
  const config = compile?.config
  const category = track?.track ?? 'unknown'
  const categoryLabels: Record<ReportMeta['category'], string> = {
    single: '单 Agent 直接回答',
    collaborative: '多智能体协作议事',
    competitive: '多智能体博弈对局',
    unknown: '未分类任务',
  }
  const meta: ReportMeta = {
    title: '议事报告',
    issue: config?.user_input ?? dispatch?.userInput ?? profile?.reasoning ?? '',
    category,
    categoryLabel: categoryLabels[category],
    terminalState: state.terminalState ?? state.status.toUpperCase(),
    generatedAt: new Date().toLocaleString('zh-CN'),
    tokens: state.ledger.total_tokens,
    calls: state.ledger.calls,
    agentCount: profile?.agent_count ?? config?.agents.length ?? 0,
  }
  const summaryItems: ReportItem[] = [
    metric('议题', meta.issue || '未记录'),
    metric('任务类别', meta.categoryLabel),
    metric('终止状态', meta.terminalState),
    metric('Agent 数量', String(meta.agentCount)),
    metric('LLM 调用', `${meta.calls} 次 / ${meta.tokens.toLocaleString()} tokens`),
  ]
  if (profile) {
    summaryItems.push(metric('场景画像', `${profile.domain} · ${profile.agent_relations} · ${profile.decision_pattern} · ${profile.time_pressure}`))
  }
  if (config) summaryItems.push(metric('策略配方', strategyText(config.strategy)))

  const sections: ReportSection[] = [section('summary', '执行摘要', summaryItems)]

  if (category === 'single') {
    const phases = state.blocks.filter((block) => block.kind === 'phase')
    const directAnswers: string[] = []
    for (const phase of phases) {
      if (phase.kind !== 'phase') continue
      for (const item of phase.phase.items) {
        if (item.kind === 'speech' && item.data.t === 'speech' && item.data.agent_id === '__assistant') {
          directAnswers.push(item.data.content)
        }
      }
    }
    sections.push(section('answer', '直接回答', directAnswers.length ? [text(directAnswers.join('\n\n'))] : [text('未记录直接回答')]))
    sections.push(section('cost', '成本说明', [
      text(`本次任务仅使用单 Agent 轨道，共 ${meta.calls} 次 LLM 调用、${meta.tokens.toLocaleString()} tokens。`),
      text('未进入多智能体协作轨道，未启动 Scenario Compiler、鱼缸议事、评分或试卷阅卷。'),
    ]))
  }

  if (category === 'collaborative') {
    if (config?.agents?.length) {
      sections.push(section('agents', '利益相关方与角色', config.agents.map((agent) => ({
        kind: 'text' as const,
        label: `${agent.name} · ${agent.archetype}`,
        text: `立场：${agent.stance || '未记录'}；关系：${agent.relationship || '未记录'}`,
      }))))
    }

    const proposals = state.artifactFeed.filter((item) => item.artifact.kind === 'CandidateProposal')
    const scoreCards = state.artifactFeed.filter((item) => item.artifact.kind === 'PlanScoreCard')
    if (proposals.length || scoreCards.length) {
      const proposalItems: ReportItem[] = proposals.map((item) => {
        const proposal = item.artifact as Extract<typeof item.artifact, { kind: 'CandidateProposal' }>
        return text(`【${proposal.proposal_id}】${proposal.title || '未命名方案'}：${proposal.summary || '无摘要'}`)
      })
      if (scoreCards.length) {
        proposalItems.push(text(`共产生 ${scoreCards.length} 份结构化评分，覆盖 ${new Set(scoreCards.map((item) => item.agent_id)).size} 位评分 Agent。`))
      }
      sections.push(section('proposals', '候选方案与评分', proposalItems))
    }

    const conflicts = state.artifactFeed.filter((item) => item.artifact.kind === 'ConflictMap')
    const objections = state.artifactFeed.filter((item) => item.artifact.kind === 'ObjectionCard')
    const revisions: string[] = []
    const minority: string[] = []
    const evidenceGaps: string[] = []
    for (const conflict of conflicts) {
      const data = conflict.artifact as Extract<typeof conflict.artifact, { kind: 'ConflictMap' }>
      minority.push(...(data.minority_opinions ?? []))
      evidenceGaps.push(...(data.evidence_gaps ?? []))
      if (data.leading_proposal) revisions.push(`领先方案：${data.leading_proposal}`)
    }
    for (const objection of objections) {
      const data = objection.artifact as Extract<typeof objection.artifact, { kind: 'ObjectionCard' }>
      if (data.required_revision?.length) revisions.push(`第 ${data.round} 轮修订：${data.required_revision.join('；')}`)
    }
    if (revisions.length) sections.push(section('revisions', '冲突与修订路径', [list(revisions)]))
    if (minority.length) sections.push(section('minority', '少数意见保留', [list(minority)], '未被采纳但有依据的反对意见必须保留'))
    if (evidenceGaps.length) sections.push(section('evidence', '证据缺口与待核实事项', [list(evidenceGaps)], '以下内容不应被当作已确认事实'))

    if (state.finalProposal) {
      const proposal = state.finalProposal
      sections.push(section('final', '最终方案', [
        metric('方案名称', proposal.title || '未命名'),
        text(`目标：${proposal.goal || '未记录'}`),
        list(proposal.measures ?? []),
        metric('责任主体', (proposal.responsible_parties ?? []).join('、') || '未记录'),
        metric('资源来源', proposal.resources || '未记录'),
        metric('时间安排', proposal.timeline || '未记录'),
        list(proposal.risk_control ?? []),
        metric('退出机制', proposal.exit_mechanism || '未记录'),
        metric('复评机制', proposal.review_mechanism || '未记录'),
        list(proposal.revision_path ?? []),
      ]))
    }

    if (state.terminalReport) {
      sections.push(section('conclusion', '结论与授权边界', [
        text(state.terminalReport.reason_codes?.length ? `原因编码：${state.terminalReport.reason_codes.join('、')}` : '原因未记录'),
        list(state.terminalReport.recommended_next_actions ?? []),
        text('本报告由 AI 多智能体议事生成，仅用于辅助分析，不替代真实公共决策与实地调研。'),
      ]))
    }
  }

  if (category === 'competitive') {
    const phaseBlocks = state.blocks.filter((block): block is Extract<RunState['blocks'][number], { kind: 'phase' }> => block.kind === 'phase')
    type GameStateItem = { kind: 'game_state'; data: Extract<EngineEvent, { t: 'game_state' }> }
    const gameStates = phaseBlocks
      .flatMap((block) => block.phase.items)
      .filter((item): item is GameStateItem => item.kind === 'game_state' && item.data.t === 'game_state')
    const lastRoster = gameStates.at(-1)?.data.roster ?? []
    if (lastRoster.length) {
      sections.push(section('roster', '玩家与角色', lastRoster.map((player) => ({
        kind: 'text' as const,
        label: `${player.name}（${player.id}）`,
        text: `角色：${player.role_label || player.role}`,
      }))))
    }

    const gameResults = phaseBlocks.flatMap((block) => block.phase.items).filter((item) => item.kind === 'game_result' && item.data.t === 'game_result')
    const finalGameResult = gameResults.at(-1)?.data
    if (finalGameResult?.t === 'game_result') {
      sections.push(section('winner', '胜负结果', [
        { kind: 'status', label: '胜者', text: finalGameResult.result.winner_team === 'draw' ? '平局' : `${finalGameResult.result.winner_label}获胜`, tone: 'success' },
        text(finalGameResult.result.description),
        text(`判定方式：${finalGameResult.result.reason === 'condition' ? '常规胜负条件' : '最大回合终局规则'}`),
      ]))
    }

    const gameEvents: ReportItem[] = []
    const seenGameEvents = new Set<string>()
    const votes: string[] = []
    for (const phase of state.blocks) {
      if (phase.kind !== 'phase') continue
      for (const item of phase.phase.items) {
        if (item.kind === 'game_event' && item.data.t === 'game_event') {
          const event = item.data.event
          // 博弈报告只保留状态变化动作，不保留逐条发言；相同结果去重。
          if (event.kind === 'GameAction' && event.action !== 'setup') {
            const key = `${event.action}:${event.result}`
            if (!seenGameEvents.has(key)) {
              seenGameEvents.add(key)
              gameEvents.push(text(`${event.action_label}：${event.result}`))
            }
          }
        }
        if (item.kind === 'vote' && item.data.t === 'vote') {
          votes.push(item.data.result)
        }
      }
    }
    if (gameEvents.length) sections.push(section('events', '对局过程', gameEvents))
    if (votes.length) sections.push(section('votes', '投票结果', [list(votes)]))
    if (reportBlock) sections.push(section('review', '对局复盘', [text(reportBlock.markdown)]))
  }

  return { meta, sections }
}

function values(items: string[] | undefined, fallback = '无'): string {
  return items?.length ? items.join('；') : fallback
}

function artifactText(artifact: Artifact, agentName: (id?: string) => string): string {
  switch (artifact.kind) {
    case 'InitialAssessmentCard':
      return `${artifact.content}\n初始立场：${artifact.initial_stance}\n主要关切：${values(artifact.main_concerns)}\n方案草案：${values(artifact.proposal_sketch)}\n不可让步项：${values(artifact.non_negotiables)}\n可能让步：${values(artifact.possible_concessions)}`
    case 'CandidateProposal':
      return `【${artifact.proposal_id}】${artifact.title}\n${artifact.summary}\n支持者：${artifact.supporters.map(agentName).join('、') || '未记录'}`
    case 'PlanScoreCard':
      return `方案 ${artifact.proposal_id}：支持度 ${artifact.support_score}/5，可行性 ${artifact.feasibility_score}/5，公平性 ${artifact.fairness_score}/5，风险控制 ${artifact.risk_score}/5\n主要异议：${artifact.main_objection || '无'}\n支持条件：${artifact.support_condition || '无'}`
    case 'ConflictMap':
      return `领先方案：${artifact.leading_proposal || '未记录'}\n主要支持方：${artifact.main_supporters.map(agentName).join('、') || '无'}\n主要反对方：${artifact.main_opponents.map(agentName).join('、') || '无'}\n否决风险：${values(artifact.veto_risks)}\n少数意见：${values(artifact.minority_opinions)}\n证据缺口：${values(artifact.evidence_gaps)}`
    case 'ObjectionCard':
      return `第 ${artifact.round} 轮 · ${artifact.objection_type}\n异议：${artifact.objection}\n要求修订：${values(artifact.required_revision)}\n支持条件：${artifact.support_condition || '无'}${artifact.reply_to ? `\n回应对象：${agentName(artifact.reply_to)}` : ''}`
    case 'OuterObservationCard':
      return `第 ${artifact.round} 轮外圈观察\n遗漏问题：${artifact.missed_issue}\n异议：${artifact.objection}\n所需证据：${values(artifact.evidence_needed)}\n申请进入内圈：${artifact.request_to_enter_inner_circle ? '是' : '否'}；已吸收：${artifact.absorbed ? '是' : '否'}`
    case 'FishbowlSummaryCard':
      return `第 ${artifact.round} 轮摘要\n多数意见：${values(artifact.majority_views)}\n少数意见：${values(artifact.minority_views)}\n核心冲突：${values(artifact.core_conflicts)}\n未答问题：${values(artifact.unanswered_questions)}\n已吸收观察：${values(artifact.absorbed_observations)}\n下一轮邀请：${artifact.next_round_invitees.map(agentName).join('、') || '无'}`
    case 'FinalProposal':
      return `${artifact.title}\n目标：${artifact.goal}\n措施：${values(artifact.measures)}\n责任主体：${values(artifact.responsible_parties)}\n资源来源：${artifact.resources}\n时间安排：${artifact.timeline}\n风险控制：${values(artifact.risk_control)}\n退出机制：${artifact.exit_mechanism}\n复评机制：${artifact.review_mechanism}\n修订路径：${values(artifact.revision_path)}`
    case 'ExamBlueprint':
    case 'ExamResult':
      return ''
    default:
      return ''
  }
}

/**
 * 完整报告保留当前精炼报告作为首页，并追加运行时已经留存的全部公开讨论记录。
 * 内部阅卷仍按产品约定隐藏；模型系统提示与用户提示也不进入导出文件。
 */
export function buildFullDeliberationReport(state: RunState): DeliberationReport {
  const concise = buildDeliberationReport(state)
  const compile = state.blocks.find((block): block is Extract<RunState['blocks'][number], { kind: 'compile' }> => block.kind === 'compile')
  const config = compile?.config
  const latestRoster = state.blocks
    .filter((block): block is Extract<RunState['blocks'][number], { kind: 'phase' }> => block.kind === 'phase')
    .flatMap((block) => block.phase.items)
    .filter((item) => item.data.t === 'game_state' && item.data.roster?.length)
    .at(-1)?.data
  const roster = latestRoster?.t === 'game_state' ? latestRoster.roster ?? [] : []
  const agentName = (id?: string) => config?.agents.find((agent) => agent.id === id)?.name ?? roster.find((player) => player.id === id)?.name ?? id ?? '系统组件'
  const sections: ReportSection[] = [...concise.sections]

  if (compile?.steps.length) {
    sections.push(section('full-compile', '场景编译完整记录', compile.steps.map((step) => text(
      `Step ${step.step} · ${step.name}\n${step.detail}\nToken：${step.tokens}`,
    ))))
  }

  if (config?.agents.length) {
    sections.push(section('full-agent-contracts', 'Agent 完整角色配置', config.agents.map((agent) => text(
      `${agent.name} · ${agent.archetype}\n关系：${agent.relationship}\n初始立场：${agent.stance}\n核心利益：${values(agent.interests)}\n允许表达：${values(agent.can_say)}\n发言边界：${values(agent.cannot_say)}\n能力：${values(agent.capabilities)}\nSOP：${values(agent.sop)}`,
    ))))
  }

  for (const [blockIndex, block] of state.blocks.entries()) {
    if (block.kind !== 'phase' || block.phase.id === 'exam') continue
    const items: ReportItem[] = []
    for (const phaseItem of block.phase.items) {
      const event = phaseItem.data
      switch (event.t) {
        case 'agent_start':
          items.push(text(`调度 ${event.name}（${event.archetype}）\n上下文模式：${event.context_mode}`))
          break
        case 'speech':
          items.push({ kind: 'text', label: `${event.name}（${event.audience}）`, text: event.content })
          break
        case 'artifact': {
          const content = artifactText(event.artifact, agentName)
          if (content) items.push({ kind: 'text', label: `${agentName(event.agent_id)} · ${event.artifact.kind}`, text: content })
          break
        }
        case 'fishbowl_plan':
          items.push(text(`Fishbowl 第 ${event.round} 轮\n内圈：${event.inner.map(agentName).join('、') || '无'}\n外圈：${event.outer.map(agentName).join('、') || '无'}\n调度理由：${event.reason}`))
          break
        case 'retry':
          items.push(text(`重试第 ${event.attempt} 次：${event.reason}`, 'warning'))
          break
        case 'game_event':
          if (event.event.kind === 'GameSpeech') {
            items.push({ kind: 'text', label: `${agentName(event.event.agent_id)} · ${event.event.audience === 'private' ? '私密发言' : '公开发言'}`, text: `第 ${event.event.round} 轮 / ${event.event.phase_label}\n${event.event.content}` })
          } else {
            items.push({ kind: 'text', label: `${agentName(event.event.actor)} · ${event.event.action_label}`, text: `第 ${event.event.round} 轮 / ${event.event.phase_label}\n目标：${event.event.target ? agentName(event.event.target) : '无'}\n结果：${event.event.result}` })
          }
          break
        case 'game_state':
          items.push(text(`阶段状态：${event.phase}\n存活：${event.alive.map(agentName).join('、') || '无'}\n出局：${event.dead.map(agentName).join('、') || '无'}${event.roster?.length ? `\n角色表：${event.roster.map((player) => `${player.name}=${player.role_label || player.role}`).join('；')}` : ''}`))
          break
        case 'vote':
          items.push(text(`投票明细：\n${event.votes.map((vote) => `${agentName(vote.agent_id)} → ${agentName(vote.vote)}：${vote.reason}`).join('\n')}\n结果：${event.result}`))
          break
        case 'game_result':
          items.push(text(`胜负结果：${event.result.winner_team === 'draw' ? '平局' : `${event.result.winner_label}获胜`}\n${event.result.description}\n获胜玩家：${event.result.winning_players.map(agentName).join('、') || '无'}\n失败玩家：${event.result.losing_players.map(agentName).join('、') || '无'}`))
          break
        case 'final_proposal':
          items.push({ kind: 'text', label: '最终方案完整内容', text: artifactText(event.proposal, agentName) })
          break
        case 'exam_frozen':
        case 'exam_result':
          break
      }
    }
    sections.push(section(`full-phase-${block.phase.id}-${blockIndex}`, `${block.phase.name} · 完整记录`, items.length ? items : [text('本阶段没有可公开导出的内容。')], `${block.phase.purpose} · ${block.phase.done ? '已完成' : '未完成'}`))
  }

  const adaptations = state.blocks.filter((block): block is Extract<RunState['blocks'][number], { kind: 'adaptation' }> => block.kind === 'adaptation')
  if (adaptations.length) {
    sections.push(section('full-adaptations', '运行时调整完整记录', adaptations.map((item) => text(
      `触发：${item.trigger}\n动作：${item.action}\n范围：${item.scope}`,
    ))))
  }

  if (state.checkpoints.length) {
    sections.push(section('full-checkpoints', '任务黑板检查点', state.checkpoints.map((checkpoint) => text(
      `#${checkpoint.sequence} · ${checkpoint.phase_id} · ${checkpoint.trigger}\n原始目标：${checkpoint.original_objective}\n当前焦点：${checkpoint.current_focus}\n已解决：${values(checkpoint.resolved_items)}\n未决事项：${values(checkpoint.open_items)}\n阻塞事项：${values(checkpoint.blocked_items)}\n已确认事实：${values(checkpoint.confirmed_facts)}\n未核验主张：${values(checkpoint.unverified_claims)}\n缺失证据：${values(checkpoint.missing_evidence)}\n少数意见：${values(checkpoint.minority_positions)}\n下一步：${values(checkpoint.next_required_actions)}\n漂移标记：${values(checkpoint.drift_flags)}\n门控决定：${checkpoint.checkpoint_decision}（${values(checkpoint.decision_reasons)}）`,
    ))))
  }

  if (state.eventEvaluations.length) {
    sections.push(section('full-event-rules', '事件规则评估', state.eventEvaluations.map((evaluation) => text(
      `${evaluation.rule_id} · ${evaluation.matched ? '已触发' : '未触发'}\n事件：${evaluation.event}\n原因：${evaluation.reason}\n动作：${values(evaluation.actions)}`,
    ))))
  }

  const publicInvocations = state.modelInvocations.filter((invocation) => invocation.phase_id !== 'exam')
  if (publicInvocations.length || state.runTrace.length) {
    sections.push(section('full-audit', '运行审计', [
      ...publicInvocations.map((invocation) => text(`${invocation.phase_id} · ${agentName(invocation.agent_id)} · ${invocation.model}\n状态：${invocation.result_status}；Token：${invocation.tokens}；耗时：${Math.round(invocation.latency_ms)} ms${invocation.error ? `\n错误：${invocation.error}` : ''}`)),
      ...state.runTrace.filter((entry) => entry.phase_id !== 'exam').map((entry) => text(`${entry.phase_id} · ${entry.state}\n转移原因：${entry.transition_reason}\n输入引用：${values(entry.input_refs)}\n输出引用：${values(entry.output_refs)}`)),
    ]))
  }

  return {
    meta: { ...concise.meta, title: '完整议事报告' },
    sections,
  }
}

export async function exportReportAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const pdf = await renderReportPdf(element)
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '-')
  pdf.save(`${safeName}.pdf`)
}

export async function printReportAsPdf(element: HTMLElement): Promise<void> {
  const pdf = await renderReportPdf(element)
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl') as unknown as string
  window.open(blobUrl, '_blank')
}

const PDF_TARGET_BYTES = 20 * 1024 * 1024
const PDF_RENDER_PRESETS = [
  { scale: 1.5, quality: 0.82 },
  { scale: 1.2, quality: 0.68 },
  { scale: 1, quality: 0.55 },
] as const

function cropCanvasPage(
  source: HTMLCanvasElement,
  offsetY: number,
  height: number,
): HTMLCanvasElement {
  const page = document.createElement('canvas')
  page.width = source.width
  page.height = height
  const context = page.getContext('2d')
  if (!context) throw new Error('无法创建 PDF 页面画布')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, page.width, page.height)
  context.drawImage(
    source,
    0,
    offsetY,
    source.width,
    height,
    0,
    0,
    source.width,
    height,
  )
  return page
}

async function renderReportPdf(element: HTMLElement): Promise<jsPDF> {
  let smallestPdf: jsPDF | null = null
  let smallestSize = Number.POSITIVE_INFINITY

  for (const preset of PDF_RENDER_PRESETS) {
    const pdf = await renderReportPdfWithPreset(element, preset)
    const size = pdf.output('arraybuffer').byteLength
    if (size < smallestSize) {
      smallestPdf = pdf
      smallestSize = size
    }
    if (size <= PDF_TARGET_BYTES) return pdf
  }
  return smallestPdf ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
}

async function renderReportPdfWithPreset(
  element: HTMLElement,
  preset: { scale: number; quality: number },
): Promise<jsPDF> {
  // JPEG 对白底文本报告远小于无损 PNG，同时使用中等 DPI，避免上百页完整报告被嵌入成几十 MB 图片。
  const renderScale = preset.scale
  const jpegQuality = preset.quality

  // 克隆到离屏容器，避免模态框的 fixed 定位与滚动容器干扰 html2canvas 渲染。
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-10000px'
  wrapper.style.top = '0'
  wrapper.style.width = '794px'
  wrapper.style.backgroundColor = '#ffffff'
  wrapper.style.padding = '24px'
  wrapper.style.zIndex = '-1'
  wrapper.appendChild(element.cloneNode(true))
  document.body.appendChild(wrapper)

  try {
    const pageWidth = 210
    const pageHeight = 297
    const margin = 10
    const contentWidth = pageWidth - margin * 2
    const contentHeight = pageHeight - margin * 2
    const blocks = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-report-block]'))
    if (blocks.length === 0) blocks.push(wrapper)

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    let y = margin

    for (const block of blocks) {
      // 每个块放入固定宽度的独立容器渲染，保证文字在相同宽度下换行，不会被父容器或滚动区裁剪。
      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.left = '-10000px'
      container.style.top = '0'
      container.style.width = '746px'
      container.style.backgroundColor = '#ffffff'
      container.style.zIndex = '-1'
      container.style.boxSizing = 'border-box'
      container.style.padding = '4px 0 8px'
      container.setAttribute('data-export-container', 'true')
      const clone = block.cloneNode(true) as HTMLElement
      clone.style.margin = '0'
      clone.style.width = '100%'
      container.appendChild(clone)
      document.body.appendChild(container)

      let canvas: HTMLCanvasElement
      try {
        canvas = await html2canvas(container, {
          scale: renderScale,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: (clonedDocument) => {
            const exportedContainer = clonedDocument.querySelector('[data-export-container]')
            exportedContainer?.querySelectorAll('*').forEach((node) => {
              if (node instanceof HTMLElement) {
                node.style.lineHeight = '1.5'
                node.style.wordBreak = 'break-word'
              }
            })
          },
        })
      } finally {
        document.body.removeChild(container)
      }
      const imageHeight = (canvas.height * contentWidth) / canvas.width
      if (imageHeight > contentHeight) {
        // 长块只把当前页范围裁出来，避免整张长图在每个分页重复嵌入。
        const pagePixelHeight = Math.max(1, Math.floor((contentHeight * canvas.width) / contentWidth))
        let offsetY = 0
        let firstPage = true
        while (offsetY < canvas.height) {
          const sliceHeight = Math.min(pagePixelHeight, canvas.height - offsetY)
          const slice = cropCanvasPage(canvas, offsetY, sliceHeight)
          const sliceData = slice.toDataURL('image/jpeg', jpegQuality)
          const slicePdfHeight = (sliceHeight * contentWidth) / canvas.width
          if (!firstPage) pdf.addPage()
          pdf.addImage(sliceData, 'JPEG', margin, margin, contentWidth, slicePdfHeight, undefined, 'FAST')
          firstPage = false
          offsetY += sliceHeight
        }
        y = margin
        pdf.addPage()
        continue
      }
      const imageData = canvas.toDataURL('image/jpeg', jpegQuality)
      if (y + imageHeight > pageHeight - margin) {
        pdf.addPage()
        y = margin
      }
      pdf.addImage(imageData, 'JPEG', margin, y, contentWidth, imageHeight, undefined, 'FAST')
      y += imageHeight + 2
    }
    return pdf
  } finally {
    document.body.removeChild(wrapper)
  }
}
