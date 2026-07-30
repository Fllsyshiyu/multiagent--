/**
 * 预录剧本 · 小区广场舞场地之争（协作轨道，证明框架通用性）
 * 冲突结构：健身需求 vs 安宁权 vs 场地资源分配
 */
import type { ScriptData } from '../../engine/scripted'

export const squareDanceScript: ScriptData = {
  dispatch: {
    agent_count: 6,
    task_type: 'collaborative',
    game_type: null,
    domain: 'governance',
    time_pressure: 'relaxed',
    information_asymmetry: 'low',
    agent_relations: 'mixed',
    decision_pattern: 'single_shot',
    resource_scarcity: 'high',
    verifiability: 'partially',
    reasoning: '公共空间使用权的多方争议，健身与安宁诉求直接冲突，场地是稀缺资源 → 协作轨道',
  },

  agents: [
    {
      id: 'dancers_rep', name: '广场舞队代表', archetype: '直接受益者',
      relationship: '社区广场舞队领队，队员多为退休居民，每晚在小广场活动',
      interests: ['保留活动场地', '合理活动时段', '队伍稳定'],
      stance: '支持保留并规范',
      can_say: ['表达健身与社交需求', '提出自我管理方案'],
      cannot_say: ['不能否认噪声影响', '不能编造场地使用数据'],
    },
    {
      id: 'nearby_resident', name: '周边居民代表', archetype: '直接受影响者',
      relationship: '住在小广场对面楼栋，家中孩子晚间写作业，长期受音响困扰',
      interests: ['夜间安静', '孩子学习环境', '投诉有回应'],
      stance: '条件反对现状',
      can_say: ['表达噪声困扰', '要求音量与时段限制'],
      cannot_say: ['不能否认老人健身需求', '不能夸大影响程度'],
    },
    {
      id: 'night_shift_worker', name: '夜班工作者代表', archetype: '弱势或容易沉默的群体',
      relationship: '下夜班后白天补觉，也受傍晚音响影响，工作时间导致无法参加社区会议',
      interests: ['白天与傍晚的睡眠', '被纳入考虑'],
      stance: '反对但常被忽视',
      can_say: ['表达作息特殊性', '要求时段避开'],
      cannot_say: ['不能代表所有住户', '不能编造医学结论'],
    },
    {
      id: 'property_manager', name: '物业管理方', archetype: '治理方 / 执行主体',
      relationship: '负责小区公共场地日常管理与投诉处理',
      interests: ['减少投诉', '可执行的管理规则', '不增加过多人力成本'],
      stance: '中立，重在可执行',
      can_say: ['说明场地管理现状', '评估管理措施成本'],
      cannot_say: ['不能承诺无人力保障的措施', '不能偏袒任何一方'],
    },
    {
      id: 'culture_center', name: '社区文化中心', archetype: '治理方 / 资源主体',
      relationship: '掌握室内活动室等替代场地资源，负责社区文化活动安排',
      interests: ['文化活动有序开展', '场地资源高效利用'],
      stance: '协调型中立',
      can_say: ['提供替代场地信息', '协调活动室开放时间'],
      cannot_say: ['不能承诺超出容量的场地', '不能强制收费'],
    },
    {
      id: 'acoustic_expert', name: '声学专家', archetype: '专业观察者',
      relationship: '环境声学从业者，关注噪声测量与技术降噪手段',
      interests: ['用数据说话', '技术手段缓解矛盾'],
      stance: '建设性中立',
      can_say: ['说明分贝标准与测量方法', '介绍定向音响等技术'],
      cannot_say: ['不能编造测量数据', '不能做价值判断'],
    },
  ],

  first_round: {
    dancers_rep: {
      kind: 'InitialAssessmentCard', agent_id: 'dancers_rep',
      initial_stance: '条件支持',
      main_concerns: ['一刀切禁止会伤害老人健身需求', '队伍没有别处可去', '愿意自我管理'],
      proposal_sketch: ['限定晚间活动至 20:30 前', '队伍自律控制音量', '轮值监督员'],
      non_negotiables: ['不能完全禁止'],
      possible_concessions: ['提前结束时间', '调低音量', '使用耳机式或定向音响'],
      content: '我们三十多个老人，跳广场舞是一天里唯一的社交和锻炼。我们愿意守规矩，但"禁止"两个字，对我们就是晚年的生活质量打了对折。',
    },
    nearby_resident: {
      kind: 'InitialAssessmentCard', agent_id: 'nearby_resident',
      initial_stance: '条件反对',
      main_concerns: ['音响声穿窗而入孩子无法写作业', '投诉多次无人管', '周末也存在同样问题'],
      proposal_sketch: ['活动限时至 19:30 前结束', '音量必须可测量可监督', '投诉要有明确响应人'],
      non_negotiables: ['不能没有音量上限', '不能投诉无门'],
      possible_concessions: ['接受合理时段内的适度活动'],
      content: '我不是反对老人锻炼，我反对的是"我想开窗就得听伴奏"。孩子每天写作业要戴耳塞，这在任何一个居民区都不该是正常的。',
    },
    night_shift_worker: {
      kind: 'InitialAssessmentCard', agent_id: 'night_shift_worker',
      initial_stance: '反对',
      main_concerns: ['下夜班白天补觉被吵醒', '作息与常人相反，诉求总被忽略', '社区会议都在晚上开，自己永远缺席'],
      proposal_sketch: ['活动避开上午补觉时段', '任何调整要书面通知到楼'],
      non_negotiables: ['不能在上午 12 点前使用音响'],
      possible_concessions: ['接受下午与傍晚的规范活动'],
      content: '你们讨论"晚上八点前结束就行"的时候，忘了我早上八点才刚下班。这个小区里，作息相反的人也是居民。',
    },
    property_manager: {
      kind: 'InitialAssessmentCard', agent_id: 'property_manager',
      initial_stance: '中立',
      main_concerns: ['投诉量每月十几起', '没有可执行的音量标准', '人手不足以每晚巡查'],
      proposal_sketch: ['制定场地使用公约', '配置分贝仪抽检', '划定专用活动区'],
      non_negotiables: ['措施必须在现有预算人力内可执行'],
      possible_concessions: ['协调增加重点区域巡查'],
      content: '物业夹在中间：舞者说我们不管事，居民说我们护着舞者。没有白纸黑字的标准，我们执法式的管理根本站不住脚。',
    },
    culture_center: {
      kind: 'InitialAssessmentCard', agent_id: 'culture_center',
      initial_stance: '条件支持',
      main_concerns: ['室内活动室晚间利用率低', '雨天没有替代方案', '音响设备可以统筹'],
      proposal_sketch: ['开放室内活动室作为雨天与冬季替代', '统筹采购定向音响'],
      non_negotiables: ['室内容量有限不能全部转移'],
      possible_concessions: ['延长活动室开放时间'],
      content: '文化中心晚上教室空着一半，与其让矛盾和天气一起发酵，不如把资源盘活：能进室内的进室内，必须留室外的用技术降噪。',
    },
    acoustic_expert: {
      kind: 'InitialAssessmentCard', agent_id: 'acoustic_expert',
      initial_stance: '中立',
      main_concerns: ['双方对"吵不吵"没有共同数据基础', '定向音响可大幅减少扩散', '测量方法要简单可持续'],
      proposal_sketch: ['在对面楼栋窗台实测分贝', '划定音量上限与测量点位', '试点定向音响'],
      non_negotiables: ['任何限制都要有可测量的指标'],
      possible_concessions: ['提供低成本测量工具'],
      content: '这类纠纷我见过几十起：没有分贝数据，双方永远各说各话。定向音响能把正前方以外的声压降十几分贝，技术是现成的，缺的是把数据摆上桌。',
    },
  },

  proposals: [
    { kind: 'CandidateProposal', proposal_id: 'P1', title: '全面禁止广场舞', summary: '小区公共场地全天禁止使用音响设备跳舞，违者劝离。', supporters: [] },
    { kind: 'CandidateProposal', proposal_id: 'P2', title: '维持现状不加限制', summary: '不作统一规定，依靠队伍自觉与邻里协商。', supporters: [] },
    { kind: 'CandidateProposal', proposal_id: 'P3', title: '分时段分区域 + 定向音响试点', summary: '划定专用活动区，限定时段与音量上限，文化中心开放室内替代场地，试点定向音响并每月公布分贝数据。', supporters: ['dancers_rep', 'culture_center', 'acoustic_expert'] },
  ],

  scores: {
    dancers_rep: [
      { kind: 'PlanScoreCard', agent_id: 'dancers_rep', proposal_id: 'P1', support_score: 1, feasibility_score: 2, fairness_score: 1, risk_score: 3, main_objection: '禁止等于剥夺老人健身社交空间', support_condition: '不可能支持' },
      { kind: 'PlanScoreCard', agent_id: 'dancers_rep', proposal_id: 'P2', support_score: 4, feasibility_score: 5, fairness_score: 2, risk_score: 3, main_objection: '不限制对居民确实不公平', support_condition: '至少不禁止' },
      { kind: 'PlanScoreCard', agent_id: 'dancers_rep', proposal_id: 'P3', support_score: 4, feasibility_score: 4, fairness_score: 4, risk_score: 2, main_objection: '定向音响费用谁出', support_condition: '费用有着落、时段合理即可' },
    ],
    nearby_resident: [
      { kind: 'PlanScoreCard', agent_id: 'nearby_resident', proposal_id: 'P1', support_score: 3, feasibility_score: 3, fairness_score: 2, risk_score: 2, main_objection: '对老人过于粗暴，但确实安静', support_condition: '不得已的选择' },
      { kind: 'PlanScoreCard', agent_id: 'nearby_resident', proposal_id: 'P2', support_score: 1, feasibility_score: 5, fairness_score: 1, risk_score: 4, main_objection: '现状就是问题本身', support_condition: '不支持' },
      { kind: 'PlanScoreCard', agent_id: 'nearby_resident', proposal_id: 'P3', support_score: 4, feasibility_score: 3, fairness_score: 4, risk_score: 2, main_objection: '音量上限与测量点位要写明，投诉响应人是谁', support_condition: '有数据可监督即可支持' },
    ],
    night_shift_worker: [
      { kind: 'PlanScoreCard', agent_id: 'night_shift_worker', proposal_id: 'P1', support_score: 4, feasibility_score: 3, fairness_score: 2, risk_score: 2, main_objection: '一刀切但终于能睡觉', support_condition: '偏向支持' },
      { kind: 'PlanScoreCard', agent_id: 'night_shift_worker', proposal_id: 'P2', support_score: 1, feasibility_score: 5, fairness_score: 1, risk_score: 4, main_objection: '现状对我最糟', support_condition: '不支持' },
      { kind: 'PlanScoreCard', agent_id: 'night_shift_worker', proposal_id: 'P3', support_score: 3, feasibility_score: 4, fairness_score: 3, risk_score: 2, main_objection: '方案只写了晚间时段，没提上午禁音', support_condition: '加入上午 12 点前禁用音响条款' },
    ],
    property_manager: [
      { kind: 'PlanScoreCard', agent_id: 'property_manager', proposal_id: 'P1', support_score: 2, feasibility_score: 2, fairness_score: 2, risk_score: 3, main_objection: '执行禁止令人力成本最高、冲突最多', support_condition: '不推荐' },
      { kind: 'PlanScoreCard', agent_id: 'property_manager', proposal_id: 'P2', support_score: 2, feasibility_score: 5, fairness_score: 2, risk_score: 4, main_objection: '投诉会继续堆在物业', support_condition: '无法执行' },
      { kind: 'PlanScoreCard', agent_id: 'property_manager', proposal_id: 'P3', support_score: 4, feasibility_score: 4, fairness_score: 4, risk_score: 2, main_objection: '分贝仪与巡查排班要落实', support_condition: '预算内可执行' },
    ],
    culture_center: [
      { kind: 'PlanScoreCard', agent_id: 'culture_center', proposal_id: 'P1', support_score: 1, feasibility_score: 3, fairness_score: 2, risk_score: 3, main_objection: '社区文化活动不能一禁了之', support_condition: '不支持' },
      { kind: 'PlanScoreCard', agent_id: 'culture_center', proposal_id: 'P2', support_score: 2, feasibility_score: 5, fairness_score: 2, risk_score: 3, main_objection: '资源闲置与矛盾并存', support_condition: '无' },
      { kind: 'PlanScoreCard', agent_id: 'culture_center', proposal_id: 'P3', support_score: 5, feasibility_score: 4, fairness_score: 4, risk_score: 2, main_objection: '室内容量要排期管理', support_condition: '全力支持' },
    ],
    acoustic_expert: [
      { kind: 'PlanScoreCard', agent_id: 'acoustic_expert', proposal_id: 'P1', support_score: 1, feasibility_score: 2, fairness_score: 1, risk_score: 2, main_objection: '禁止令没有测量依据也难以执行', support_condition: '不支持' },
      { kind: 'PlanScoreCard', agent_id: 'acoustic_expert', proposal_id: 'P2', support_score: 1, feasibility_score: 5, fairness_score: 1, risk_score: 4, main_objection: '无数据现状是纠纷温床', support_condition: '不支持' },
      { kind: 'PlanScoreCard', agent_id: 'acoustic_expert', proposal_id: 'P3', support_score: 5, feasibility_score: 4, fairness_score: 4, risk_score: 1, main_objection: '需明确测量点位与频次', support_condition: '技术上完全成立' },
    ],
  },

  conflict: {
    kind: 'ConflictMap', leading_proposal: 'P3',
    main_supporters: ['dancers_rep', 'culture_center', 'acoustic_expert'],
    main_opponents: ['nearby_resident'],
    veto_risks: ['音量上限无法测量导致方案空转', '定向音响费用无人承担', '时段谈不拢导致舞者流失到非指定区域'],
    minority_opinions: ['夜班工作者要求上午禁音（作息相反群体容易被"晚间时段"框架排除）'],
    evidence_gaps: ['对面楼栋窗台实测分贝数据', '定向音响实际效果与报价', '受影响的夜班工作者人数'],
  },

  objections: {
    '1:nearby_resident': {
      kind: 'ObjectionCard', round: 1, agent_id: 'nearby_resident', objection_type: '利益受损反驳',
      objection: 'P3 写"音量上限"，但没有写上限是多少、在哪测、谁来测。没有这三条，上限就是一句口号。另外投诉响应人必须是实名岗位。',
      required_revision: ['写明音量上限数值（如边界 60 分贝）与测量点位', '物业指定投诉响应岗位与时限'],
      support_condition: '上限可测量、投诉有回应即可支持', reply_to: 'property_manager',
    },
    '1:dancers_rep': {
      kind: 'ObjectionCard', round: 1, agent_id: 'dancers_rep', objection_type: '利益受损反驳',
      objection: '我们可以接受限时限量，但 19:00 前结束对冬天来说太早，老人吃完饭出来天还没黑透。希望时段按季节调整。',
      required_revision: ['活动时段按季节弹性调整（如冬季至 19:30、夏季至 20:30）'],
      support_condition: '时段合理即可，我们出轮值监督员', reply_to: 'nearby_resident',
    },
    '1:property_manager': {
      kind: 'ObjectionCard', round: 1, agent_id: 'property_manager', objection_type: '可执行性反驳',
      objection: '每晚巡查不现实。建议改成"分贝仪定点抽检 + 公约轮值监督员 + 投诉触发式复测"的低成本机制。',
      required_revision: ['采用抽检 + 轮值监督 + 投诉复测的三层监督', '设备与排班写入执行清单'],
      support_condition: '预算内即可落地', reply_to: undefined,
    },
    '1:acoustic_expert': {
      kind: 'ObjectionCard', round: 1, agent_id: 'acoustic_expert', objection_type: '公共资源反驳',
      objection: '提醒：定向音响只能解决"扩散方向"问题，不能解决"总量"问题。上限分贝值必须先实测现状再设定，否则数字没有依据。',
      required_revision: ['先做一周现状分贝实测再定上限值', '定向音响试点前后对比测量并公布'],
      support_condition: '数据先行即支持', reply_to: undefined,
    },
    '2:nearby_resident': {
      kind: 'ObjectionCard', round: 2, agent_id: 'nearby_resident', objection_type: '利益受损反驳',
      objection: '听了专家和文化中心的方案，我认可数据路线。补一条：每月分贝数据要在楼栋公告栏公示，超标要有明确的处理流程。',
      required_revision: ['每月公示测量数据', '超标三次启动时段收紧机制'],
      support_condition: '有公示和收紧机制即撤回反对', reply_to: 'acoustic_expert',
    },
    '2:property_manager': {
      kind: 'ObjectionCard', round: 2, agent_id: 'property_manager', objection_type: '可执行性反驳',
      objection: '定向音响的采购费用建议走"文化中心统筹 + 队伍自筹一部分"，物业不承担设备费，但承担点位布线配合。',
      required_revision: ['设备费用文化中心统筹与队伍自筹', '物业负责点位与布线配合'],
      support_condition: '费用责任分清即可执行', reply_to: 'dancers_rep',
    },
    '2:night_shift_worker': {
      kind: 'ObjectionCard', round: 2, agent_id: 'night_shift_worker', objection_type: '利益受损反驳',
      objection: '我注意到两轮讨论都在谈"晚上几点前"，这对白班的人是合理的，但我是夜班。我的底线很简单：中午 12 点前场地禁用音响，写进公约。',
      required_revision: ['公约加入"每日 12:00 前禁止使用音响"条款', '调整结果书面通知到每个楼栋'],
      support_condition: '条款进公约即不再反对', reply_to: 'property_manager',
    },
    '2:culture_center': {
      kind: 'ObjectionCard', round: 2, agent_id: 'culture_center', objection_type: '普遍化反驳',
      objection: '雨天和冬季不能跳舞的日子，矛盾会转移到楼道和地下车库。室内活动室排期要和公约同步公布，形成"室外限时 + 室内兜底"的完整方案。',
      required_revision: ['室内活动室排期表与公约同步公示', '雨天自动启用室内场地'],
      support_condition: '方案完整即支持', reply_to: undefined,
    },
  },

  outer: {
    '1:night_shift_worker': {
      kind: 'OuterObservationCard', round: 1, agent_id: 'night_shift_worker',
      missed_issue: '讨论聚焦"晚间几点结束"，完全没有覆盖上午时段对夜班群体的影响',
      objection: '任何时段方案都要考虑作息相反的居民',
      evidence_needed: ['小区内夜班从业者大致人数'],
      request_to_enter_inner_circle: true, absorbed: true,
    },
    '1:culture_center': {
      kind: 'OuterObservationCard', round: 1, agent_id: 'culture_center',
      missed_issue: '雨天与冬季的替代场地没有被讨论',
      objection: '只解决晴天的方案会在雨季失效',
      evidence_needed: ['活动室容量与排期'],
      request_to_enter_inner_circle: true, absorbed: true,
    },
    '2:dancers_rep': {
      kind: 'OuterObservationCard', round: 2, agent_id: 'dancers_rep',
      missed_issue: '希望明确试点期，给队伍适应和证明的时间',
      objection: '规则收紧机制要有试点缓冲',
      evidence_needed: ['试点时长建议'],
      request_to_enter_inner_circle: false, absorbed: true,
    },
    '2:acoustic_expert': {
      kind: 'OuterObservationCard', round: 2, agent_id: 'acoustic_expert',
      missed_issue: '定向音响安装后的效果复测需要留档',
      objection: '试点前后对比数据是方案能否推广的关键',
      evidence_needed: ['试点前后分贝对比记录'],
      request_to_enter_inner_circle: false, absorbed: true,
    },
  },

  summaries: {
    '1': {
      kind: 'FishbowlSummaryCard', round: 1,
      inner_circle: ['nearby_resident', 'dancers_rep', 'property_manager', 'acoustic_expert'],
      outer_circle: ['night_shift_worker', 'culture_center'],
      majority_views: ['分时段分区域 + 定向音响试点（P3）是各方都能谈的框架'],
      minority_views: ['夜班工作者要求上午禁音，该群体作息与多数相反、易被遗漏'],
      core_conflicts: ['健身社交需求 vs 居家安宁', '管理成本 vs 监督有效性'],
      unanswered_questions: ['音量上限定多少、在哪测？', '定向音响费用谁出？', '上午时段是否禁音？'],
      absorbed_observations: ['上午禁音诉求进入第二轮必答', '雨天替代场地进入第二轮'],
      next_round_invitees: ['night_shift_worker', 'culture_center'],
    },
    '2': {
      kind: 'FishbowlSummaryCard', round: 2,
      inner_circle: ['nearby_resident', 'property_manager', 'night_shift_worker', 'culture_center'],
      outer_circle: ['dancers_rep', 'acoustic_expert'],
      majority_views: ['公约 + 数据公示 + 室内兜底构成完整可执行方案'],
      minority_views: ['舞者希望试点期与季节弹性（已记录并部分采纳）'],
      core_conflicts: ['设备费用分担比例待最终确认'],
      unanswered_questions: ['试点期多长？', '超标处理流程的具体触发条件？'],
      absorbed_observations: ['试点缓冲期已纳入', '前后对比测量已纳入'],
      next_round_invitees: [],
    },
  },

  final_proposal: {
    kind: 'FinalProposal',
    title: '广场舞场地分时分区与技术降噪试点方案',
    goal: '在保障居民安宁权与老人健身需求之间建立可测量、可执行、可复评的场地使用秩序',
    measures: [
      '划定专用活动区，活动时段按季节弹性：冬季至 19:30、夏季至 20:30',
      '每日 12:00 前场地禁止使用音响（保障夜班群体）',
      '先做一周现状分贝实测，据此设定边界音量上限（如 60 分贝）并公示',
      '采用"定点抽检 + 队伍轮值监督员 + 投诉复测"三层监督，物业设投诉响应岗位',
      '文化中心统筹并队伍自筹采购定向音响，物业配合点位布线',
      '每月在楼栋公告栏公示分贝数据，超标三次启动时段收紧机制',
      '文化中心室内活动室排期公示，雨天与冬季自动启用室内场地',
      '试点三个月复评，测量数据与投诉量作为调整依据',
    ],
    responsible_parties: ['物业（监督与投诉响应）', '广场舞队（自律与轮值监督）', '社区文化中心（场地与设备统筹）', '声学专家（测量方法支持）'],
    resources: '文化中心统筹 + 队伍自筹（设备）；物业现有预算（日常监督）',
    timeline: '现状实测 1 周 → 公约公示 1 周 → 试点 3 个月 → 复评调整',
    risk_control: ['音量上限基于实测数据设定', '超标收紧机制预先约定', '费用责任事前分清'],
    exit_mechanism: '试点期投诉量不降反升或数据持续超标时，方案退回重议；极端情况下移交街道调解',
    review_mechanism: '试点满三个月由物业与文化中心联合复评，公布分贝与投诉数据，调整时段与区域',
    revision_path: [
      '居民"上限不写明就是口号" → 实测先行 + 上限数值与点位公示',
      '夜班工作者"你们忘了我早上八点下班" → 公约加入 12:00 前禁音条款',
      '物业"每晚巡查不现实" → 改为抽检 + 轮值 + 投诉复测三层机制',
      '文化中心"雨季方案会失效" → 室内活动室排期兜底',
      '专家"定向音响不能解决总量" → 上限值实测设定 + 前后对比公布',
    ],
  },

  exam_objective: {
    red_line_gate: 'pass',
    red_line_notes: ['未触发红线：无编造法条与数据，方案含责任主体与资源来源'],
    objective_scores: [
      { module: '法律与强制规则', score: 9, comment: '未引用具体噪声污染防治法条款，仅按常识设定上限，扣 3 分' },
      { module: '安全与硬约束', score: 7, comment: '预算与人力约束明确，分贝上限待实测确认，扣 1 分' },
      { module: '事实与证据正确性', score: 7, comment: '定向音响降噪量描述为经验值，已要求实测验证，扣 1 分' },
      { module: '方案完整性', score: 6, comment: '责任、时间、资源、退出与复评齐备' },
      { module: '工件与过程可追踪性', score: 4, comment: '条款均可追溯至异议卡' },
      { module: '少数意见记录', score: 2, comment: '夜班群体诉求完整保留并被采纳' },
    ],
  },

  exam_subjective: {
    subjective_scores: [
      { module: '问题理解与冲突覆盖', score: 9, comment: '覆盖了健身、安宁、作息相反群体与管理成本四层冲突' },
      { module: '方案创新性', score: 8, comment: '分时分区 + 定向音响 + 数据公示的组合务实且有新意' },
      { module: '协作协调质量', score: 9, comment: '居民从条件反对转为附条件支持，舞者接受限量，物业获得可执行机制' },
      { module: '公平与少数意见保护', score: 9, comment: '最容易被忽视的夜班群体成为方案条款的受益者' },
      { module: '可执行性与适应性', score: 8, comment: '成本在预算内，季节弹性与收紧机制增强适应性' },
      { module: '推理透明度与修订路径', score: 7, comment: '修订路径完整，设备费用分担细节仍可更透明' },
    ],
    grade_comment: '方案把"禁与放"的二元对立转化为可测量的管理秩序，少数意见保护出色；法律依据引用是其短板。',
  },
}
