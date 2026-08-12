/**
 * Scenario Compiler · 场景编译器（第六周 Scenario Compiler + 《优化框架》第十节）
 * Step1 LLM分类（已由 Dispatcher 完成）→ Step2 查决策表 → Step3 LLM生成Agent
 * → Step4 确定性信息流 → Step5 阶段序列 + 条件边 → Step6 评估标准
 * 仅 Step3 消耗 LLM tokens，其余全为确定性规则
 */
import type { AgentCard, ExamBlueprint, Phase, PhasePolicy, PolicyModifier, ScenarioConfig, TaskProfile, StrategyCombo } from './types'
import { callJSON, type LLMCaller } from './llm'
import { lookupDecisionTable, validateCombo } from './dispatcher'
import { EVENT_RULE_REGISTRY, MODIFIER_REGISTRY, policyToLegacyCombo, PROTOCOL_REGISTRY } from './framework/registry'
import { buildAgentContracts, buildIssueGraph, buildScenarioSpec, defaultGuardSet } from './framework/scenario'
import { validateScenarioConfig } from './framework/validation'
import { recommendProtocolTemplates } from './framework/protocols'

const AGENT_SYSTEM = `你是多智能体议事系统的 Agent Factory。根据议题生成利益相关方 Agent。
要求：
1. 必须覆盖：支持方、反对方、直接受影响者、执行/管理者、专业/评估者、弱势或容易沉默的群体；
2. 每个 Agent 有明确的利益诉求与发言边界（can_say / cannot_say），不允许刻板印象，不允许编造数据；
3. 生成 6-8 个 Agent；
4. 只输出 JSON。`

const AGENT_SCHEMA = `[
  {
    "id": "<英文snake_case>",
    "name": "<中文角色名>",
    "archetype": "<角色原型>",
    "relationship": "<与议题的关系>",
    "interests": ["<核心利益1>", "<核心利益2>"],
    "stance": "<初始立场>",
    "can_say": ["<可以表达的内容>"],
    "cannot_say": ["<不可逾越的边界>"]
  }
]`

export interface CompileProgress {
  (step: number, name: string, detail: string, tokens: number): void
}

export async function compileScenario(
  caller: LLMCaller,
  userInput: string,
  profile: TaskProfile,
  onStep: CompileProgress,
  onRetry?: (attempt: number) => void,
): Promise<ScenarioConfig> {
  // Step 2 · 查协作决策表（确定性，0 tokens）
  const { combo, hit } = lookupDecisionTable(profile)
  onStep(2, '查协作决策表', `${hit} → 策略配方 ${formatCombo(combo)}`, 0)

  const errors = validateCombo(combo)
  if (errors.length) throw new Error('策略配方校验失败：' + errors.join('；'))

  // Step 3 · LLM 生成 Agent Pool
  const { data: agentsRaw, tokens: agentTokens } = await callJSON<AgentCard[]>(
    caller,
    AGENT_SYSTEM,
    `议题：${userInput}\n场景特征：${profile.domain}，${profile.agent_relations}，决策类型=${profile.decision_pattern}\n\n输出 JSON 数组，格式：\n${AGENT_SCHEMA}`,
    onRetry,
  )
  const agents = agentsRaw.slice(0, 8).map((a, i) => ({ ...a, id: a.id || `agent_${i}` }))
  const contracts = buildAgentContracts(agents)
  onStep(3, 'LLM 生成 Agent Pool', `生成 ${agents.length} 个利益相关方 Agent，覆盖 ${new Set(agents.map((a) => a.archetype)).size} 类原型`, agentTokens)

  // Step 4 · 确定性信息流设计（0 tokens）
  onStep(4, '信息流设计', 'B3 角色约束路由：Agent 只读取 Case Context + 自身角色卡 + 相关工件，首发阶段信息隔离（防锚定）', 0)

  // Step 5 · 阶段序列 + 条件边（0 tokens）
  const phases = buildDeliberationPhases(combo)
  onStep(5, '阶段序列 + 条件边', `${phases.length} 个阶段：全员首发 → 方案归并 → 轻量评分 → 冲突分析 → 鱼缸两轮 → 方案生成 → 试卷阅卷`, 0)

  // Step 6 · 评估标准生成（0 tokens，试卷在议事开始前冻结）
  const exam = buildExamBlueprint(userInput)
  onStep(6, '评测试卷冻结', `红线 ${exam.red_lines.length} 条 + 客观题 ${exam.objective.length} 模块 40 分 + 主观题 ${exam.subjective.length} 模块 60 分`, 0)

  const scenarioSpec = buildScenarioSpec(userInput, profile, agents)
  const issueGraph = buildIssueGraph(userInput, scenarioSpec.scenario_id)
  const guards = defaultGuardSet(profile)
  const recommendedProtocols = recommendProtocolTemplates(profile)
  const config: ScenarioConfig = {
    scenario_id: scenarioSpec.scenario_id,
    title: userInput.slice(0, 30),
    user_input: userInput,
    profile,
    strategy: combo,
    agents: contracts,
    phases,
    scenario_spec: scenarioSpec,
    issue_graph: issueGraph,
    agent_contracts: contracts,
    phase_graph: { entry_phase_id: phases[0].id, phases },
    guards,
    protocol: PROTOCOL_REGISTRY.fishbowl_v1,
    event_rules: [EVENT_RULE_REGISTRY.material_conflict_route_v1, EVENT_RULE_REGISTRY.new_evidence_reopen_v1, EVENT_RULE_REGISTRY.deadline_finalize_v1, EVENT_RULE_REGISTRY.impasse_detection_v1],
    terminal_states: ['DECIDED', 'PROVISIONAL', 'IMPASSE', 'WAITING_FOR_EVIDENCE', 'HUMAN_ESCALATION', 'ABORTED'],
    compile_rationale: {
      selected_protocol: 'fishbowl_v1',
      reasons: [hit, '多利益相关方议题需要独立首发、冲突审查、动态轮换和少数意见保留'],
      alternatives: [...recommendedProtocols.filter((id) => id !== 'fishbowl_v1'), 'single_agent_baseline'],
      confidence: 0.78,
      expected_model_calls: Math.max(12, contracts.length * 5 + 6),
      expected_token_range: [12_000, 90_000],
    },
    case_context: userInput,
    hard_constraints: ['不得违反法律法规', '不得编造证据或数据', '方案必须包含责任主体与资源来源', 'AI 议事结果不替代真实公共决策'],
    exam_blueprint: exam,
  }
  const validation = validateScenarioConfig(config)
  if (!validation.ok) throw new Error('ScenarioConfig 确定性校验失败：' + validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join('；'))
  onStep(7, '确定性预检', `PhaseGraph、策略槽位、协议、能力与权限校验通过（${phases.length} 个节点）`, 0)
  return config
}

export function formatCombo(c: StrategyCombo): string {
  return `${c.A.join('+')} ${c.B} ${c.C} ${c.D} ${c.E.join('+')}`
}

function phase(
  input: Omit<Phase, 'strategy' | 'policy' | 'modifiers' | 'depends_on' | 'required' | 'skippable_on_deadline' | 'entry_conditions' | 'exit_conditions' | 'protocol_id'> & {
    policy: PhasePolicy
    modifiers?: PolicyModifier[]
    depends_on?: string[]
    protocol_id: string
    entry_conditions?: string[]
    exit_conditions?: string[]
    required?: boolean
    skippable_on_deadline?: boolean
  },
): Phase {
  const modifiers = input.modifiers ?? []
  return {
    ...input,
    modifiers,
    strategy: policyToLegacyCombo(input.policy, modifiers),
    depends_on: input.depends_on ?? [],
    required: input.required ?? true,
    skippable_on_deadline: input.skippable_on_deadline ?? false,
    entry_conditions: input.entry_conditions ?? ['dependencies_satisfied'],
    exit_conditions: input.exit_conditions ?? ['artifact_valid'],
  }
}

/** 两阶段 Open-first Fishbowl 阶段序列（v2.0 更新方案第七、八节） */
export function buildDeliberationPhases(combo: StrategyCombo): Phase[] {
  void combo
  return [
    phase({
      id: 'first_round', name: '全员独立首发', purpose: '广泛收集立场、底线与方案雏形，避免过早排除角色与后发锚定',
      policy: { A: 'A1', B: 'B3', C: 'C2', D: 'D2', E: 'E1' }, modifiers: [MODIFIER_REGISTRY.independent_commit], protocol_id: 'independent_commit_v1',
      kind: 'speak',
      config: { artifact: 'InitialAssessmentCard', isolated: true },
      transitions: [{ condition: 'artifacts_valid', target: 'aggregate' }],
      exit_conditions: ['all_required_artifacts_valid'],
    }),
    phase({
      id: 'aggregate', name: '候选方案归并', purpose: '将相近意见归并为 2-3 个候选方向',
      policy: { A: 'A3', B: 'B2', C: 'C1', D: 'D2', E: 'E1' }, protocol_id: 'structured_synthesis_v1', depends_on: ['first_round'],
      kind: 'aggregate', config: { max_proposals: 3 },
      transitions: [{ condition: 'artifacts_valid', target: 'score' }],
    }),
    phase({
      id: 'score', name: '全员轻量评分', purpose: '每个 Agent 对候选方案输出 Plan Score Card，形成评分矩阵',
      policy: { A: 'A1', B: 'B3', C: 'C2', D: 'D2', E: 'E1' }, modifiers: [MODIFIER_REGISTRY.independent_commit], protocol_id: 'structured_scoring_v1', depends_on: ['aggregate'],
      kind: 'score', config: {},
      transitions: [{ condition: 'artifacts_valid', target: 'conflict' }],
      exit_conditions: ['all_scores_valid'],
    }),
    phase({
      id: 'conflict', name: '冲突分析', purpose: '识别领先方案、主要反对意见、少数意见、否决性风险与证据缺口',
      policy: { A: 'A3', B: 'B2', C: 'C4', D: 'D2', E: 'E1' }, protocol_id: 'structured_synthesis_v1', depends_on: ['score'],
      kind: 'analyze', config: {},
      transitions: [{ condition: 'checkpoint_retry', target: 'conflict', max_retries: 1 }, { condition: 'artifacts_valid', target: 'fishbowl_r1' }],
    }),
    phase({
      id: 'fishbowl_r1', name: '鱼缸 Round 1 · 异议与回应', purpose: '内圈围绕领先方案输出 Objection / Response，外圈输出观察卡',
      policy: { A: 'A4', B: 'B3', C: 'C4', D: 'D2', E: 'E3' }, modifiers: PROTOCOL_REGISTRY.fishbowl_v1.modifiers, protocol_id: 'fishbowl_v1', depends_on: ['conflict'],
      kind: 'fishbowl', config: { round: 1, inner_size: 4 },
      transitions: [
        { condition: 'artifacts_valid', target: 'fishbowl_r2' },
        { condition: 'review_failed', target: 'fishbowl_r1', max_retries: 2 },
      ],
      exit_conditions: ['review_round_complete'], failure_target: 'fishbowl_r1',
    }),
    phase({
      id: 'fishbowl_r2', name: '鱼缸 Round 2 · 遗漏与修正', purpose: '轮换内圈：处理第一轮遗漏、补充证据、明确责任，形成可执行修订',
      policy: { A: 'A4', B: 'B2', C: 'C4', D: 'D2', E: 'E3' }, modifiers: PROTOCOL_REGISTRY.fishbowl_v1.modifiers, protocol_id: 'fishbowl_v1', depends_on: ['fishbowl_r1'],
      kind: 'fishbowl', config: { round: 2, inner_size: 4, min_rotation: 2 },
      required: false, skippable_on_deadline: true,
      transitions: [{ condition: 'checkpoint_retry', target: 'fishbowl_r2', max_retries: 1 }, { condition: 'artifacts_valid', target: 'propose' }],
      exit_conditions: ['review_round_complete'],
    }),
    phase({
      id: 'propose', name: '修订方案生成', purpose: 'Proposal Agent 汇总两轮异议与修订，形成最终候选方案',
      policy: { A: 'A3', B: 'B2', C: 'C2', D: 'D2', E: 'E1' }, protocol_id: 'structured_synthesis_v1', depends_on: ['fishbowl_r2'],
      kind: 'propose', config: {},
      transitions: [{ condition: 'checkpoint_retry', target: 'propose', max_retries: 1 }, { condition: 'artifacts_valid', target: 'exam' }],
    }),
    phase({
      id: 'exam', name: '试卷阅卷', purpose: '红线合规门 → 客观题 → 主观 Rubric → 总成绩',
      policy: { A: 'A3', B: 'B2', C: 'C4', D: 'D2', E: 'E1' }, protocol_id: 'evidence_evaluation_v1', depends_on: ['propose'],
      kind: 'evaluate', config: {},
      transitions: [{ condition: 'checkpoint_retry', target: 'exam', max_retries: 1 }, { condition: 'artifacts_valid', target: 'report' }],
      exit_conditions: ['mandatory_gates_evaluated'],
    }),
    phase({
      id: 'report', name: '最终报告', purpose: '共识、分歧、少数意见、修订路径、成绩与结论边界',
      policy: { A: 'A3', B: 'B2', C: 'C1', D: 'D2', E: 'E1' }, protocol_id: 'audit_report_v1', depends_on: ['exam'],
      kind: 'report', config: {},
      transitions: [],
      exit_conditions: ['terminal_report_created'],
    }),
  ]
}

export function buildExamBlueprint(topic: string): ExamBlueprint {
  void topic
  return {
    kind: 'ExamBlueprint',
    red_lines: [
      '违反法律法规或明确安全条件',
      '编造法律、政策、数据或证据',
      '使用超过可用资源的方案',
      '没有设置必要责任主体',
      '将 AI 议事结果直接表述为真实民意',
    ],
    objective: [
      { module: '法律与强制规则', full_score: 12, check: '是否违反明确规定，法律判断是否有来源' },
      { module: '安全与硬约束', full_score: 8, check: '容量、预算、空间、时间、安全限制是否满足' },
      { module: '事实与证据正确性', full_score: 8, check: '主张是否有依据，引用是否匹配' },
      { module: '方案完整性', full_score: 6, check: '是否包含责任主体、时间、资金、退出机制' },
      { module: '工件与过程可追踪性', full_score: 4, check: '结论能否追溯至 Agent、证据和轮次' },
      { module: '少数意见记录', full_score: 2, check: '有依据的反对意见是否被保留' },
    ],
    subjective: [
      { module: '问题理解与冲突覆盖', full_score: 10, rubric: '是否识别真正利益冲突，而非表面总结' },
      { module: '方案创新性', full_score: 10, rubric: '是否提出新的组合、试点或补偿机制' },
      { module: '协作协调质量', full_score: 12, rubric: 'Agent 之间是否发生质询、回应、让步与修正' },
      { module: '公平与少数意见保护', full_score: 10, rubric: '是否考虑成本承担者和沉默主体' },
      { module: '可执行性与适应性', full_score: 10, rubric: '是否能落地，环境变化后能否调整' },
      { module: '推理透明度与修订路径', full_score: 8, rubric: '是否说明方案如何由异议逐步修改而来' },
    ],
    frozen_at: new Date().toISOString(),
  }
}
