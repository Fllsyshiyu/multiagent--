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
  return {
    root_issue_id: `${scenarioId}_root`,
    issues: [{
      id: `${scenarioId}_root`, title: userInput.slice(0, 40), description: userInput,
      depends_on: [], stakeholder_ids: [], status: 'open',
    }],
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
