import type {
  AgentCard, Phase, PhasePolicy, PresentationBrief, ScenarioConfig, StrategyCombo, TaskProfile,
} from '../types'
import { buildAgentContracts, buildIssueGraph, defaultGuardSet } from '../framework/scenario'
import { EVENT_RULE_REGISTRY, policyToLegacyCombo, PROTOCOL_REGISTRY } from '../framework/registry'
import { validateScenarioConfig } from '../framework/validation'
import type { CompileProgress } from '../compiler'

const POLICY: PhasePolicy = { A: 'A3', B: 'B2', C: 'C2', D: 'D2', E: 'E1' }

const PRESENTATION_AGENTS: AgentCard[] = [
  {
    id: 'research_planner', name: '资料规划 Agent', archetype: 'research_planner', relationship: '拆解研究问题并规划证据任务',
    interests: ['信息覆盖', '来源可追溯'], stance: '先明确问题与证据边界',
    can_say: ['研究问题', '证据要求', '资料缺口'], cannot_say: ['把未检索到的材料表述为已核验事实'],
    capabilities: ['stakeholder_analysis', 'research_planning'], tools: ['uploaded_attachments'],
  },
  {
    id: 'evidence_analyst', name: '证据分析 Agent', archetype: 'evidence_analyst', relationship: '阅读输入与附件并形成证据卡',
    interests: ['事实准确', '来源分级'], stance: '事实、背景知识与缺口必须分离',
    can_say: ['附件事实', '用户明确提供的信息', '低置信背景知识'], cannot_say: ['伪造来源、链接、统计数字'],
    capabilities: ['risk_review', 'evidence_synthesis'], tools: ['uploaded_attachments'],
  },
  {
    id: 'narrative_architect', name: '叙事架构 Agent', archetype: 'narrative_architect', relationship: '把证据组织成受众可理解的故事线',
    interests: ['论点清晰', '结构连贯'], stance: '每页服务于一个核心信息',
    can_say: ['叙事主线', '章节结构', '信息优先级'], cannot_say: ['脱离证据扩写结论'],
    capabilities: ['solution_design', 'narrative_design'], tools: ['structured_blackboard'],
  },
  {
    id: 'slide_architect', name: '幻灯片设计 Agent', archetype: 'slide_architect', relationship: '将故事线编译为可编辑 SlideSpec',
    interests: ['视觉层级', '演示节奏', '可编辑性'], stance: '避免逐字堆砌和重复版式',
    can_say: ['页型', '标题', '要点', '演讲备注'], cannot_say: ['为了填满页面而增加无依据内容'],
    capabilities: ['process_facilitation', 'slide_design'], tools: ['pptx_renderer'],
  },
  {
    id: 'deck_reviewer', name: '演示审校 Agent', archetype: 'quality_reviewer', relationship: '独立检查事实纪律、逻辑与可读性',
    interests: ['质量门控', '证据纪律', '受众适配'], stance: '不合格时给出可执行修订指令',
    can_say: ['问题清单', '质量评分', '修订要求'], cannot_say: ['替代人类做最终事实背书'],
    capabilities: ['risk_review', 'quality_assurance'], tools: ['structured_blackboard'],
  },
]

function makePhase(input: {
  id: string; name: string; purpose: string; kind: Phase['kind']; protocolId: string; dependsOn?: string[]; artifact: string; next?: string
}): Phase {
  const policy = input.id === 'deck_review'
    ? { ...POLICY, C: 'C4' as const }
    : POLICY
  const strategy = policyToLegacyCombo(policy, [])
  return {
    id: input.id, name: input.name, purpose: input.purpose, kind: input.kind,
    policy, modifiers: [], strategy, protocol_id: input.protocolId,
    config: { artifact: input.artifact }, depends_on: input.dependsOn ?? [], required: true,
    skippable_on_deadline: false, entry_conditions: ['dependencies_satisfied'], exit_conditions: ['artifact_valid'],
    transitions: input.next ? [{ condition: 'artifact_valid', target: input.next }] : [],
  }
}

function inferSlideCount(input: string): number {
  const match = input.match(/(\d{1,2})\s*(?:页|張|张|slides?)/i)
  return Math.min(20, Math.max(6, match ? Number(match[1]) : 10))
}

function inferTitle(input: string): string {
  return input
    .replace(/^(?:请|帮我|麻烦)?(?:用多智能体)?(?:生成|制作|创建|准备|设计|做)(?:一份|一个)?/i, '')
    .replace(/(?:pptx?|power\s*point|幻灯片|演示文稿|汇报材料).*/i, '')
    .replace(/^关于/, '')
    .trim()
    .slice(0, 42) || '多智能体协作演示文稿'
}

export async function compilePresentationScenario(
  userInput: string,
  profile: TaskProfile,
  onStep: CompileProgress,
  evidenceText = '',
): Promise<ScenarioConfig> {
  const scenarioId = `presentation_${Date.now()}`
  const brief: PresentationBrief = {
    kind: 'PresentationBrief', title: inferTitle(userInput), objective: userInput,
    audience: '根据用户描述推断；未明确时按通用决策受众处理', purpose: '清晰传达主题、证据与行动建议',
    language: /\benglish\b|英文/i.test(userInput) ? 'English' : '简体中文', tone: '专业、清晰、克制',
    slide_count: inferSlideCount(userInput), constraints: ['不得编造来源或数据', '每页只表达一个核心信息', '最终 PPTX 必须可编辑'],
  }
  onStep(2, '识别演示交付物', `目标：${brief.title} · ${brief.slide_count} 页 · ${brief.language}`, 0)

  const contracts = buildAgentContracts(PRESENTATION_AGENTS)
  onStep(3, '装配专业 Agent Pool', '资料规划 → 证据分析 → 叙事架构 → 幻灯片设计 → 独立审校', 0)

  const phases: Phase[] = [
    makePhase({ id: 'presentation_brief', name: '演示任务澄清', purpose: '锁定受众、目标、页数与内容边界', kind: 'analyze', protocolId: 'structured_synthesis_v1', artifact: 'PresentationBrief', next: 'research_plan' }),
    makePhase({ id: 'research_plan', name: '资料任务规划', purpose: '拆解研究问题、证据要求与资料缺口', kind: 'speak', protocolId: 'independent_commit_v1', dependsOn: ['presentation_brief'], artifact: 'PresentationResearchPlan', next: 'evidence_synthesis' }),
    makePhase({ id: 'evidence_synthesis', name: '证据提炼', purpose: '从用户输入和附件提炼证据卡，显式标记未经核验内容', kind: 'aggregate', protocolId: 'evidence_evaluation_v1', dependsOn: ['research_plan'], artifact: 'PresentationEvidenceCard[]', next: 'narrative_outline' }),
    makePhase({ id: 'narrative_outline', name: '叙事结构设计', purpose: '形成核心论点、故事线与章节结构', kind: 'analyze', protocolId: 'structured_synthesis_v1', dependsOn: ['evidence_synthesis'], artifact: 'PresentationOutline', next: 'slide_design' }),
    makePhase({ id: 'slide_design', name: 'SlideSpec 生成', purpose: '将结构编译为逐页可编辑内容与演讲备注', kind: 'propose', protocolId: 'structured_synthesis_v1', dependsOn: ['narrative_outline'], artifact: 'PresentationDeck', next: 'deck_review' }),
    makePhase({ id: 'deck_review', name: '独立质量审校', purpose: '检查逻辑、证据、信息密度与受众适配，并在必要时触发一次修订', kind: 'evaluate', protocolId: 'evidence_evaluation_v1', dependsOn: ['slide_design'], artifact: 'PresentationDeckReview', next: 'presentation_delivery' }),
    makePhase({ id: 'presentation_delivery', name: '演示文稿交付', purpose: '发布通过质量门控的 SlideSpec 和可编辑 PPTX 下载入口', kind: 'report', protocolId: 'audit_report_v1', dependsOn: ['deck_review'], artifact: 'PresentationDeck' }),
  ]
  onStep(4, '编译协作流水线', `${phases.length} 个检查点阶段，产物通过结构化黑板逐步交接`, 0)

  const scenarioSpec = {
    scenario_id: scenarioId, domain: 'presentation_production', objective: userInput,
    urgency: profile.time_pressure === 'urgent' ? 'high' as const : 'medium' as const,
    risk_level: 'medium' as const, reversibility: 'reversible' as const,
    stakeholders: contracts.map((agent) => agent.id),
    required_capabilities: ['stakeholder_analysis', 'solution_design', 'risk_review', 'process_facilitation'],
    authority_map: { recommend: contracts.map((agent) => agent.id), approve: ['human_authority'] },
    known_facts: evidenceText ? ['用户提供了可读取的附件材料'] : [],
    unknowns: evidenceText ? ['附件之外的事实仍需外部核验'] : ['当前未接入联网检索，外部事实与数据需要用户补充或人工核验'],
    hard_constraints: [...brief.constraints, 'Agent 只能生成内容建议，最终发布由用户决定'],
    success_criteria: ['交付完整可编辑 PPTX', '核心主张可追溯到证据卡', '证据缺口未被伪装成事实', '通过独立审校'],
  }
  const issueGraph = buildIssueGraph(userInput, scenarioId)
  const guards = { ...defaultGuardSet(profile), max_model_calls: 10, max_tokens: 45_000, minority_report_required: false }
  const strategy: StrategyCombo = policyToLegacyCombo(POLICY, [], ['演示文稿专业流水线'])
  const config: ScenarioConfig = {
    scenario_id: scenarioId, title: brief.title, user_input: userInput, profile: { ...profile, deliverable: 'presentation', task_type: 'collaborative', agent_count: 5 },
    strategy, agents: contracts, phases, scenario_spec: scenarioSpec, issue_graph: issueGraph, agent_contracts: contracts,
    phase_graph: { entry_phase_id: phases[0].id, phases }, guards, protocol: PROTOCOL_REGISTRY.structured_synthesis_v1,
    event_rules: [EVENT_RULE_REGISTRY.deadline_finalize_v1],
    terminal_states: ['DECIDED', 'PROVISIONAL', 'WAITING_FOR_EVIDENCE', 'HUMAN_ESCALATION', 'ABORTED'],
    compile_rationale: {
      selected_protocol: 'presentation_pipeline_v1',
      reasons: ['交付物需要研究、证据、叙事、版式和审校等不同能力顺序协作'],
      alternatives: ['single_agent_presentation'], confidence: 0.9, expected_model_calls: 6, expected_token_range: [8_000, 45_000],
    },
    case_context: evidenceText ? `${userInput}\n\n【用户附件材料】\n${evidenceText}` : userInput,
    hard_constraints: scenarioSpec.hard_constraints, presentation_brief: brief,
  }
  const validation = validateScenarioConfig(config)
  if (!validation.ok) throw new Error('Presentation ScenarioConfig 校验失败：' + validation.issues.map((item) => `${item.path}: ${item.message}`).join('；'))
  onStep(5, '稳定性预检', 'PhaseGraph、Agent 能力、协议和权限边界校验通过；未改动原有三轨道执行器', 0)
  return config
}
