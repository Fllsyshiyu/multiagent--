import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { RunState } from '../hooks/useRunEngine'
import type { EngineEvent } from '../engine/types'
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
  const titleMap: Record<ReportMeta['category'], string> = {
    single: '单 Agent 回答报告',
    collaborative: '多智能体议事报告',
    competitive: '博弈对局报告',
    unknown: 'MA-Collab 运行报告',
  }

  const meta: ReportMeta = {
    title: titleMap[category],
    issue: profile?.reasoning ? profile.reasoning : config?.user_input ?? state.blocks.find((block) => block.kind === 'dispatch') ? '见事件流' : '',
    category,
    categoryLabel: categoryLabels[category],
    terminalState: state.terminalState ?? state.status.toUpperCase(),
    generatedAt: new Date().toLocaleString('zh-CN'),
    tokens: state.ledger.total_tokens,
    calls: state.ledger.calls,
    agentCount: profile?.agent_count ?? config?.agents.length ?? 0,
  }
  meta.issue = config?.user_input ?? profile?.reasoning ?? ''

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

    if (state.examResult) {
      const exam = state.examResult
      sections.push(section('exam', '议事质量评估', [
        {
          kind: 'status',
          label: '红线门',
          text: exam.red_line_gate.toUpperCase(),
          tone: exam.red_line_gate === 'pass' ? 'success' : 'danger',
        },
        metric('客观题', `${exam.objective_total} / 40`),
        metric('主观题', `${exam.subjective_total} / 60`),
        metric('总分', `${exam.total} / 100`),
        text(exam.grade_comment || ''),
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

    const gameEvents: ReportItem[] = []
    const votes: string[] = []
    for (const phase of state.blocks) {
      if (phase.kind !== 'phase') continue
      for (const item of phase.phase.items) {
        if (item.kind === 'game_event' && item.data.t === 'game_event') {
          const event = item.data.event
          if (event.kind === 'GameAction') {
            gameEvents.push(text(`${event.action_label}：${event.result}`))
          } else if (event.kind === 'GameSpeech') {
            gameEvents.push(text(`${event.phase_label} · ${event.audience === 'private' ? '私密发言' : '公开发言'}：${event.content}`))
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

export async function exportReportAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })
  const imageData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = 210
  const pageHeight = 297
  const margin = 10
  const contentWidth = pageWidth - margin * 2
  const contentHeight = pageHeight - margin * 2
  const imageHeight = (canvas.height * contentWidth) / canvas.width

  let heightLeft = imageHeight
  let position = 0
  pdf.addImage(imageData, 'PNG', margin, margin + position, contentWidth, imageHeight)
  heightLeft -= contentHeight
  while (heightLeft > 0) {
    position -= contentHeight
    pdf.addPage()
    pdf.addImage(imageData, 'PNG', margin, margin + position, contentWidth, imageHeight)
    heightLeft -= contentHeight
  }
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '-')
  pdf.save(`${safeName}.pdf`)
}
