/**
 * OrchestrationEngine · 通用主循环（《优化框架》第六节）
 * 协作轨道实现 = v2.0 两阶段 Open-first Fishbowl：
 * 全员独立首发 → 方案归并 → 轻量评分 → 冲突分析 → 鱼缸两轮 → 修订方案 → 试卷阅卷 → 报告
 *
 * 引擎只认 Phase + StrategyCombo + 条件边，不认具体场景——新增场景无需改引擎
 */
import type {
  CandidateProposal, ConflictMap, EngineEvent, ExamResult, FinalProposal,
  ConflictRecord, EvidenceSubmission, FishbowlSummaryCard, ImpasseReport, InitialAssessmentCard, ObjectionCard, OuterObservationCard,
  PlanScoreCard, ScenarioConfig, SemanticAlignmentReview, SemanticReviewCandidate, TaskCheckpoint, TerminalReport,
} from './types'
import { callJSON, callValidatedJSON, type LLMCaller } from './llm'
import { asArray, asStringArray, pickObj } from './normalize'
import { TokenLedger } from './ledger'
import { Observer } from './observer'
import { StructuredBlackboard } from './framework/memory'
import { GraphExecutor, RunTrace, RuntimeGuards } from './framework/runtime'
import type { Phase, TerminalState } from './types'
import { finalProposalSchema, initialAssessmentSchema, objectionSchema } from './framework/schemas'
import { InvocationAudit } from './framework/audit'
import { createImpasseReport, createTerminalReport, EventRuleEngine } from './framework/events'
import { processNewEvidence } from './framework/evidence'
import { createTaskCheckpoint, isCheckpointPhase } from './framework/checkpoints'

export type Emit = (e: EngineEvent) => void

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class OrchestrationEngine {
  private ledger = new TokenLedger()
  private observer = new Observer()
  private emit: Emit
  private caller: LLMCaller
  private fast: boolean
  private blackboard = new StructuredBlackboard()
  private trace = new RunTrace()
  private currentPhaseId = 'compile'
  private currentIssueId = 'root_issue'
  private currentAgentId: string | undefined
  private invocationAudit: InvocationAudit
  private checkpointSequence = 0
  private semanticAlignmentReviewer?: (candidate: SemanticReviewCandidate) => Promise<SemanticAlignmentReview>

  /** 只读审计快照；当前不接 UI，供测试、导出或后续审计面板使用。 */
  getAuditSnapshot() {
    return {
      run_trace: this.trace.snapshot(),
      blackboard: this.blackboard.snapshot(),
      model_invocations: this.invocationAudit.snapshot(),
    }
  }

  /** 运行中或运行后接收新证据，并返回重开议题后的新配置。调用方可据此启动续跑。 */
  async submitEvidence(config: ScenarioConfig, evidence: EvidenceSubmission, affectedIssueIds: string[], decisionRelevant = true): Promise<ScenarioConfig> {
    const result = processNewEvidence({ config, blackboard: this.blackboard, evidence, affectedIssueIds, decisionRelevant })
    for (const evaluation of result.evaluations.filter((item) => item.matched)) this.emit({ t: 'event_rule_fired', evaluation })
    if (result.accepted) {
      this.emit({
        t: 'adaptation', trigger: `收到已核验的新证据：${evidence.claim}`,
        action: `重开议题 ${result.recompile.reopened_issue_ids.join('、')}；插入核验阶段 ${result.recompile.inserted_phase_ids.join('、')}；废止 ${result.invalidated_entry_ids.length} 个下游工件`,
        scope: '动态重编译后的续跑配置',
      })
      const evidencePhase = result.config.phase_graph.phases.find((phase) => result.recompile.inserted_phase_ids.includes(phase.id))
      if (evidencePhase) await this.createCheckpoint(result.config, evidencePhase, 'NEW_EVIDENCE', [])
    }
    return result.config
  }

  constructor(caller: LLMCaller, emit: Emit, opts?: {
    fast?: boolean
    invocationAudit?: InvocationAudit
    callerAlreadyAudited?: boolean
    callerForAgent?: (agentId?: string) => LLMCaller | undefined
    semanticAlignmentReviewer?: (candidate: SemanticReviewCandidate) => Promise<SemanticAlignmentReview>
  }) {
    this.invocationAudit = opts?.invocationAudit ?? new InvocationAudit()
    const routedCaller: LLMCaller = (system, user, callOptions) =>
      (opts?.callerForAgent?.(this.currentAgentId) ?? caller)(system, user, callOptions)
    this.caller = opts?.callerAlreadyAudited ? routedCaller : this.invocationAudit.wrap(routedCaller)
    this.emit = (event) => {
      if (event.t === 'agent_start') {
        this.currentAgentId = event.agent_id
        this.invocationAudit.setContext(this.currentPhaseId, this.currentAgentId)
      }
      if (event.t === 'artifact') {
        this.blackboard.writeArtifact({
          artifact: event.artifact,
          issueId: this.currentIssueId,
          phaseId: this.currentPhaseId,
          createdBy: event.agent_id ?? 'system_component',
          visibility: ['public'],
        })
      }
      emit(event)
    }
    this.fast = opts?.fast ?? false
    this.semanticAlignmentReviewer = opts?.semanticAlignmentReviewer
  }

  private async paced(ms = 350) {
    if (!this.fast) await sleep(ms)
  }

  // ============ 协作轨道主入口 ============
  async runCollaborative(config: ScenarioConfig): Promise<void> {
    const start = Date.now()
    this.currentIssueId = config.issue_graph.root_issue_id
    const ctx: RunContext = {
      config,
      firstRoundCards: [],
      proposals: [],
      scoreCards: [],
      conflictMap: null,
      innerR1: [],
      innerR2: [],
      objections: [],
      outerCards: [],
      summaries: [],
      finalProposal: null,
      examResult: null,
      adaptationFired: false,
      minorityKeptCounted: false,
      conflictRoutes: [],
      deliberationRounds: 0,
      evidenceCountAtConflict: 0,
      impasseReport: null,
      deadlineEventFired: false,
    }

    const executor = new GraphExecutor(config.phase_graph, this.trace, new RuntimeGuards(config.guards))
    const compilePhase: Phase = {
      id: 'compile', name: '场景编译检查点', purpose: '冻结原始目标、子议题、硬约束和成功标准',
      policy: { A: 'A3', B: 'B2', C: 'C1', D: 'D2', E: 'E1' },
      strategy: { A: ['A3'], B: 'B2', C: 'C1', D: 'D2', E: ['E1'], notes: [] }, modifiers: [],
      protocol_id: 'structured_synthesis_v1', kind: 'aggregate', config: {}, depends_on: [], required: true,
      skippable_on_deadline: false, entry_conditions: ['scenario_compiled'], exit_conditions: ['checkpoint_created'], transitions: [],
    }
    await this.createCheckpoint(config, compilePhase, 'COMPILE', [])
    const terminal = await executor.run(
      async (phase, softLimit) => this.executePhase(config, ctx, phase, softLimit),
      () => ({ tokens: this.ledger.total, calls: this.ledger.calls, elapsedMs: Date.now() - start }),
    )
    const terminalReport = this.finalizeTerminalReport(config, ctx, terminal)
    this.blackboard.writeRecord({
      register: 'decisions', issueId: config.issue_graph.root_issue_id, phaseId: this.currentPhaseId,
      payload: terminalReport, createdBy: 'terminal_state_machine', sourceRefs: terminalReport.source_refs,
      visibility: ['public', 'audit'],
    })
    this.emit({ t: 'terminal_report', report: terminalReport })
    const terminalPhase = config.phase_graph.phases.find((phase) => phase.id === this.currentPhaseId) ?? compilePhase
    await this.createCheckpoint(config, terminalPhase, 'TERMINAL', this.collectMinority(ctx))
    this.emit({ t: 'audit_snapshot', model_invocations: this.invocationAudit.snapshot(), run_trace: this.trace.snapshot(), checkpoints: this.blackboard.snapshot().checkpoints })
    this.emit({ t: 'run_done', elapsed_ms: Date.now() - start, terminal_state: terminal })
  }

  private async executePhase(config: ScenarioConfig, ctx: RunContext, phase: Phase, softLimit: boolean) {
    this.currentPhaseId = phase.id
    this.currentAgentId = undefined
    this.invocationAudit.setContext(phase.id)
    this.ledger.setPhase(phase.id)
    this.emit({ t: 'phase_start', phase_id: phase.id, name: phase.name, purpose: phase.purpose, strategy: phase.strategy })
    if (softLimit) {
      this.emit({ t: 'adaptation', trigger: '运行预算达到软截止', action: '不再开启可选分支，保留最终校验和报告预算', scope: '后续阶段' })
      if (!ctx.deadlineEventFired) {
        ctx.deadlineEventFired = true
        const deadlineEvaluations = new EventRuleEngine(config.event_rules).evaluate('soft_or_hard_deadline', {
          conflicts: this.blackboard.snapshot().conflicts, lowChange: false, highResidualDisagreement: false,
          noNewEvidence: false, retryLimitReached: false, authorityRequired: config.guards.human_authority_required,
          deadlineReached: true,
        })
        for (const evaluation of deadlineEvaluations.filter((item) => item.matched)) this.emit({ t: 'event_rule_fired', evaluation })
      }
    }
    await this.paced()

    let eventTerminal: TerminalState | undefined
    switch (phase.kind) {
      case 'speak': await this.runFirstRound(config, ctx); break
      case 'aggregate': await this.runAggregate(config, ctx); break
      case 'score': await this.runScoring(config, ctx); break
      case 'analyze': await this.runConflict(config, ctx); break
      case 'fishbowl': {
        const round = phase.config.round as number
        await this.runFishbowl(config, ctx, round)
        ctx.deliberationRounds = Math.max(ctx.deliberationRounds, round)
        if (round >= 2) eventTerminal = this.evaluateImpasse(config, ctx)
        break
      }
      case 'propose': await this.runPropose(config, ctx); break
      case 'evaluate': await this.runExam(config, ctx); break
      case 'report': await this.runReport(config, ctx); break
    }
    // final_proposal / exam_result 使用独立事件，不经过 artifact 事件包装，需显式进入黑板。
    if (phase.kind === 'propose' && ctx.finalProposal) this.blackboard.writeArtifact({ artifact: ctx.finalProposal, issueId: config.issue_graph.root_issue_id, phaseId: phase.id, createdBy: '__proposer', visibility: ['public', 'audit'] })
    if (phase.kind === 'evaluate' && ctx.examResult) this.blackboard.writeArtifact({ artifact: ctx.examResult, issueId: config.issue_graph.root_issue_id, phaseId: phase.id, createdBy: '__examiner', visibility: ['public', 'audit'] })
    this.emit({ t: 'phase_done', phase_id: phase.id, name: phase.name })
    this.emit({ t: 'metrics', snapshot: this.observer.snapshot() })
    this.emit({ t: 'ledger', ...this.ledger.snapshot() })
    const outputRefs = this.blackboard.query({ issueId: config.issue_graph.root_issue_id }).filter((entry) => entry.phase_id === phase.id).map((entry) => entry.id)
    let terminal: TerminalState | undefined = eventTerminal
    if (!terminal && isCheckpointPhase(phase)) {
      const trigger = phase.kind === 'report' ? 'PRE_TERMINAL' : 'PHASE_EXIT'
      const checkpoint = await this.createCheckpoint(config, phase, trigger, this.collectMinority(ctx))
      terminal = this.checkpointTerminal(checkpoint)
      if (checkpoint.checkpoint_decision === 'RETRY_PHASE') {
        const hasRetryPath = phase.transitions.some((transition) => transition.target === phase.id && (transition.max_retries ?? 0) > 0)
          || Boolean(phase.failure_target)
        if (!hasRetryPath) terminal = 'PROVISIONAL'
      }
    }
    if (phase.kind === 'report' && !terminal) {
      terminal = this.determineReportTerminal(config, ctx)
    }
    const latestCheckpoint = this.blackboard.latestCheckpoint(config.issue_graph.root_issue_id)
    const condition = latestCheckpoint?.phase_id === phase.id && latestCheckpoint.checkpoint_decision === 'RETRY_PHASE'
      ? 'checkpoint_retry'
      : phase.policy.E === 'E2' && this.observer.hasConverged()
      ? 'converged'
      : phase.transitions.find((transition) => transition.condition === 'artifacts_valid')?.condition
        ?? phase.transitions[0]?.condition ?? phase.exit_conditions[0] ?? 'artifacts_valid'
    return { condition, terminal, outputRefs }
  }

  private async createCheckpoint(config: ScenarioConfig, phase: Phase, trigger: TaskCheckpoint['trigger'], minorityPositions: string[]): Promise<TaskCheckpoint> {
    const snapshot = this.blackboard.snapshot()
    const semanticReview = this.semanticAlignmentReviewer ? await this.semanticAlignmentReviewer({
      original_objective: config.scenario_spec.objective, current_focus: phase.purpose, phase_id: phase.id,
      phase_purpose: phase.purpose, open_items: config.issue_graph.issues.filter((issue) => issue.status !== 'resolved').map((issue) => issue.title),
      recent_artifacts: snapshot.entries.filter((entry) => entry.phase_id === phase.id && entry.status === 'valid').slice(-8).map((entry) => JSON.stringify(entry.payload).slice(0, 500)),
    }) : undefined
    const checkpoint = createTaskCheckpoint({
      config, phase, trigger, sequence: ++this.checkpointSequence,
      entries: snapshot.entries, conflicts: snapshot.conflicts, minorityPositions, semanticReview,
    })
    this.blackboard.recordCheckpoint(checkpoint)
    this.updateIssueStateFromCheckpoint(config, checkpoint)
    this.emit({ t: 'checkpoint_created', checkpoint })
    if (checkpoint.checkpoint_decision !== 'CONTINUE') {
      this.emit({
        t: 'adaptation', trigger: `任务检查点 ${checkpoint.id}：${checkpoint.drift_flags.join('、') || checkpoint.decision_reasons.join('、')}`,
        action: checkpoint.checkpoint_decision, scope: `${phase.id} → ${checkpoint.next_required_actions.join('、')}`,
      })
    }
    return checkpoint
  }

  private updateIssueStateFromCheckpoint(config: ScenarioConfig, checkpoint: TaskCheckpoint) {
    const resolved = new Set(checkpoint.resolved_items)
    const blocked = new Set(checkpoint.blocked_items)
    config.issue_graph.issues = config.issue_graph.issues.map((issue) => ({
      ...issue,
      status: blocked.has(issue.title) ? 'blocked' : resolved.has(issue.title) ? 'resolved' : issue.status,
    }))
  }

  private checkpointTerminal(checkpoint: TaskCheckpoint): TerminalState | undefined {
    if (checkpoint.checkpoint_decision === 'HUMAN_ESCALATION') return 'HUMAN_ESCALATION'
    if (checkpoint.checkpoint_decision === 'WAITING_FOR_EVIDENCE') return 'WAITING_FOR_EVIDENCE'
    if (checkpoint.checkpoint_decision === 'RECOMPILE') return 'PROVISIONAL'
    return undefined
  }

  private agentSop(agent: ScenarioConfig['agents'][number]): string {
    const sop = agent.sop ?? []
    return sop.length ? `\n你的专业 SOP（必须逐项执行并在输出前自检）：${sop.join(' → ')}。` : ''
  }

  private checkpointContext(issueId: string): string {
    const checkpoint = this.blackboard.latestCheckpoint(issueId)
    if (!checkpoint) return ''
    return `\n最新任务检查点（不得擅自改变目标）：原始目标=${checkpoint.original_objective}；当前焦点=${checkpoint.current_focus}；未决事项=${checkpoint.open_items.join('、') || '无'}；阻塞事项=${checkpoint.blocked_items.join('、') || '无'}；硬约束=${checkpoint.active_constraints.join('、')}；下一步=${checkpoint.next_required_actions.join('、') || '按当前阶段完成工件'}。`
  }

  private collectMinority(ctx: RunContext): string[] {
    return [...new Set([
      ...(ctx.conflictMap?.minority_opinions ?? []),
      ...ctx.summaries.flatMap((summary) => summary.minority_views ?? []),
    ].filter(Boolean))]
  }

  private determineReportTerminal(config: ScenarioConfig, ctx: RunContext): TerminalState {
    if (ctx.examResult?.red_line_gate !== 'pass') return 'HUMAN_ESCALATION'
    if (config.guards.human_authority_required) return 'HUMAN_ESCALATION'
    if (config.guards.mandatory_gates.includes('evidence_integrity') && (ctx.conflictMap?.evidence_gaps.length ?? 0) > 0) {
      return 'WAITING_FOR_EVIDENCE'
    }
    if (config.guards.minority_report_required && this.collectMinority(ctx).length < (ctx.conflictMap?.minority_opinions.length ?? 0)) {
      return 'PROVISIONAL'
    }
    return 'DECIDED'
  }

  private finalizeTerminalReport(config: ScenarioConfig, ctx: RunContext, terminal: TerminalState): TerminalReport {
    const unresolved = [...new Set([
      ...(ctx.conflictMap?.veto_risks ?? []),
      ...ctx.summaries.flatMap((summary) => [...(summary.core_conflicts ?? []), ...(summary.unanswered_questions ?? [])]),
    ].filter(Boolean))]
    const missingEvidence = [...new Set(ctx.conflictMap?.evidence_gaps ?? [])]
    const reasons = [
      `terminal:${terminal}`,
      ...(ctx.examResult?.red_line_gate && ctx.examResult.red_line_gate !== 'pass' ? [`red_line:${ctx.examResult.red_line_gate}`] : []),
      ...(config.guards.human_authority_required ? ['human_authority_required'] : []),
      ...(missingEvidence.length ? ['missing_evidence'] : []),
      ...(ctx.impasseReport ? [`impasse:${ctx.impasseReport.impasse_type}`] : []),
    ]
    const defaultActions: Record<TerminalState, string[]> = {
      DECIDED: ['按复评机制跟踪执行结果'],
      PROVISIONAL: ['补齐未完成校验后重新终结'],
      IMPASSE: ctx.impasseReport?.recommended_next_actions ?? ['由人类主持人选择后续解冲突程序'],
      WAITING_FOR_EVIDENCE: ['补齐缺失证据后重开受影响议题'],
      HUMAN_ESCALATION: ['由具有相应权限的人类主体复核并确认'],
      ABORTED: ['检查失败阶段与审计轨迹后重新运行'],
    }
    return createTerminalReport({
      terminalState: terminal, trace: this.trace.snapshot(), reasonCodes: reasons,
      unresolvedItems: unresolved, missingEvidence, minorityPositions: this.collectMinority(ctx),
      recommendedNextActions: defaultActions[terminal], impasseReport: ctx.impasseReport ?? undefined,
    })
  }

  private routeForConflict(type: ConflictRecord['conflict_type']): string {
    const routes = {
      fact: '事实冲突：先核验证据与来源，不用投票替代事实判断',
      interest: '利益冲突：要求受损方、受益方给出条件与补偿边界',
      value: '价值冲突：保留异议并寻找有限重叠共识',
      procedure: '程序冲突：交由治理/合规角色核查程序有效性',
      authority: '权限冲突：Agent 不作终局决定，标记人类升级',
      resource: '资源冲突：交由执行角色核查资源、工期和降级方案',
    }
    return routes[type]
  }

  private evaluateConflictEvents(config: ScenarioConfig, ctx: RunContext) {
    const conflicts = this.blackboard.snapshot().conflicts
    const evaluations = new EventRuleEngine(config.event_rules).evaluate('material_conflict_detected', {
      conflicts, lowChange: false, highResidualDisagreement: conflicts.some((conflict) => conflict.severity >= 0.7),
      noNewEvidence: false, retryLimitReached: false, authorityRequired: config.guards.human_authority_required,
    })
    for (const evaluation of evaluations.filter((item) => item.matched)) {
      this.emit({ t: 'event_rule_fired', evaluation })
      ctx.conflictRoutes = [...new Set(conflicts.map((conflict) => this.routeForConflict(conflict.conflict_type)))]
      this.emit({ t: 'adaptation', trigger: `事件规则 ${evaluation.rule_id}：检测到重大决策冲突`, action: ctx.conflictRoutes.join('；'), scope: '后续鱼缸轮次' })
    }
  }

  private evaluateImpasse(config: ScenarioConfig, ctx: RunContext): TerminalState | undefined {
    const conflicts = this.blackboard.snapshot().conflicts
    const roundOneRevisions = new Set(ctx.objections.filter((item) => item.round === 1).flatMap((item) => item.required_revision).map((item) => item.trim()).filter(Boolean))
    const roundTwoRevisions = ctx.objections.filter((item) => item.round === 2).flatMap((item) => item.required_revision).map((item) => item.trim()).filter(Boolean)
    const meaningfulNewRevision = roundTwoRevisions.some((revision) => !roundOneRevisions.has(revision))
    const roundOnePositions = new Map(ctx.objections.filter((item) => item.round === 1).map((item) => [item.agent_id, item.support_condition.trim()]))
    const meaningfulPositionChange = ctx.objections.filter((item) => item.round === 2)
      .some((item) => roundOnePositions.has(item.agent_id) && roundOnePositions.get(item.agent_id) !== item.support_condition.trim())
    const evidenceCount = this.blackboard.query({ registers: ['evidence'], issueId: config.issue_graph.root_issue_id }).length
    const highResidualDisagreement = conflicts.some((conflict) => conflict.decision_relevant && conflict.severity >= 0.7 && (conflict.resolution_status === 'open' || conflict.resolution_status === 'retained'))
      && ctx.summaries.some((summary) => (summary.core_conflicts?.length ?? 0) + (summary.unanswered_questions?.length ?? 0) > 0)
    const retryLimit = Math.max(1, ...config.event_rules.filter((rule) => rule.event === 'material_conflict_detected').map((rule) => rule.retry_limit))
    const evaluations = new EventRuleEngine(config.event_rules).evaluate('low_change_high_disagreement', {
      conflicts,
      lowChange: !meaningfulNewRevision && !meaningfulPositionChange && this.observer.hasLowChange(1, 0.2),
      highResidualDisagreement,
      noNewEvidence: evidenceCount <= ctx.evidenceCountAtConflict,
      retryLimitReached: ctx.deliberationRounds >= retryLimit,
      authorityRequired: config.guards.human_authority_required,
    })
    const matched = evaluations.find((evaluation) => evaluation.matched && evaluation.terminal_state === 'IMPASSE')
    if (!matched) return undefined
    this.emit({ t: 'event_rule_fired', evaluation: matched })
    const report = createImpasseReport({
      issueId: config.issue_graph.root_issue_id, conflicts,
      agreedItems: [...new Set(ctx.summaries.flatMap((summary) => summary.majority_views ?? []))],
      unresolvedClaims: [...new Set([...(ctx.conflictMap?.veto_risks ?? []), ...ctx.summaries.flatMap((summary) => summary.core_conflicts ?? [])])],
      minorityPositions: this.collectMinority(ctx), missingEvidence: [...new Set(ctx.conflictMap?.evidence_gaps ?? [])],
      attemptedResolutions: [...new Set(ctx.objections.flatMap((item) => item.required_revision))],
    })
    ctx.impasseReport = report
    this.blackboard.writeRecord({ register: 'decisions', issueId: config.issue_graph.root_issue_id, phaseId: this.currentPhaseId, payload: report, createdBy: 'impasse_detection_v1', sourceRefs: report.source_refs, visibility: ['public', 'audit'] })
    this.emit({ t: 'impasse_report', report })
    return 'IMPASSE'
  }

  // ---- 阶段1：全员独立首发（信息隔离，B3 角色约束路由） ----
  private async runFirstRound(config: ScenarioConfig, ctx: RunContext) {
    for (const agent of config.agents) {
      this.emit({ t: 'agent_start', agent_id: agent.id, name: agent.name, archetype: agent.archetype, context_mode: '信息隔离：仅 Case Context + 自身角色卡' })
      const { data, tokens } = await callValidatedJSON<InitialAssessmentCard>(
        this.caller,
        `你是「${agent.name}」，${agent.archetype}。与议题关系：${agent.relationship}。核心利益：${agent.interests.join('、')}。
你可以说：${agent.can_say.join('；')}。你不能说：${agent.cannot_say.join('；')}。
现在是全员独立首发阶段：你看不到其他任何 Agent 的发言，只基于自身立场独立表达，不要被想象中的多数意见带动。${this.agentSop(agent)}`,
        `议题：${config.user_input}${this.checkpointContext(config.issue_graph.root_issue_id)}
输出 Initial Assessment Card（JSON）：
{"kind":"InitialAssessmentCard","agent_id":"${agent.id}","initial_stance":"<支持/反对/条件支持/条件反对/中立>","main_concerns":["..."],"proposal_sketch":["..."],"non_negotiables":["..."],"possible_concessions":["..."],"content":"<150字内第一人称陈述>"}`,
        initialAssessmentSchema,
        (n) => this.emit({ t: 'retry', reason: '首发卡 Schema 校验失败，自动重试', attempt: n }),
      )
      this.ledger.record(tokens)
      // 结构归一化：模型可能多套一层包裹或缺字段，兜底填默认
      const raw = pickObj<InitialAssessmentCard>(data, 'initial_stance')
      const card: InitialAssessmentCard = {
        kind: 'InitialAssessmentCard',
        agent_id: agent.id,
        initial_stance: raw.initial_stance ?? agent.stance,
        main_concerns: asStringArray(raw.main_concerns, ['（输出异常，未提供）']),
        proposal_sketch: asStringArray(raw.proposal_sketch, []),
        non_negotiables: asStringArray(raw.non_negotiables, []),
        possible_concessions: asStringArray(raw.possible_concessions, []),
        content: raw.content ?? '（该 Agent 输出异常，以其角色卡立场为准）',
      }
      ctx.firstRoundCards.push(card)
      const hasRef = /证据|数据|实测|投诉|政策|规定|案例|标准|条款|补贴|测量|造价|分贝|消防|记录/.test(card.content)
      this.observer.recordSpeech(agent.id, hasRef)
      this.emit({ t: 'artifact', artifact: card, agent_id: agent.id, tokens })
      await this.paced(280)
    }
    // 首发立场 → 共识初值（立场多样性越高共识越低）
    const stances = new Set(ctx.firstRoundCards.map((c) => c.initial_stance.replace(/条件/g, '')))
    this.observer.recordConsensus(Math.max(0.15, 1 - stances.size / 5 - 0.25))
  }

  // ---- 阶段2：候选方案归并 ----
  private async runAggregate(config: ScenarioConfig, ctx: RunContext) {
    this.emit({ t: 'agent_start', agent_id: '__aggregator', name: 'Proposal Aggregator', archetype: '系统组件', context_mode: 'B2 摘要路由：读取全部首发卡' })
    const brief = ctx.firstRoundCards
      .map((c) => `${c.agent_id}（${c.initial_stance}）：方案雏形=${c.proposal_sketch.join('；')}；底线=${c.non_negotiables.join('；')}`)
      .join('\n')
    const { data, tokens } = await callJSON<{ proposals: CandidateProposal[] }>(
      this.caller,
      '你是 Proposal Aggregator。将各方首发意见归并为 2-3 个候选方案方向。相近意见合并，不生成过多方案。只输出 JSON。',
      `议题：${config.user_input}${this.checkpointContext(config.issue_graph.root_issue_id)}\n\n各方首发：\n${brief}\n\n输出：{"proposals":[{"kind":"CandidateProposal","proposal_id":"P1","title":"...","summary":"<80字内>","supporters":["<支持该方向的agent_id>"]}]}`,
      (n) => this.emit({ t: 'retry', reason: '方案归并 JSON 解析失败，自动重试', attempt: n }),
    )
    this.ledger.record(tokens)
    ctx.proposals = asArray<CandidateProposal>(data, 'proposals').slice(0, 3)
    if (ctx.proposals.length === 0) {
      this.emit({ t: 'retry', reason: '方案归并结构异常，已降级为单一候选方向', attempt: 0 })
      ctx.proposals = [{ kind: 'CandidateProposal', proposal_id: 'P1', title: '综合治理方案', summary: '（归并异常时的兜底方向：综合各方首发意见）', supporters: [] }]
    }
    for (const p of ctx.proposals) {
      this.emit({ t: 'artifact', artifact: p, tokens: 0 })
      await this.paced(200)
    }
  }

  // ---- 阶段3：全员轻量评分（评分矩阵） ----
  private async runScoring(config: ScenarioConfig, ctx: RunContext) {
    const proposalList = ctx.proposals.map((p) => `${p.proposal_id}「${p.title}」：${p.summary}`).join('\n')
    for (const agent of config.agents) {
      const firstCard = ctx.firstRoundCards.find((c) => c.agent_id === agent.id)
      this.emit({ t: 'agent_start', agent_id: agent.id, name: agent.name, archetype: agent.archetype, context_mode: 'B3 角色约束：候选方案 + 自身首发立场' })
      const { data, tokens } = await callJSON<{ scores: PlanScoreCard[] }>(
        this.caller,
        `你是「${agent.name}」，${agent.archetype}。你的首发立场：${firstCard?.initial_stance ?? agent.stance}；底线：${firstCard?.non_negotiables.join('、') ?? '无'}。
现在对每个候选方案轻量评分（1-5 整数），保持立场连贯，不要为了显得合群而给中庸分。${this.agentSop(agent)}`,
        `议题：${config.user_input}${this.checkpointContext(config.issue_graph.root_issue_id)}\n候选方案：\n${proposalList}\n\n输出：{"scores":[{"kind":"PlanScoreCard","agent_id":"${agent.id}","proposal_id":"P1","support_score":<1-5>,"feasibility_score":<1-5>,"fairness_score":<1-5>,"risk_score":<1-5>,"main_objection":"...","support_condition":"..."}, ...]}`,
        (n) => this.emit({ t: 'retry', reason: '评分卡 JSON 解析失败，自动重试', attempt: n }),
      )
      this.ledger.record(tokens)
      for (const s of data.scores) {
        ctx.scoreCards.push(s)
        this.emit({ t: 'artifact', artifact: s, agent_id: agent.id, tokens: 0 })
      }
      // 共识趋势：用支持度方差近似
      const supports = data.scores.map((s) => s.support_score)
      if (supports.length > 1) {
        const mean = supports.reduce((a, b) => a + b, 0) / supports.length
        const variance = supports.reduce((a, b) => a + (b - mean) ** 2, 0) / supports.length
        this.observer.recordConsensus(Math.min(0.95, Math.max(0.1, 1 - variance / 6)))
      }
      await this.paced(220)
    }
  }

  // ---- 阶段4：冲突分析 ----
  private async runConflict(config: ScenarioConfig, ctx: RunContext) {
    this.emit({ t: 'agent_start', agent_id: '__analyst', name: 'Conflict Analyst', archetype: '系统组件', context_mode: 'B2 摘要路由：评分矩阵' })
    const matrix = ctx.proposals
      .map((p) => {
        const scores = ctx.scoreCards.filter((s) => s.proposal_id === p.proposal_id)
        const avg = scores.length ? (scores.reduce((a, s) => a + s.support_score, 0) / scores.length).toFixed(1) : '-'
        const objections = scores.filter((s) => s.support_score <= 2).map((s) => `${s.agent_id}:${s.main_objection}`).join('；')
        return `${p.proposal_id}「${p.title}」平均支持=${avg}；低分反对=${objections || '无'}`
      })
      .join('\n')
    const { data, tokens } = await callJSON<ConflictMap>(
      this.caller,
      '你是冲突分析器。从评分矩阵中识别：领先方案、主要支持者、最强反对者、否决性风险、少数意见、证据缺口。注意：领先方案不等于最终最佳方案。只输出 JSON。',
      `议题：${config.user_input}${this.checkpointContext(config.issue_graph.root_issue_id)}\n\n评分矩阵：\n${matrix}\n\n输出：{"kind":"ConflictMap","leading_proposal":"P1","main_supporters":["agent_id"],"main_opponents":["agent_id"],"veto_risks":["..."],"minority_opinions":["..."],"evidence_gaps":["..."]}`,
      (n) => this.emit({ t: 'retry', reason: '冲突分析 JSON 解析失败，自动重试', attempt: n }),
    )
    this.ledger.record(tokens)
    data.main_supporters = asStringArray(data.main_supporters, [])
    data.main_opponents = asStringArray(data.main_opponents, [])
    data.veto_risks = asStringArray(data.veto_risks, [])
    data.minority_opinions = asStringArray(data.minority_opinions, [])
    data.evidence_gaps = asStringArray(data.evidence_gaps, [])
    data.leading_proposal = data.leading_proposal ?? ctx.proposals[0]?.proposal_id ?? 'P1'
    ctx.conflictMap = data
    for (const [index, risk] of data.veto_risks.entries()) {
      this.blackboard.registerConflict({
        issue_id: config.issue_graph.root_issue_id,
        conflict_type: /证据|事实|数据|测量|来源/.test(risk) ? 'fact'
          : /权限|授权|决策权/.test(risk) ? 'authority'
            : /程序|审批|资格|规则/.test(risk) ? 'procedure'
              : /预算|人力|工期|资源/.test(risk) ? 'resource'
                : /价值|公平|伦理/.test(risk) ? 'value' : 'interest',
        severity: 0.8,
        decision_relevant: true,
        claim_refs: [`conflict_map_veto_${index}`],
        resolution_status: 'open',
      })
    }
    for (const gap of data.evidence_gaps) {
      this.blackboard.writeRecord({
        register: 'unknowns', issueId: config.issue_graph.root_issue_id, phaseId: this.currentPhaseId,
        payload: { kind: 'EvidenceGap', claim: gap, verification_status: 'missing' },
        createdBy: '__analyst', visibility: ['public', 'audit'],
      })
    }
    for (const position of data.minority_opinions) {
      this.blackboard.writeRecord({
        register: 'objections', issueId: config.issue_graph.root_issue_id, phaseId: this.currentPhaseId,
        payload: { kind: 'MinorityPosition', position, retention_required: config.guards.minority_report_required },
        createdBy: '__analyst', visibility: ['public', 'audit'],
      })
    }
    ctx.evidenceCountAtConflict = this.blackboard.query({ registers: ['evidence'], issueId: config.issue_graph.root_issue_id }).length
    this.observer.recordMinority(data.minority_opinions.length, 0)
    this.emit({ t: 'artifact', artifact: data, tokens })
    this.evaluateConflictEvents(config, ctx)
  }

  // ---- 阶段5/6：鱼缸讨论 ----
  private async runFishbowl(config: ScenarioConfig, ctx: RunContext, round: number) {
    const inner = round === 1 ? this.selectInnerR1(config, ctx) : this.selectInnerR2(config, ctx)
    if (round === 1) ctx.innerR1 = inner
    else ctx.innerR2 = inner
    const outer = config.agents.filter((a) => !inner.includes(a.id)).map((a) => a.id)
    const leading = ctx.proposals.find((p) => p.proposal_id === ctx.conflictMap?.leading_proposal) ?? ctx.proposals[0]

    this.emit({
      t: 'fishbowl_plan', round, inner, outer,
      reason: round === 1
        ? '内圈四席：领先方案主要支持者 + 最强反对者 + 执行/管理主体 + 专业/弱势主体（由第一阶段冲突数据选出）'
        : '轮换：保留 1-2 个核心冲突方，换入遗漏问题相关 Agent（≥2 席）',
    })
    if (round === 2) {
      const rotated = inner.filter((id) => !ctx.innerR1.includes(id)).length
      this.observer.recordRotation(rotated, inner.length)
    }
    await this.paced()

    // 内圈：Objection / Response / Revision（C4 对抗制）
    const priorSummary = ctx.summaries[ctx.summaries.length - 1]
    for (const id of inner) {
      const agent = config.agents.find((a) => a.id === id)!
      const myScores = ctx.scoreCards.filter((s) => s.agent_id === id)
      this.emit({ t: 'agent_start', agent_id: id, name: agent.name, archetype: agent.archetype, context_mode: round === 1 ? 'B3：领先方案 + 冲突图 + 自身评分' : 'B3：Round1 摘要 + 外圈观察 + 自身评分' })
      const { data, tokens } = await callValidatedJSON<ObjectionCard>(
        this.caller,
        `你是「${agent.name}」，${agent.archetype}，现在是鱼缸内圈第 ${round} 轮。
你的评分记录：${myScores.map((s) => `${s.proposal_id}支持${s.support_score}分`).join('，')}。
事件规则路由：${ctx.conflictRoutes.join('；') || '按一般异议流程处理'}。
不要重复初始立场，要围绕领先方案做具体的反对/回应/修正：反对哪一部分、为什么、怎么改、满足什么条件后可支持。${round === 2 ? '本轮重点：处理第一轮遗漏问题、明确责任主体、形成可执行修订。' : ''}${this.agentSop(agent)}`,
        `议题：${config.user_input}${this.checkpointContext(config.issue_graph.root_issue_id)}
领先方案：${leading.proposal_id}「${leading.title}」${leading.summary}
${priorSummary ? `上一轮摘要：多数意见=${priorSummary.majority_views.join('；')}；未答问题=${priorSummary.unanswered_questions.join('；')}` : ''}

输出 Objection/Revision Card（JSON）：{"kind":"ObjectionCard","round":${round},"agent_id":"${id}","objection_type":"<利益受损/公共资源/可执行性/普遍化 之一>","objection":"<120字内>","required_revision":["..."],"support_condition":"...","reply_to":"<针对的agent_id或null>"}`,
        objectionSchema,
        (n) => this.emit({ t: 'retry', reason: '异议卡 Schema 校验失败，自动重试', attempt: n }),
      )
      this.ledger.record(tokens)
      const obj: ObjectionCard = {
        kind: 'ObjectionCard',
        round,
        agent_id: id,
        objection_type: data.objection_type ?? '可执行性反驳',
        objection: data.objection ?? '（输出异常）',
        required_revision: asStringArray(data.required_revision, []),
        support_condition: data.support_condition ?? '待定',
        reply_to: data.reply_to ?? undefined,
      }
      ctx.objections.push(obj)
      const first = ctx.firstRoundCards.find((card) => card.agent_id === id)
      this.blackboard.recordRevision({
        issue_id: config.issue_graph.root_issue_id,
        agent_id: id,
        phase_id: this.currentPhaseId,
        position_before: first?.initial_stance ?? agent.stance,
        position_after: obj.support_condition,
        reasoning_before_ref: first ? `initial:${id}` : undefined,
        reasoning_after_ref: `objection:${round}:${id}`,
        revision_reason: obj.required_revision.length ? 'conditional_revision' : 'position_reaffirmed',
        cited_argument_ids: obj.reply_to ? [`reply:${obj.reply_to}`] : [],
        self_reported_trigger: obj.support_condition,
        confidence: 0.6,
        causal_status: 'self_reported',
      })
      const grounded = /证据|数据|实测|投诉|政策|规定|案例|标准|条款|补贴|测量|造价|分贝|消防|记录/.test(obj.objection)
      if (obj.reply_to) {
        this.observer.recordQuestion()
        this.observer.recordSpeech(id, grounded, obj.reply_to)
      } else {
        this.observer.recordSpeech(id, grounded)
      }
      this.emit({ t: 'artifact', artifact: obj, agent_id: id, tokens })
      await this.paced(300)
    }

    // 运行时适应：发言支配 + Grounding 检测（《优化框架》第七节）
    const snap = this.observer.snapshot()
    const dominant = Object.entries(snap.speaking_share).find(([, v]) => v > 0.4)
    if (dominant) {
      const name = config.agents.find((a) => a.id === dominant[0])?.name ?? dominant[0]
      this.emit({ t: 'adaptation', trigger: `发言占比异常：「${name}」占比 ${(dominant[1] * 100).toFixed(0)}% > 40%`, action: '沉默者权重 ×1.5，下一轮优先调度未发言方', scope: '当前阶段' })
      this.observer.flag('发言支配')
    } else if (snap.grounding_rate < 0.3 && ctx.objections.length > 0 && !ctx.adaptationFired) {
      ctx.adaptationFired = true
      this.emit({ t: 'adaptation', trigger: `Grounding 率 ${(snap.grounding_rate * 100).toFixed(0)}% < 30%：发言缺乏依据支撑`, action: '下一轮发言强制要求附带依据（证据 / 数据 / 条款）', scope: '下 1 轮' })
      this.observer.flag('依据不足')
    }

    // 外圈：观察卡
    for (const id of outer) {
      const agent = config.agents.find((a) => a.id === id)!
      this.emit({ t: 'agent_start', agent_id: id, name: agent.name, archetype: agent.archetype, context_mode: '外圈：当前方案 + 内圈摘要 + 未解决问题' })
      const { data, tokens } = await callJSON<OuterObservationCard>(
        this.caller,
        `你是「${agent.name}」，${agent.archetype}，本轮在鱼缸外圈观察。你的任务不是长篇发言，而是指出内圈遗漏的问题、需要补充的证据，并可申请进入下一轮内圈。${this.agentSop(agent)}`,
        `议题：${config.user_input}${this.checkpointContext(config.issue_graph.root_issue_id)}
领先方案：${leading.proposal_id}「${leading.title}」
内圈刚刚的异议：${ctx.objections.filter((o) => o.round === round).map((o) => `${o.agent_id}：${o.objection}`).join('\n')}

输出 Outer Observation Card（JSON）：{"kind":"OuterObservationCard","round":${round},"agent_id":"${id}","missed_issue":"...","objection":"...","evidence_needed":["..."],"request_to_enter_inner_circle":<true|false>,"absorbed":false}`,
        (n) => this.emit({ t: 'retry', reason: '观察卡 JSON 解析失败，自动重试', attempt: n }),
      )
      this.ledger.record(tokens)
      ctx.outerCards.push(data)
      this.observer.recordOuter(1, 0)
      this.emit({ t: 'artifact', artifact: data, agent_id: id, tokens })
      await this.paced(240)
    }

    // 主持人：鱼缸摘要卡（B2 摘要继承的核心）
    this.emit({ t: 'agent_start', agent_id: '__moderator', name: 'Moderator', archetype: '主持人', context_mode: '生成 Fishbowl Summary Card，替代完整聊天记录' })
    const absorbed = ctx.outerCards.filter((c) => c.round === round && (c.request_to_enter_inner_circle || c.missed_issue))
    absorbed.forEach((c) => (c.absorbed = true))
    this.observer.recordOuter(0, absorbed.length)
    const { data: summary, tokens: sumTokens } = await callJSON<FishbowlSummaryCard>(
      this.caller,
      `你是主持人。生成第 ${round} 轮鱼缸摘要卡。必须固定保留：多数意见、少数意见、未解决冲突、外圈被吸收的意见、下一轮必须回答的问题。不允许只写"大家基本同意"。只输出 JSON。`,
      `议题：${config.user_input}${this.checkpointContext(config.issue_graph.root_issue_id)}
内圈异议：${ctx.objections.filter((o) => o.round === round).map((o) => `${o.agent_id}（${o.objection_type}）：${o.objection} → 要求修订：${o.required_revision.join('、')}`).join('\n')}
外圈观察：${ctx.outerCards.filter((c) => c.round === round).map((c) => `${c.agent_id}：遗漏=${c.missed_issue}`).join('\n')}

输出：{"kind":"FishbowlSummaryCard","round":${round},"inner_circle":${JSON.stringify(inner)},"outer_circle":${JSON.stringify(outer)},"majority_views":["..."],"minority_views":["..."],"core_conflicts":["..."],"unanswered_questions":["..."],"absorbed_observations":["..."],"next_round_invitees":["agent_id"]}`,
      (n) => this.emit({ t: 'retry', reason: '摘要卡 JSON 解析失败，自动重试', attempt: n }),
    )
    this.ledger.record(sumTokens)
    ctx.summaries.push(summary)
    if (round >= 2) {
      this.blackboard.updateConflicts(
        (conflict) => conflict.resolution_status === 'open' && conflict.conflict_type !== 'fact',
        'retained',
        '两轮定向回应已完成；分歧仍在终态报告中保留',
      )
    }
    if (!ctx.minorityKeptCounted && summary.minority_views.length > 0) {
      ctx.minorityKeptCounted = true
      this.observer.recordMinority(0, 1)
    }
    this.emit({ t: 'artifact', artifact: summary, tokens: sumTokens })
    // 共识趋势：随轮次上升
    this.observer.recordConsensus(Math.min(0.92, 0.55 + round * 0.15))
  }

  // 内圈选择：第一阶段冲突数据 + 席位约束（确定性，0 tokens）
  private selectInnerR1(config: ScenarioConfig, ctx: RunContext): string[] {
    const leading = ctx.conflictMap?.leading_proposal
    const picked: string[] = []
    const push = (id?: string) => {
      if (id && !picked.includes(id) && config.agents.some((a) => a.id === id)) picked.push(id)
    }
    // 席位1：领先方案最强反对者
    const opponent = ctx.scoreCards.filter((s) => s.proposal_id === leading).sort((a, b) => a.support_score - b.support_score)[0]
    push(ctx.conflictMap?.main_opponents[0] ?? opponent?.agent_id)
    // 席位2：领先方案主要支持者
    const supporter = ctx.scoreCards.filter((s) => s.proposal_id === leading).sort((a, b) => b.support_score - a.support_score)[0]
    push(ctx.conflictMap?.main_supporters[0] ?? supporter?.agent_id)
    // 席位3：执行/管理主体
    push(config.agents.find((a) => /治理|管理|执行|街道|物业|委员会/.test(a.archetype + a.name))?.id)
    // 席位4：专业观察者或弱势主体
    push(config.agents.find((a) => /专业观察者/.test(a.archetype))?.id ??
      config.agents.find((a) => /弱势|老年|环卫|租户|儿童/.test(a.archetype + a.name))?.id)
    for (const a of config.agents) {
      if (picked.length >= 4) break
      push(a.id)
    }
    return picked.slice(0, 4)
  }

  private selectInnerR2(config: ScenarioConfig, ctx: RunContext): string[] {
    // 保留核心冲突方：最强反对者（席位1）+ 执行/管理主体（席位3）
    const keep = [ctx.innerR1[0], ctx.innerR1[2]].filter(Boolean)
    const invited = ctx.summaries[0]?.next_round_invitees ?? []
    const wantIn = ctx.outerCards.filter((c) => c.request_to_enter_inner_circle).map((c) => c.agent_id)
    const candidates = [...new Set([...invited, ...wantIn])].filter((id) => !keep.includes(id) && config.agents.some((a) => a.id === id))
    const picked = [...keep]
    for (const id of candidates) {
      if (picked.length >= 4) break
      picked.push(id)
    }
    for (const a of config.agents) {
      if (picked.length >= 4) break
      if (!picked.includes(a.id)) picked.push(a.id)
    }
    return picked.slice(0, 4)
  }

  // ---- 阶段7：修订方案生成 ----
  private async runPropose(config: ScenarioConfig, ctx: RunContext) {
    this.emit({ t: 'agent_start', agent_id: '__proposer', name: 'Proposal Agent', archetype: '系统组件', context_mode: 'B2：两轮摘要 + 全部修订要求' })
    const revisions = ctx.objections.flatMap((o) => o.required_revision)
    const { data, tokens } = await callValidatedJSON<FinalProposal>(
      this.caller,
      `你是 Proposal Agent。根据两轮鱼缸讨论的异议与修订要求，形成最终修订方案。
必须包含：责任主体、资源来源、时间安排、风险控制、退出机制、复评机制；
必须说明方案如何由异议逐步修改而来（修订路径）；
必须明确标注未被采纳的少数意见。不允许输出"加强管理、平衡利益"这类空泛表述。只输出 JSON。`,
      `议题：${config.user_input}${this.checkpointContext(config.issue_graph.root_issue_id)}
领先方案方向：${ctx.proposals.find((p) => p.proposal_id === ctx.conflictMap?.leading_proposal)?.title ?? ''}
收到的修订要求：${revisions.join('；')}
少数意见：${ctx.conflictMap?.minority_opinions.join('；') ?? '无'}
否决性风险：${ctx.conflictMap?.veto_risks.join('；') ?? '无'}

输出：{"kind":"FinalProposal","title":"...","goal":"...","measures":["..."],"responsible_parties":["..."],"resources":"...","timeline":"...","risk_control":["..."],"exit_mechanism":"...","review_mechanism":"...","revision_path":["<由谁的什么异议→修改了什么>"]}`,
      finalProposalSchema,
      (n) => this.emit({ t: 'retry', reason: '方案 Schema 校验失败，自动重试', attempt: n }),
    )
    this.ledger.record(tokens)
    ctx.finalProposal = data
    this.emit({ t: 'final_proposal', proposal: data })
  }

  // ---- 阶段8：试卷阅卷（红线门 → 客观题 → 主观题） ----
  private async runExam(config: ScenarioConfig, ctx: RunContext) {
    const exam = config.exam_blueprint!
    this.emit({ t: 'exam_frozen', blueprint: exam })
    await this.paced()
    const proposalText = JSON.stringify(ctx.finalProposal, null, 1)

    // 红线门 + 客观题（一次调用，按冻结试卷判分）
    this.emit({ t: 'agent_start', agent_id: '__examiner_obj', name: '客观题阅卷官', archetype: 'Rule Checker', context_mode: '按议事开始前冻结的试卷判分，不评价自身' })
    const { data: objRaw, tokens: t1 } = await callJSON<{
      red_line_gate: 'pass' | 'revise' | 'reject'
      red_line_notes: string[]
      objective_scores: { module: string; score: number; comment: string }[]
    }>(
      this.caller,
      `你是客观题阅卷官。按议事开始前冻结的试卷判分（不允许修改题目与分值）。
红线任一触发即 gate=revise 或 reject；客观题按模块给分，给分必须写明依据。只输出 JSON。`,
      `议题：${config.user_input}
红线：${exam.red_lines.join('；')}
客观题模块：${exam.objective.map((o) => `${o.module}（满分${o.full_score}）：${o.check}`).join('\n')}
方案：${proposalText}
少数意见是否被记录：${ctx.summaries.flatMap((s) => s.minority_views).join('；') || '无'}

输出：{"red_line_gate":"pass|revise|reject","red_line_notes":["..."],"objective_scores":[{"module":"...","score":<int>,"comment":"..."}]}`,
      (n) => this.emit({ t: 'retry', reason: '客观题判分 JSON 解析失败，自动重试', attempt: n }),
    )
    this.ledger.record(t1)

    // 主观题（另一个阅卷官，避免自我确认）
    this.emit({ t: 'agent_start', agent_id: '__examiner_subj', name: '主观题阅卷官', archetype: 'Evaluator', context_mode: '固定 Rubric + 议事过程记录' })
    const processText = `首发${ctx.firstRoundCards.length}份；异议${ctx.objections.length}条；修订要求${ctx.objections.flatMap((o) => o.required_revision).length}条；外圈观察${ctx.outerCards.length}条（吸收${ctx.outerCards.filter((c) => c.absorbed).length}条）；修订路径：${ctx.finalProposal?.revision_path.join('；') ?? ''}`
    const { data: subjRaw, tokens: t2 } = await callJSON<{
      subjective_scores: { module: string; score: number; comment: string }[]
      grade_comment: string
    }>(
      this.caller,
      `你是主观题阅卷官。按固定 Rubric 给分。不能仅因为所有 Agent 最后"同意"就给高分；要看是否真实发生了质询、回应、让步与修正。只输出 JSON。`,
      `议题：${config.user_input}
Rubric：${exam.subjective.map((s) => `${s.module}（满分${s.full_score}）：${s.rubric}`).join('\n')}
议事过程：${processText}
最终方案：${proposalText}

输出：{"subjective_scores":[{"module":"...","score":<int>,"comment":"..."}],"grade_comment":"<60字总评>"}`,
      (n) => this.emit({ t: 'retry', reason: '主观题判分 JSON 解析失败，自动重试', attempt: n }),
    )
    this.ledger.record(t2)

    const objScoresRaw = asArray<{ module: string; score: number; comment: string }>(objRaw, 'objective_scores')
    const subjScoresRaw = asArray<{ module: string; score: number; comment: string }>(subjRaw, 'subjective_scores')
    const objectiveScores = exam.objective.map((o) => {
      const got = objScoresRaw.find((s) => s.module?.includes(o.module.slice(0, 4)) || o.module.includes(s.module?.slice(0, 4) ?? ''))
      return { module: o.module, score: Math.min(got?.score ?? 0, o.full_score), full_score: o.full_score, comment: got?.comment ?? '' }
    })
    const subjectiveScores = exam.subjective.map((s) => {
      const got = subjScoresRaw.find((g) => g.module?.includes(s.module.slice(0, 4)) || s.module.includes(g.module?.slice(0, 4) ?? ''))
      return { module: s.module, score: Math.min(got?.score ?? 0, s.full_score), full_score: s.full_score, comment: got?.comment ?? '' }
    })
    const objTotal = objectiveScores.reduce((a, s) => a + s.score, 0)
    const subjTotal = subjectiveScores.reduce((a, s) => a + s.score, 0)
    const result: ExamResult = {
      kind: 'ExamResult',
      red_line_gate: objRaw.red_line_gate,
      red_line_notes: objRaw.red_line_notes,
      objective_scores: objectiveScores,
      subjective_scores: subjectiveScores,
      objective_total: objTotal,
      subjective_total: subjTotal,
      total: objTotal + subjTotal,
      grade_comment: subjRaw.grade_comment,
    }
    ctx.examResult = result
    this.emit({ t: 'exam_result', result })
    if (result.red_line_gate !== 'pass') {
      this.emit({
        t: 'adaptation',
        trigger: `强制红线门返回 ${result.red_line_gate.toUpperCase()}`,
        action: '阻止系统声明自主决议，转入人类复核与授权',
        scope: '终止状态',
      })
    }
  }

  // ---- 阶段9：最终报告 ----
  private async runReport(config: ScenarioConfig, ctx: RunContext) {
    const p = ctx.finalProposal!
    const e = ctx.examResult!
    const minority = [...new Set(ctx.summaries.flatMap((s) => s.minority_views).concat(ctx.conflictMap?.minority_opinions ?? []))]
    const markdown = [
      `## 议事报告 · ${config.title}`,
      ``,
      `**议题**：${config.user_input}`,
      ``,
      `### 待授权候选方案「${p.title}」`,
      `- 目标：${p.goal}`,
      `- 措施：${p.measures.join('；')}`,
      `- 责任主体：${p.responsible_parties.join('、')}`,
      `- 资源来源：${p.resources}`,
      `- 时间安排：${p.timeline}`,
      `- 退出机制：${p.exit_mechanism}`,
      `- 复评机制：${p.review_mechanism}`,
      ``,
      `### 修订路径`,
      ...p.revision_path.map((r) => `- ${r}`),
      ``,
      `### 少数意见（未被采纳但有依据，必须保留）`,
      ...minority.map((m) => `- ${m}`),
      ``,
      `### 试卷成绩`,
      `- 红线门：${e.red_line_gate.toUpperCase()}（${e.red_line_notes.join('；') || '未触发红线'}）`,
      `- 客观题：${e.objective_total} / 40`,
      `- 主观题：${e.subjective_total} / 60`,
      `- 总成绩：${e.total} / 100`,
      ``,
      `### 结论边界`,
      `- 以上方案由 AI 多智能体议事生成，仅用于辅助分析，**不替代真实公共决策与实地调研**`,
      `- 终止状态：${e.red_line_gate === 'pass' && !config.guards.human_authority_required ? 'DECIDED' : 'HUMAN_ESCALATION（需真实授权主体确认；红线未通过时禁止作为正式决议）'}`,
      `- 待真实调研问题：${ctx.conflictMap?.evidence_gaps.join('；') ?? '无'}`,
    ].join('\n')
    this.emit({ t: 'report', markdown })
  }
}

interface RunContext {
  config: ScenarioConfig
  firstRoundCards: InitialAssessmentCard[]
  proposals: CandidateProposal[]
  scoreCards: PlanScoreCard[]
  conflictMap: ConflictMap | null
  innerR1: string[]
  innerR2: string[]
  objections: ObjectionCard[]
  outerCards: OuterObservationCard[]
  summaries: FishbowlSummaryCard[]
  finalProposal: FinalProposal | null
  examResult: ExamResult | null
  adaptationFired: boolean
  minorityKeptCounted: boolean
  conflictRoutes: string[]
  deliberationRounds: number
  evidenceCountAtConflict: number
  impasseReport: ImpasseReport | null
  deadlineEventFired: boolean
}
