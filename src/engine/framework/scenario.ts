import type {
  AgentCard, AgentContract, GuardSet, IssueGraph, ScenarioSpec, TaskProfile,
} from '../types'

const REQUIRED_CAPABILITIES = ['stakeholder_analysis', 'solution_design', 'risk_review', 'process_facilitation']

function urgency(profile: TaskProfile): ScenarioSpec['urgency'] {
  if (profile.time_pressure === 'urgent') return 'high'
  if (profile.time_pressure === 'sustained') return 'medium'
  return 'low'
}

function riskLevel(profile: TaskProfile): ScenarioSpec['risk_level'] {
  if (profile.verifiability === 'subjective' && profile.resource_scarcity === 'high') return 'high'
  if (profile.agent_relations === 'adversarial' || profile.information_asymmetry === 'high') return 'medium'
  return 'low'
}

export function buildScenarioSpec(userInput: string, profile: TaskProfile, agents: AgentCard[]): ScenarioSpec {
  const risk = riskLevel(profile)
  return {
    scenario_id: `scenario_${Date.now()}`,
    domain: profile.domain,
    objective: userInput,
    urgency: urgency(profile),
    risk_level: risk,
    reversibility: risk === 'high' || risk === 'critical' ? 'partially_reversible' : 'reversible',
    stakeholders: agents.map((agent) => agent.id),
    required_capabilities: [...REQUIRED_CAPABILITIES],
    authority_map: { recommend: agents.map((agent) => agent.id), approve: ['human_authority'] },
    known_facts: [],
    unknowns: ['需要通过真实调研核验事实、数据、权限和资源条件'],
    hard_constraints: [
      '不得违反法律法规或明确安全条件',
      '不得将未验证主张升级为事实',
      '不得编造证据、数据或权限',
      'AI Agent 只能提出建议，不拥有最终批准权',
    ],
    success_criteria: ['必要利益相关方被覆盖', '关键冲突得到回应或被明确保留', '方案包含责任主体、资源、时间和退出机制'],
  }
}

export function buildIssueGraph(userInput: string, scenarioId: string): IssueGraph {
  const root = `${scenarioId}_root`
  return {
    root_issue_id: root,
    issues: [
      { id: root, title: userInput.slice(0, 40), description: userInput, depends_on: [], stakeholder_ids: [], status: 'open' },
      { id: `${scenarioId}_stakeholders`, title: '利益相关方与目标边界', description: '确认必要参与方、原始目标、成功标准和不可变约束', depends_on: [root], stakeholder_ids: [], status: 'open' },
      { id: `${scenarioId}_evidence`, title: '事实、证据与未知项', description: '区分已确认事实、未验证主张和证据缺口', depends_on: [root], stakeholder_ids: [], status: 'open' },
      { id: `${scenarioId}_conflicts`, title: '决策相关冲突与少数意见', description: '识别、路由并保留事实、利益、价值、程序、权限和资源冲突', depends_on: [`${scenarioId}_stakeholders`], stakeholder_ids: [], status: 'open' },
      { id: `${scenarioId}_solution`, title: '候选方案与执行条件', description: '形成含责任、资源、时间、风险、退出和复评机制的方案', depends_on: [`${scenarioId}_evidence`, `${scenarioId}_conflicts`], stakeholder_ids: [], status: 'open' },
      { id: `${scenarioId}_authority`, title: '强制门槛与授权边界', description: '完成安全、证据、少数意见和最终权限检查', depends_on: [`${scenarioId}_solution`], stakeholder_ids: [], status: 'open' },
    ],
  }
}

export function buildAgentContracts(agents: AgentCard[]): AgentContract[] {
  return agents.map((agent, index) => {
    const primary = REQUIRED_CAPABILITIES[index % REQUIRED_CAPABILITIES.length]
    const capabilities = [...new Set([primary, ...(agent.capabilities ?? [])])]
    return {
      ...agent,
      capabilities,
      tools: agent.tools ?? [],
      authority: agent.authority ?? { can_recommend: true, can_approve: false, can_block_on_violation: /合规|安全|审查|治理/.test(agent.archetype + agent.name) },
      sop: agent.sop ?? [
        'read_assigned_artifacts',
        'identify_role_constraints_and_unknowns',
        'separate_facts_from_claims',
        'produce_required_artifact',
        'self_check_evidence_permissions_and_risks',
      ],
      visibility: agent.visibility ?? ['public'],
    }
  }).map((contract, index, all) => {
    if (index >= REQUIRED_CAPABILITIES.length || all.length < REQUIRED_CAPABILITIES.length) return contract
    return { ...contract, capabilities: [...new Set([...contract.capabilities, REQUIRED_CAPABILITIES[index]])] }
  })
}

export function defaultGuardSet(profile: TaskProfile): GuardSet {
  const urgent = profile.time_pressure === 'urgent'
  return {
    max_tokens: urgent ? 45_000 : 120_000,
    max_model_calls: urgent ? 40 : 80,
    hard_timeout_ms: urgent ? 10 * 60_000 : 30 * 60_000,
    soft_limit_ratio: 0.8,
    reserved_finalization_ratio: 0.1,
    human_authority_required: true,
    minority_report_required: true,
    mock_fallback_forbidden: false,
    mandatory_gates: ['safety_validation', 'authority_validation', 'evidence_integrity'],
  }
}
