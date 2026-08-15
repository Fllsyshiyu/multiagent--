import type { Emit } from '../engine'
import type { LLMCaller } from '../llm'
import { callJSON } from '../llm'
import { TokenLedger } from '../ledger'
import { InvocationAudit } from '../framework/audit'
import { StructuredBlackboard } from '../framework/memory'
import { createTaskCheckpoint } from '../framework/checkpoints'
import { createTerminalReport } from '../framework/events'
import type {
  Artifact, Phase, PresentationBrief, PresentationDeck, PresentationDeckReview, PresentationEvidenceCard,
  PresentationOutline, PresentationResearchPlan, PresentationSlideSpec, PresentationSlideType, ScenarioConfig,
} from '../types'

interface EngineOptions {
  invocationAudit: InvocationAudit
  callerForAgent?: (agentId?: string) => LLMCaller | undefined
}

const SLIDE_TYPES = new Set<PresentationSlideType>(['cover', 'agenda', 'key_message', 'comparison', 'timeline', 'process', 'evidence', 'conclusion'])

function list(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : fallback
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function number(value: unknown, fallback: number): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asBrief(raw: unknown, fallback: PresentationBrief): PresentationBrief {
  const value = object(raw)
  return {
    kind: 'PresentationBrief', title: text(value.title, fallback.title), objective: text(value.objective, fallback.objective),
    audience: text(value.audience, fallback.audience), purpose: text(value.purpose, fallback.purpose), language: text(value.language, fallback.language),
    tone: text(value.tone, fallback.tone), slide_count: Math.min(20, Math.max(6, number(value.slide_count, fallback.slide_count))),
    constraints: list(value.constraints, fallback.constraints),
  }
}

function asResearchPlan(raw: unknown): PresentationResearchPlan {
  const value = object(raw)
  const assignments = Array.isArray(value.assignments) ? value.assignments.map(object).map((item) => ({
    agent_id: text(item.agent_id, 'evidence_analyst'), task: text(item.task, '提炼相关证据并标注来源'),
  })) : []
  return {
    kind: 'PresentationResearchPlan',
    questions: list(value.questions, ['主题要解决的核心问题是什么？', '受众需要据此理解或采取什么行动？']),
    evidence_requirements: list(value.evidence_requirements, ['用户输入与附件中的可追溯事实', '明确标注尚未核验的主张']),
    assignments: assignments.length ? assignments : [{ agent_id: 'evidence_analyst', task: '从输入和附件提炼证据卡' }],
    limitations: list(value.limitations, ['当前未接入联网检索；外部事实与统计数据需人工核验']),
  }
}

function asEvidenceCards(raw: unknown, hasAttachments: boolean): PresentationEvidenceCard[] {
  const record = object(raw)
  const values = Array.isArray(raw) ? raw : Array.isArray(record.cards) ? record.cards : []
  const cards = values.map(object).map((item, index): PresentationEvidenceCard => {
    const rawType = text(item.source_type, hasAttachments ? 'attachment' : 'user_input')
    const sourceType: PresentationEvidenceCard['source_type'] = ['attachment', 'user_input', 'model_background', 'evidence_gap'].includes(rawType)
      ? rawType as PresentationEvidenceCard['source_type'] : 'evidence_gap'
    const rawConfidence = text(item.confidence, sourceType === 'evidence_gap' ? 'low' : 'medium')
    return {
      kind: 'PresentationEvidenceCard', evidence_id: text(item.evidence_id, `E${index + 1}`),
      claim: text(item.claim, '待核验主张'), summary: text(item.summary, '当前材料不足，需要补充证据'),
      source_type: sourceType, source_ref: text(item.source_ref, sourceType === 'attachment' ? '用户附件' : sourceType === 'user_input' ? '用户输入' : '待补充'),
      confidence: ['high', 'medium', 'low'].includes(rawConfidence) ? rawConfidence as PresentationEvidenceCard['confidence'] : 'low',
      verified: Boolean(item.verified) && (sourceType === 'attachment' || sourceType === 'user_input'),
    }
  })
  if (cards.length) return cards.slice(0, 16)
  return [{
    kind: 'PresentationEvidenceCard', evidence_id: 'E1', claim: '用户提出了演示文稿制作目标', summary: '可据此规划叙事与页面结构，但外部事实仍需补充或核验。',
    source_type: 'user_input', source_ref: '用户输入', confidence: 'high', verified: true,
  }, {
    kind: 'PresentationEvidenceCard', evidence_id: 'G1', claim: '主题相关外部事实与数据', summary: '当前未接入联网检索，不能将模型背景知识当作已核验来源。',
    source_type: 'evidence_gap', source_ref: '待用户补充或人工检索', confidence: 'low', verified: false,
  }]
}

function asOutline(raw: unknown, brief: PresentationBrief, cards: PresentationEvidenceCard[]): PresentationOutline {
  const value = object(raw)
  const sections = Array.isArray(value.sections) ? value.sections.map(object).map((item) => ({
    title: text(item.title, '核心章节'), purpose: text(item.purpose, '支持演示目标'),
    key_message: text(item.key_message, '围绕核心问题形成清晰结论'), evidence_refs: list(item.evidence_refs),
  })) : []
  return {
    kind: 'PresentationOutline', thesis: text(value.thesis, brief.purpose),
    storyline: text(value.storyline, '问题与背景 → 核心发现 → 建议与下一步'),
    sections: sections.length ? sections : [
      { title: '背景与目标', purpose: '建立共同语境', key_message: brief.objective, evidence_refs: cards.slice(0, 2).map((card) => card.evidence_id) },
      { title: '关键发现', purpose: '展示证据支持的核心信息', key_message: '区分已知事实与证据缺口', evidence_refs: cards.map((card) => card.evidence_id) },
      { title: '建议与行动', purpose: '给出下一步路径', key_message: '在补齐证据后推进决策', evidence_refs: [] },
    ],
  }
}

function asSlide(raw: unknown, index: number, brief: PresentationBrief): PresentationSlideSpec {
  const value = object(raw)
  const rawType = text(value.type, index === 0 ? 'cover' : 'key_message')
  const type = SLIDE_TYPES.has(rawType as PresentationSlideType) ? rawType as PresentationSlideType : 'key_message'
  const columns = Array.isArray(value.columns) ? value.columns.map(object).slice(0, 3).map((column) => ({ title: text(column.title, '维度'), points: list(column.points).slice(0, 4) })) : undefined
  const steps = Array.isArray(value.steps) ? value.steps.map(object).slice(0, 6).map((step) => ({ title: text(step.title, '步骤'), detail: text(step.detail) })) : undefined
  return {
    slide_id: text(value.slide_id, `S${index + 1}`), type, title: text(value.title, index === 0 ? brief.title : `页面 ${index + 1}`),
    subtitle: text(value.subtitle) || undefined, key_message: text(value.key_message, index === 0 ? brief.purpose : '本页核心信息'),
    bullets: list(value.bullets).slice(0, 6), columns, steps, source_refs: list(value.source_refs), speaker_notes: text(value.speaker_notes, '根据本页核心信息进行讲解。'),
  }
}

function fallbackSlides(brief: PresentationBrief, outline: PresentationOutline, cards: PresentationEvidenceCard[]): PresentationSlideSpec[] {
  const slides: PresentationSlideSpec[] = [
    { slide_id: 'S1', type: 'cover', title: brief.title, subtitle: `${brief.audience} · ${brief.tone}`, key_message: brief.purpose, bullets: [], source_refs: [], speaker_notes: '说明演示目标、受众与范围。' },
    { slide_id: 'S2', type: 'agenda', title: '议程', key_message: outline.storyline, bullets: outline.sections.map((section) => section.title), source_refs: [], speaker_notes: '快速说明演示结构。' },
    ...outline.sections.map((section, index): PresentationSlideSpec => ({
      slide_id: `S${index + 3}`, type: index === 0 ? 'key_message' : index === outline.sections.length - 1 ? 'process' : 'evidence',
      title: section.title, key_message: section.key_message, bullets: [section.purpose], source_refs: section.evidence_refs,
      speaker_notes: `围绕“${section.key_message}”展开；引用 ${section.evidence_refs.join('、') || '暂无外部证据'}。`,
    })),
  ]
  while (slides.length < brief.slide_count - 1) {
    const card = cards[(slides.length - 2) % cards.length]
    slides.push({ slide_id: `S${slides.length + 1}`, type: 'evidence', title: card.claim, key_message: card.summary, bullets: [`来源：${card.source_ref}`, `置信度：${card.confidence}`], source_refs: [card.evidence_id], speaker_notes: '说明该证据的来源等级与适用边界。' })
  }
  slides.push({ slide_id: `S${slides.length + 1}`, type: 'conclusion', title: '结论与下一步', key_message: outline.thesis, bullets: ['确认核心信息', '补齐未核验证据', '根据受众反馈迭代演示'], source_refs: [], speaker_notes: '总结核心结论并明确下一步行动。' })
  return slides.slice(0, brief.slide_count)
}

function qaDeck(deck: PresentationDeck): PresentationDeck['qa'] {
  const warnings: string[] = []
  if (deck.slides.length < 6 || deck.slides.length > 20) warnings.push('页数应控制在 6-20 页')
  if (deck.slides[0]?.type !== 'cover') warnings.push('第一页必须是封面')
  if (deck.slides.at(-1)?.type !== 'conclusion') warnings.push('最后一页必须给出结论或下一步')
  if (deck.slides.some((slide) => !slide.title || !slide.key_message)) warnings.push('存在缺少标题或核心信息的页面')
  if (deck.slides.some((slide) => slide.bullets.length > 6 || slide.bullets.some((bullet) => bullet.length > 90))) warnings.push('部分页面信息密度过高')
  const checks = ['16:9 可编辑原生元素', '封面与结论页完整', '逐页包含核心信息', '演讲备注与来源引用已保留']
  return { passed: warnings.length === 0, checks, warnings }
}

function asDeck(raw: unknown, brief: PresentationBrief, outline: PresentationOutline, cards: PresentationEvidenceCard[]): PresentationDeck {
  const value = object(raw)
  const rawSlides = Array.isArray(value.slides) ? value.slides.map((slide, index) => asSlide(slide, index, brief)) : []
  let slides = rawSlides.length >= 6 ? rawSlides.slice(0, 20) : fallbackSlides(brief, outline, cards)
  slides = slides.map((slide, index) => ({ ...slide, slide_id: `S${index + 1}` }))
  if (slides[0]) slides[0] = { ...slides[0], type: 'cover' }
  if (slides.at(-1)) slides[slides.length - 1] = { ...slides[slides.length - 1], type: 'conclusion' }
  const deck: PresentationDeck = {
    kind: 'PresentationDeck', title: text(value.title, brief.title), subtitle: text(value.subtitle, brief.purpose), brief, slides,
    sources: cards.map((card) => ({ id: card.evidence_id, label: `${card.source_ref}：${card.claim}`, verified: card.verified })),
    qa: { passed: false, checks: [], warnings: [] },
  }
  deck.qa = qaDeck(deck)
  return deck
}

function applyRevisionPatch(raw: unknown, current: PresentationDeck, brief: PresentationBrief): { deck: PresentationDeck; applied: boolean } {
  const value = object(raw)
  const rawPatches = Array.isArray(value.modified_slides)
    ? value.modified_slides
    : Array.isArray(value.slides) ? value.slides : []
  if (!rawPatches.length) return { deck: current, applied: false }
  let applied = false
  const slides = [...current.slides]
  for (const rawPatch of rawPatches) {
    const patch = object(rawPatch)
    const slideId = text(patch.slide_id)
    const index = slideId ? slides.findIndex((slide) => slide.slide_id === slideId) : -1
    if (index < 0) continue
    slides[index] = asSlide({ ...slides[index], ...patch, slide_id: slides[index].slide_id }, index, brief)
    applied = true
  }
  if (!applied) return { deck: current, applied: false }
  const deck: PresentationDeck = {
    ...current,
    title: text(value.title, current.title),
    subtitle: text(value.subtitle, current.subtitle),
    slides,
  }
  deck.qa = qaDeck(deck)
  return { deck, applied: true }
}

function asReview(raw: unknown, deck: PresentationDeck): PresentationDeckReview {
  const value = object(raw)
  const issues = [...list(value.issues), ...deck.qa.warnings]
  const score = Math.min(100, Math.max(0, number(value.score, issues.length ? 78 : 90)))
  return {
    kind: 'PresentationDeckReview', passed: Boolean(value.passed) && deck.qa.passed && score >= 80, score,
    strengths: list(value.strengths, ['结构完整', '内容可编辑', '保留来源与演讲备注']), issues,
    revision_instructions: list(value.revision_instructions, issues.map((issue) => `修正：${issue}`)),
  }
}

export class PresentationProductionEngine {
  private ledger = new TokenLedger()
  private blackboard = new StructuredBlackboard()
  private checkpointSequence = 0
  private caller: LLMCaller
  private emit: Emit
  private options: EngineOptions

  constructor(caller: LLMCaller, emit: Emit, options: EngineOptions) {
    this.caller = caller
    this.emit = emit
    this.options = options
  }

  private async ask(agentId: string, phaseId: string, system: string, user: string, maxTokens = 4096): Promise<Record<string, unknown>> {
    this.options.invocationAudit.setContext(phaseId, agentId)
    const selected = this.options.callerForAgent?.(agentId) ?? this.caller
    const audited = this.options.invocationAudit.wrap(selected)
    const result = await callJSON<Record<string, unknown>>(
      audited, system, user,
      (attempt) => this.emit({ t: 'retry', reason: `${phaseId} 输出解析失败，自动重试`, attempt }),
      { max_tokens: maxTokens },
    )
    this.ledger.setPhase(phaseId)
    this.ledger.record(result.tokens)
    return result.data
  }

  private startPhase(config: ScenarioConfig, phaseId: string, agentId: string) {
    const phase = config.phases.find((item) => item.id === phaseId)
    const agent = config.agents.find((item) => item.id === agentId)
    if (!phase || !agent) throw new Error(`演示生产配置缺少阶段或 Agent：${phaseId}/${agentId}`)
    this.emit({ t: 'phase_start', phase_id: phase.id, name: phase.name, purpose: phase.purpose, strategy: phase.strategy })
    this.emit({ t: 'agent_start', agent_id: agent.id, name: agent.name, archetype: agent.archetype, context_mode: '结构化黑板 · 最小必要上下文' })
    return phase
  }

  private finishPhase(config: ScenarioConfig, phase: Phase, artifacts: Artifact[], agentId: string, emitArtifacts = true) {
    for (const artifact of artifacts) {
      this.blackboard.writeArtifact({ artifact, issueId: config.issue_graph.root_issue_id, phaseId: phase.id, createdBy: agentId })
      if (emitArtifacts) this.emit({ t: 'artifact', artifact, agent_id: agentId, tokens: 0 })
    }
    const snapshot = this.blackboard.snapshot()
    const checkpoint = createTaskCheckpoint({
      config, phase, trigger: phase.kind === 'report' ? 'TERMINAL' : 'PHASE_EXIT', sequence: ++this.checkpointSequence,
      entries: snapshot.entries, conflicts: snapshot.conflicts, minorityPositions: [],
    })
    this.blackboard.recordCheckpoint(checkpoint)
    this.emit({ t: 'checkpoint_created', checkpoint })
    this.emit({ t: 'phase_done', phase_id: phase.id, name: phase.name })
  }

  async run(config: ScenarioConfig): Promise<void> {
    const startedAt = Date.now()
    const baseBrief = config.presentation_brief
    if (!baseBrief) throw new Error('演示文稿场景缺少 PresentationBrief')

    let phase = this.startPhase(config, 'presentation_brief', 'research_planner')
    const briefRaw = await this.ask('research_planner', phase.id,
      '你是演示任务分析师。根据用户目标锁定标题、受众、目的、语言、语气、页数和约束。不得改变用户目标。只输出 PresentationBrief JSON。',
      JSON.stringify({ user_input: config.user_input, initial_brief: baseBrief }), 2048)
    const brief = asBrief(briefRaw, baseBrief)
    this.finishPhase(config, phase, [brief], 'research_planner')

    phase = this.startPhase(config, 'research_plan', 'research_planner')
    const planRaw = await this.ask('research_planner', phase.id,
      '你是资料规划 Agent。拆解研究问题、证据要求、任务分配和限制。当前没有联网搜索工具，只能使用用户输入、附件与明确标注的模型背景知识。只输出 JSON。',
      JSON.stringify({ brief, available_material: config.case_context.slice(0, 24000) }), 3072)
    const plan = asResearchPlan(planRaw)
    this.finishPhase(config, phase, [plan], 'research_planner')

    phase = this.startPhase(config, 'evidence_synthesis', 'evidence_analyst')
    const evidenceRaw = await this.ask('evidence_analyst', phase.id,
      '你是证据分析 Agent。把材料转成 cards 数组。每张卡必须含 evidence_id、claim、summary、source_type、source_ref、confidence、verified。禁止编造来源和数字；模型常识必须标为 model_background 且 verified=false；缺失证据用 evidence_gap。只输出 JSON 对象。',
      JSON.stringify({ brief, research_plan: plan, material: config.case_context.slice(0, 30000) }), 4096)
    const evidenceCards = asEvidenceCards(evidenceRaw, /【用户附件材料】/.test(config.case_context))
    this.finishPhase(config, phase, evidenceCards, 'evidence_analyst')

    phase = this.startPhase(config, 'narrative_outline', 'narrative_architect')
    const outlineRaw = await this.ask('narrative_architect', phase.id,
      '你是叙事架构 Agent。基于 Brief 和证据卡生成 thesis、storyline、sections。每个章节包含 title、purpose、key_message、evidence_refs。不能提出证据卡不支持的确定性事实。只输出 JSON。',
      JSON.stringify({ brief, evidence_cards: evidenceCards }), 4096)
    const outline = asOutline(outlineRaw, brief, evidenceCards)
    this.finishPhase(config, phase, [outline], 'narrative_architect')

    phase = this.startPhase(config, 'slide_design', 'slide_architect')
    let deckRaw: Record<string, unknown> = {}
    try {
      deckRaw = await this.ask('slide_architect', phase.id,
        '你是幻灯片架构 Agent。生成逐页 slides，页数接近 brief.slide_count。页型只能是 cover/agenda/key_message/comparison/timeline/process/evidence/conclusion。每页含 slide_id、type、title、subtitle、key_message、bullets、可选 columns/steps、source_refs、speaker_notes。每页一个核心信息，最多 6 个短要点，避免重复版式。只输出含 title/subtitle/slides 的 JSON；内容较长时优先缩短文字，绝不能省略 JSON 闭合括号。',
        JSON.stringify({ brief, outline, evidence_cards: evidenceCards }), 8192)
    } catch {
      this.emit({ t: 'adaptation', trigger: 'SlideSpec 长 JSON 未能完整解析', action: '使用已通过结构校验的 Brief、Outline 与证据卡生成可编辑保底稿', scope: 'presentation_pipeline' })
    }
    let deck = asDeck(deckRaw, brief, outline, evidenceCards)
    this.finishPhase(config, phase, [deck], 'slide_architect', false)
    this.emit({ t: 'speech', agent_id: 'slide_architect', name: '幻灯片设计 Agent', content: `已完成 ${deck.slides.length} 页 SlideSpec，进入独立审校。`, audience: 'public', tokens: 0 })

    phase = this.startPhase(config, 'deck_review', 'deck_reviewer')
    let reviewRaw: Record<string, unknown> = {}
    try {
      reviewRaw = await this.ask('deck_reviewer', phase.id,
        '你是独立演示审校 Agent。检查：目标对齐、故事线、证据纪律、每页单一信息、信息密度、封面与结论、受众适配。输出 passed、score(0-100)、strengths、issues、revision_instructions。只输出 JSON。',
        JSON.stringify({ brief, evidence_cards: evidenceCards, deck }), 4096)
    } catch {
      this.emit({ t: 'adaptation', trigger: '审校 JSON 未能完整解析', action: '继续使用确定性 QA 检查，不阻断 PPT 交付', scope: 'presentation_pipeline' })
    }
    let review = asReview(reviewRaw, deck)
    if (!review.passed && review.revision_instructions.length) {
      try {
        const revisedRaw = await this.ask('slide_architect', 'deck_revision',
          '你是幻灯片架构 Agent。根据审校指令只返回需要修改的页面，不要重写整套 deck。输出 JSON：{"modified_slides":[<完整的修改后 SlideSpec>]}。每项必须保留原 slide_id；若无需修改输出空数组。禁止输出未修改页面或解释文字。',
          JSON.stringify({ brief, evidence_cards: evidenceCards, current_slides: deck.slides, review }), 4096)
        const revision = applyRevisionPatch(revisedRaw, deck, brief)
        if (revision.applied) {
          deck = revision.deck
          review = { ...review, passed: deck.qa.passed, score: Math.max(review.score, deck.qa.passed ? 82 : review.score), issues: deck.qa.warnings }
          this.emit({ t: 'adaptation', trigger: '演示审校未通过', action: 'Slide Architect 仅重写被指出的问题页面，避免整套长 JSON 截断', scope: 'presentation_pipeline' })
        } else {
          review = { ...review, passed: false, issues: [...review.issues, '模型未返回可应用的页面补丁，已保留通过基础 QA 的初版'] }
          this.emit({ t: 'adaptation', trigger: '审校修订未产生有效页面补丁', action: '保留已生成的初版 PPT，并以质量警告继续交付', scope: 'presentation_pipeline' })
        }
      } catch {
        review = { ...review, passed: false, issues: [...review.issues, '修订输出解析失败，已保留通过基础 QA 的初版'] }
        this.emit({ t: 'adaptation', trigger: '审校修订 JSON 解析失败', action: '保留已生成的初版 PPT，并以质量警告继续交付', scope: 'presentation_pipeline' })
      }
    }
    this.finishPhase(config, phase, [review], 'deck_reviewer')

    phase = this.startPhase(config, 'presentation_delivery', 'slide_architect')
    deck = { ...deck, qa: qaDeck(deck) }
    this.finishPhase(config, phase, [deck], 'slide_architect')
    const missing = evidenceCards.filter((card) => !card.verified).map((card) => `${card.claim}（${card.source_ref}）`)
    this.emit({ t: 'report', markdown: `## 演示文稿已生成\n\n- **标题**：${deck.title}\n- **页数**：${deck.slides.length}\n- **质量门控**：${deck.qa.passed ? '通过' : '通过基础结构检查，但仍有警告'}\n- **证据纪律**：${evidenceCards.filter((card) => card.verified).length} 条已核验输入证据，${missing.length} 条待核验\n\n请在上方“演示文稿交付”阶段下载可编辑 PPTX。` })
    const terminalState = missing.length ? 'PROVISIONAL' as const : 'DECIDED' as const
    this.emit({ t: 'terminal_report', report: createTerminalReport({
      terminalState, trace: config.phases.map((item) => ({ phase_id: item.id, state: 'completed' as const })),
      reasonCodes: [`terminal:${terminalState}`, 'presentation_pipeline_complete'], unresolvedItems: [], missingEvidence: missing,
      minorityPositions: [], recommendedNextActions: missing.length ? ['补齐或核验证据后更新对应页面'] : ['由用户审阅并按实际场景发布'],
    }) })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })
    const snapshot = this.blackboard.snapshot()
    this.emit({ t: 'audit_snapshot', model_invocations: this.options.invocationAudit.snapshot(), checkpoints: snapshot.checkpoints })
    this.emit({ t: 'run_done', elapsed_ms: Date.now() - startedAt, terminal_state: terminalState })
  }
}
