/**
 * 预录剧本 · 老旧小区加装电梯（协作轨道主展示案例）
 * 冲突结构：高楼层刚需 vs 低楼层受损 vs 租户弱势，治理方推进，专业方把关
 */
import type { ScriptData } from '../../engine/scripted'

export const elevatorScript: ScriptData = {
  dispatch: {
    agent_count: 6,
    task_type: 'collaborative',
    game_type: null,
    domain: 'governance',
    time_pressure: 'relaxed',
    information_asymmetry: 'medium',
    agent_relations: 'mixed',
    decision_pattern: 'single_shot',
    resource_scarcity: 'medium',
    verifiability: 'partially',
    reasoning: '涉及多个利益相关方的社区公共决策，存在明确利益冲突（高层受益、低层受损），需要协商与补偿机制 → 协作轨道',
  },

  agents: [
    {
      id: 'high_floor_resident', name: '高楼层住户代表', archetype: '直接受益者',
      relationship: '家住 6 楼，家中有 70 岁老人，上下楼困难，是加装电梯最积极的推动者',
      interests: ['尽快加装电梯', '控制分摊费用', '老人出行便利'],
      stance: '强烈支持加装',
      can_say: ['表达高层出行困难', '提出分摊方案建议'],
      cannot_say: ['不能否认低层采光受损', '不能编造出资能力数据'],
    },
    {
      id: 'low_floor_resident', name: '低楼层住户代表', archetype: '直接受影响者',
      relationship: '家住 1-2 楼，几乎用不到电梯，却可能承受采光遮挡、噪声和房价影响',
      interests: ['采光不受影响', '获得合理补偿', '不承担费用'],
      stance: '条件反对：无补偿则反对',
      can_say: ['表达采光与噪声担忧', '要求补偿机制'],
      cannot_say: ['不能否认高层老人的出行困难', '不能漫天要价'],
    },
    {
      id: 'tenants_rep', name: '租户代表', archetype: '弱势或容易沉默的群体',
      relationship: '租住在本楼，电梯与其关系间接，但担心房东以加装电梯为由涨租',
      interests: ['租金不因此被抬高', '居住稳定性'],
      stance: '中立偏担忧',
      can_say: ['表达租金上涨担忧', '要求租金保护承诺'],
      cannot_say: ['不能代表业主做决策', '不能编造租金数据'],
    },
    {
      id: 'community_committee', name: '社区居委会', archetype: '治理方 / 执行主体',
      relationship: '负责协调本楼加装电梯的意愿征询、公示与申报流程',
      interests: ['依法合规推进', '避免矛盾激化', '形成可复制经验'],
      stance: '中立偏支持，重在程序合规',
      can_say: ['说明审批与公示程序', '协调各方沟通'],
      cannot_say: ['不能强制任何一方签字', '不能承诺政策外的补贴'],
    },
    {
      id: 'elevator_engineer', name: '电梯工程师', archetype: '专业 / 执行主体',
      relationship: '电梯企业技术负责人，熟悉井道设计、造价与维保',
      interests: ['技术方案可行', '安全合规', '明确维保责任'],
      stance: '建设性中立',
      can_say: ['说明造价区间与技术选项', '指出安全与消防要求'],
      cannot_say: ['不能为促成交易隐瞒技术风险', '不能给出无依据的低价承诺'],
    },
    {
      id: 'urban_planner', name: '城市规划师', archetype: '专业观察者',
      relationship: '关注老旧小区更新中的公共空间与相邻权问题',
      interests: ['方案兼顾相邻权', '形成可推广的更新范式'],
      stance: '条件支持，重在方案设计质量',
      can_say: ['提出错层入户等设计建议', '评估对小区公共空间的影响'],
      cannot_say: ['不能代替业主做价值判断', '不能编造规划审批口径'],
    },
  ],

  first_round: {
    high_floor_resident: {
      kind: 'InitialAssessmentCard', agent_id: 'high_floor_resident',
      initial_stance: '强烈支持',
      main_concerns: ['老人爬楼困难已影响就医', '分摊费用过高会拖垮共识', '担心低层一票否决'],
      proposal_sketch: ['按楼层阶梯分摊', '尽快启动意愿征询', '申请政府补贴'],
      non_negotiables: ['不能无限期搁置'],
      possible_concessions: ['接受高层多分摊', '接受给予低层合理补偿'],
      content: '我家里老人 70 多岁了，每次去医院要两个人架着下楼。装电梯对我们不是改善，是刚需。我愿意高楼层多出点钱，但希望这件事能真正往前推，不要再拖三年。',
    },
    low_floor_resident: {
      kind: 'InitialAssessmentCard', agent_id: 'low_floor_resident',
      initial_stance: '条件反对',
      main_concerns: ['井道遮挡客厅采光', '施工期噪声与灰尘', '房价相对受损', '用不到却要承担潜在维修费'],
      proposal_sketch: ['无补偿不签字', '如要装必须错层入户远离我家窗户', '要求一次性补偿'],
      non_negotiables: ['没有书面补偿方案就不签字', '不能从我家窗户正前方建井道'],
      possible_concessions: ['补偿到位且设计避开采光面可同意'],
      content: '我不否认六楼老人难，但电梯井就杵在我家客厅窗户前面，采光、噪声、房价，三样都砸在我头上，我却一天都用不上。不谈补偿就签字，不可能。',
    },
    tenants_rep: {
      kind: 'InitialAssessmentCard', agent_id: 'tenants_rep',
      initial_stance: '中立偏担忧',
      main_concerns: ['房东借电梯涨价', '施工期居住环境恶化', '租户在决策中没有发言权'],
      proposal_sketch: ['要求社区公约承诺加装后不因此涨租', '施工期给租户提前告知'],
      non_negotiables: ['不能装完电梯就被迫搬走'],
      possible_concessions: ['接受施工期短期不便'],
      content: '装不装电梯，业主说了算，我们租户连签字的资格都没有。但装完第二天房东就要涨租的话，我们只能搬家。希望这个群体至少被看见。',
    },
    community_committee: {
      kind: 'InitialAssessmentCard', agent_id: 'community_committee',
      initial_stance: '条件支持',
      main_concerns: ['意愿征询比例要达到规定门槛', '补偿谈不拢会激化矛盾', '申报流程合规性'],
      proposal_sketch: ['按政策流程走意愿征询与公示', '引入第三方调解补偿谈判', '争取区级补贴名额'],
      non_negotiables: ['程序不能违法', '不能跳过公示'],
      possible_concessions: ['协调时间上配合各方'],
      content: '我们的职责是让这件事依法往前推，也让矛盾不升级。意愿比例、公示、申报，一步都不能少。补偿谈得拢，这电梯才装得成。',
    },
    elevator_engineer: {
      kind: 'InitialAssessmentCard', agent_id: 'elevator_engineer',
      initial_stance: '中立',
      main_concerns: ['井道选址要满足消防间距', '错层入户与平层入户的造价差异', '后期维保责任主体'],
      proposal_sketch: ['错层入户可减少对低层采光影响', '造价按配置在 45-60 万区间', '维保建议纳入物业统一管理'],
      non_negotiables: ['不能为满足采光诉求牺牲消防通道', '不能签无维保预算的合同'],
      possible_concessions: ['提供多种配置方案比价'],
      content: '从技术上说，这栋楼具备加装条件。错层入户可以把井道移出低层窗户正前方，造价每部大约 45 到 60 万。但我要提醒：便宜方案往往在维保上埋雷。',
    },
    urban_planner: {
      kind: 'InitialAssessmentCard', agent_id: 'urban_planner',
      initial_stance: '条件支持',
      main_concerns: ['相邻权保护', '小区公共空间与绿地占用', '形成可复制的更新范式'],
      proposal_sketch: ['井道贴邻山墙布置减少遮挡', '同步做小区适老化微更新', '建立加装电梯案例库'],
      non_negotiables: ['不能占用消防通道与集中绿地'],
      possible_concessions: ['接受分期实施'],
      content: '加装电梯是老旧小区更新的缩影。关键不是装不装，而是能不能形成一套"受益方付费、受损方获偿、程序透明"的范式，让其他楼栋可以照着做。',
    },
  },

  proposals: [
    {
      kind: 'CandidateProposal', proposal_id: 'P1', title: '全额集资立即加装',
      summary: '按楼层阶梯全额分摊费用，立即启动意愿征询与申报，低层补偿由高层业主内部协商。',
      supporters: ['high_floor_resident'],
    },
    {
      kind: 'CandidateProposal', proposal_id: 'P2', title: '暂缓搁置维持现状',
      summary: '暂不推进加装，等待政策补贴力度加大或楼栋共识自然形成。',
      supporters: [],
    },
    {
      kind: 'CandidateProposal', proposal_id: 'P3', title: '分层分摊 + 低层补偿的试点加装',
      summary: '按楼层阶梯分摊并叠加政府补贴，高层业主出资设立低层补偿基金，采用错层入户设计，居委会监督公示，试点一年后复评。',
      supporters: ['high_floor_resident', 'community_committee', 'urban_planner'],
    },
  ],

  scores: {
    high_floor_resident: [
      { kind: 'PlanScoreCard', agent_id: 'high_floor_resident', proposal_id: 'P1', support_score: 4, feasibility_score: 3, fairness_score: 3, risk_score: 3, main_objection: '担心没有补偿机制低层不签字', support_condition: '只要能有签字路径就支持' },
      { kind: 'PlanScoreCard', agent_id: 'high_floor_resident', proposal_id: 'P2', support_score: 1, feasibility_score: 5, fairness_score: 1, risk_score: 2, main_objection: '搁置等于判了老人"爬楼无期"', support_condition: '不可能支持' },
      { kind: 'PlanScoreCard', agent_id: 'high_floor_resident', proposal_id: 'P3', support_score: 5, feasibility_score: 4, fairness_score: 4, risk_score: 3, main_objection: '补贴名额能否拿到不确定', support_condition: '愿意多分摊换取尽快落地' },
    ],
    low_floor_resident: [
      { kind: 'PlanScoreCard', agent_id: 'low_floor_resident', proposal_id: 'P1', support_score: 1, feasibility_score: 2, fairness_score: 1, risk_score: 4, main_objection: '没有任何补偿安排，直接损害低层权益', support_condition: '无补偿不签字' },
      { kind: 'PlanScoreCard', agent_id: 'low_floor_resident', proposal_id: 'P2', support_score: 4, feasibility_score: 5, fairness_score: 3, risk_score: 1, main_objection: '对高层确实不公平，但目前损失为零', support_condition: '默认现状即可' },
      { kind: 'PlanScoreCard', agent_id: 'low_floor_resident', proposal_id: 'P3', support_score: 3, feasibility_score: 3, fairness_score: 4, risk_score: 3, main_objection: '补偿基金数额与采光实测依据还没有', support_condition: '补偿写进书面协议且井道避开采光面后可支持' },
    ],
    tenants_rep: [
      { kind: 'PlanScoreCard', agent_id: 'tenants_rep', proposal_id: 'P1', support_score: 2, feasibility_score: 3, fairness_score: 2, risk_score: 4, main_objection: '没有租金保护条款', support_condition: '要求租金保护' },
      { kind: 'PlanScoreCard', agent_id: 'tenants_rep', proposal_id: 'P2', support_score: 3, feasibility_score: 5, fairness_score: 3, risk_score: 2, main_objection: '维持现状对租户最稳', support_condition: '无所谓' },
      { kind: 'PlanScoreCard', agent_id: 'tenants_rep', proposal_id: 'P3', support_score: 3, feasibility_score: 4, fairness_score: 3, risk_score: 3, main_objection: '试点复评里要包含租金监测', support_condition: '社区公约承诺不因此涨租' },
    ],
    community_committee: [
      { kind: 'PlanScoreCard', agent_id: 'community_committee', proposal_id: 'P1', support_score: 2, feasibility_score: 2, fairness_score: 2, risk_score: 4, main_objection: '绕开补偿谈判会激化矛盾，程序风险大', support_condition: '必须先达成补偿共识' },
      { kind: 'PlanScoreCard', agent_id: 'community_committee', proposal_id: 'P2', support_score: 2, feasibility_score: 5, fairness_score: 2, risk_score: 2, main_objection: '搁置会让老龄楼栋矛盾持续积累', support_condition: '不得已才选' },
      { kind: 'PlanScoreCard', agent_id: 'community_committee', proposal_id: 'P3', support_score: 4, feasibility_score: 4, fairness_score: 4, risk_score: 3, main_objection: '公示与复评的人手要落实', support_condition: '程序合规即可推进' },
    ],
    elevator_engineer: [
      { kind: 'PlanScoreCard', agent_id: 'elevator_engineer', proposal_id: 'P1', support_score: 3, feasibility_score: 3, fairness_score: 2, risk_score: 3, main_objection: '赶工容易压低配置牺牲维保', support_condition: '明确维保预算' },
      { kind: 'PlanScoreCard', agent_id: 'elevator_engineer', proposal_id: 'P2', support_score: 1, feasibility_score: 5, fairness_score: 1, risk_score: 1, main_objection: '搁置不是技术问题', support_condition: '无' },
      { kind: 'PlanScoreCard', agent_id: 'elevator_engineer', proposal_id: 'P3', support_score: 4, feasibility_score: 4, fairness_score: 4, risk_score: 2, main_objection: '错层入户造价略高需提前告知', support_condition: '技术上完全可行' },
    ],
    urban_planner: [
      { kind: 'PlanScoreCard', agent_id: 'urban_planner', proposal_id: 'P1', support_score: 2, feasibility_score: 3, fairness_score: 2, risk_score: 3, main_objection: '缺少相邻权保护设计', support_condition: '补设计' },
      { kind: 'PlanScoreCard', agent_id: 'urban_planner', proposal_id: 'P2', support_score: 1, feasibility_score: 5, fairness_score: 1, risk_score: 2, main_objection: '老旧小区更新不能一直等', support_condition: '不支持' },
      { kind: 'PlanScoreCard', agent_id: 'urban_planner', proposal_id: 'P3', support_score: 4, feasibility_score: 4, fairness_score: 4, risk_score: 2, main_objection: '希望同步纳入适老化微更新', support_condition: '可作为范式推广' },
    ],
  },

  conflict: {
    kind: 'ConflictMap', leading_proposal: 'P3',
    main_supporters: ['high_floor_resident', 'community_committee'],
    main_opponents: ['low_floor_resident'],
    veto_risks: ['低层住户拒绝签字导致意愿征询不达标', '补偿基金数额谈崩', '补贴名额落选导致分摊超预算'],
    minority_opinions: ['租户担心加装后被涨租、被迫搬走（无签字权但承担后果）'],
    evidence_gaps: ['低层采光受影响程度的实测数据', '本楼业主真实出资能力调查', '区级补贴名额与申请条件'],
  },

  objections: {
    '1:low_floor_resident': {
      kind: 'ObjectionCard', round: 1, agent_id: 'low_floor_resident', objection_type: '利益受损反驳',
      objection: 'P3 只说"设立补偿基金"，但基金从哪来、补多少、按什么标准，一个字没写。我家客厅采光面实测会被挡多少，也没有数据。空口补偿，我不能接受。',
      required_revision: ['补偿标准与出资方写进书面协议', '加装前做采光影响实测并公示', '井道必须采用错层入户避开我家采光面'],
      support_condition: '补偿白纸黑字 + 采光实测公示后，投赞成票', reply_to: 'high_floor_resident',
    },
    '1:high_floor_resident': {
      kind: 'ObjectionCard', round: 1, agent_id: 'high_floor_resident', objection_type: '利益受损反驳',
      objection: '我理解低层要补偿，也接受高层多出。但如果补偿金额没有上限地谈，这件事照样谈不成。老人等不起下一个三年。',
      required_revision: ['补偿金额参照周边楼栋案例设定区间', '设定谈判时限，超时引入第三方调解'],
      support_condition: '补偿在案例区间内即可接受', reply_to: 'low_floor_resident',
    },
    '1:community_committee': {
      kind: 'ObjectionCard', round: 1, agent_id: 'community_committee', objection_type: '可执行性反驳',
      objection: 'P3 没有写清意愿征询的比例门槛、公示天数和申报时序。程序不合规，方案再好也会被投诉推翻。',
      required_revision: ['补充意愿征询比例、公示期与申报流程', '补偿协议由居委会见证备案', '设立异议反馈渠道'],
      support_condition: '程序条款补齐后立即启动', reply_to: undefined,
    },
    '1:urban_planner': {
      kind: 'ObjectionCard', round: 1, agent_id: 'urban_planner', objection_type: '普遍化反驳',
      objection: '如果每个楼栋都只做"一事一议"，城市层面就没有可复制的规则。P3 应当沉淀为标准流程，否则下一个楼栋还要从零吵起。',
      required_revision: ['将分摊比例、补偿区间、程序节点整理为楼栋加装操作指引', '试点数据回流区级案例库'],
      support_condition: '方案包含可复制指引即支持', reply_to: undefined,
    },
    '2:low_floor_resident': {
      kind: 'ObjectionCard', round: 2, agent_id: 'low_floor_resident', objection_type: '利益受损反驳',
      objection: '听了工程师的测算，错层入户能解决采光问题。但我还要求一条：施工期噪声和建筑垃圾要有时间限制和责任人。',
      required_revision: ['施工限定工作日白天时段', '建筑垃圾每日清运，责任人写明'],
      support_condition: '加上施工管理条款即可签字', reply_to: 'elevator_engineer',
    },
    '2:community_committee': {
      kind: 'ObjectionCard', round: 2, agent_id: 'community_committee', objection_type: '可执行性反驳',
      objection: '分摊比例我建议按"楼层系数法"：1-2 层不出资且获得补偿，3 层起步递增，6 层系数最高。补贴落选时的兜底方案也要提前写。',
      required_revision: ['写明楼层系数分摊表', '补贴落选时高层按比例补足差额，且设总金额上限'],
      support_condition: '分摊表经全楼公示无异议', reply_to: undefined,
    },
    '2:tenants_rep': {
      kind: 'ObjectionCard', round: 2, agent_id: 'tenants_rep', objection_type: '利益受损反驳',
      objection: '我们整轮讨论都在谈业主的钱，没有人谈租户的租金。我的要求很简单：社区公约里加一句"加装电梯不构成涨租理由"，试点期内租金变动要向居委会报备。',
      required_revision: ['社区公约加入租金保护条款', '试点期租金变动报备制度'],
      support_condition: '有条款即不再反对', reply_to: 'community_committee',
    },
    '2:elevator_engineer': {
      kind: 'ObjectionCard', round: 2, agent_id: 'elevator_engineer', objection_type: '公共资源反驳',
      objection: '提醒一点：电梯是 15 年以上的长期资产。维保费、年检费、电费每年约 1.2-1.8 万，如果分摊方案只管"装"不管"养"，五年后还会爆发一次矛盾。',
      required_revision: ['设立维保共管账户，按楼层系数年缴', '维保责任主体写入合同', '一年后复评时同时审查维保账户余额'],
      support_condition: '维保条款齐备即技术上无保留支持', reply_to: undefined,
    },
  },

  outer: {
    '1:tenants_rep': {
      kind: 'OuterObservationCard', round: 1, agent_id: 'tenants_rep',
      missed_issue: '整个内圈都在谈业主的分摊和补偿，没有人谈租户的租金风险',
      objection: '租户没有签字权，却可能承担加装后涨租的后果',
      evidence_needed: ['本小区近年租金变动情况'],
      request_to_enter_inner_circle: true, absorbed: true,
    },
    '1:elevator_engineer': {
      kind: 'OuterObservationCard', round: 1, agent_id: 'elevator_engineer',
      missed_issue: '错层入户的具体技术方案和造价差异没有被讨论',
      objection: '不比较技术方案就谈补偿，补偿依据不充分',
      evidence_needed: ['错层入户与平层入户造价对比', '井道消防间距规范'],
      request_to_enter_inner_circle: true, absorbed: true,
    },
    '2:high_floor_resident': {
      kind: 'OuterObservationCard', round: 2, agent_id: 'high_floor_resident',
      missed_issue: '希望方案里给出明确的时间表，老人等不起',
      objection: '流程合规没问题，但要有各节点的完成时限',
      evidence_needed: ['申报审批平均周期'],
      request_to_enter_inner_circle: false, absorbed: true,
    },
    '2:urban_planner': {
      kind: 'OuterObservationCard', round: 2, agent_id: 'urban_planner',
      missed_issue: '井道选址与小区消防通道的关系需最终确认',
      objection: '选址图应在签字前随补偿协议一并公示',
      evidence_needed: ['井道选址图与消防间距复核'],
      request_to_enter_inner_circle: false, absorbed: true,
    },
  },

  summaries: {
    '1': {
      kind: 'FishbowlSummaryCard', round: 1,
      inner_circle: ['low_floor_resident', 'high_floor_resident', 'community_committee', 'urban_planner'],
      outer_circle: ['tenants_rep', 'elevator_engineer'],
      majority_views: ['分层分摊 + 低层补偿的试点方向（P3）获得多数认可'],
      minority_views: ['租户群体担心加装后被涨租，该群体无签字权但承担后果'],
      core_conflicts: ['高层出行刚需 vs 低层采光与补偿', '尽快推进 vs 程序合规'],
      unanswered_questions: ['补偿标准与出资方如何书面化？', '意愿征询与公示的具体程序？', '租金保护条款是否纳入？'],
      absorbed_observations: ['租户租金风险需进入第二轮必答', '错层入户技术方案需工程师现场说明'],
      next_round_invitees: ['tenants_rep', 'elevator_engineer'],
    },
    '2': {
      kind: 'FishbowlSummaryCard', round: 2,
      inner_circle: ['low_floor_resident', 'community_committee', 'tenants_rep', 'elevator_engineer'],
      outer_circle: ['high_floor_resident', 'urban_planner'],
      majority_views: ['楼层系数分摊 + 书面补偿协议 + 施工管理条款构成可执行路径'],
      minority_views: ['高层希望时间表再紧凑一些（记录但不影响共识）'],
      core_conflicts: ['补偿金额区间的最终确认'],
      unanswered_questions: ['采光实测数据何时公示？', '补贴落选兜底上限是多少？'],
      absorbed_observations: ['时间表与选址图公示要求已纳入方案'],
      next_round_invitees: [],
    },
  },

  final_proposal: {
    kind: 'FinalProposal',
    title: '电梯加装分层分摊与低层补偿试点方案',
    goal: '在保障低层相邻权与租户居住稳定的前提下，依法合规完成本楼电梯加装，并形成可复制的操作指引',
    measures: [
      '采用错层入户设计，井道避开低层采光面，选址图随方案公示',
      '楼层系数分摊：1-2 层不出资并获得补偿，3-6 层按系数递增分摊',
      '设立低层补偿基金，标准参照周边楼栋案例区间，协议由居委会见证备案',
      '申请区级加装补贴，落选时高层按比例补足差额并设总金额上限',
      '施工限定工作日白天时段，建筑垃圾每日清运并明确责任人',
      '社区公约加入"加装电梯不构成涨租理由"条款，试点期租金变动向居委会报备',
      '设立维保共管账户按年缴纳，维保责任主体写入合同',
      '试点满一年复评，同时审查使用满意度与维保账户余额',
    ],
    responsible_parties: ['社区居委会（程序与见证）', '电梯企业（施工与维保）', '高层业主（分摊与补偿出资）', '物业（日常管理配合）'],
    resources: '业主分摊 + 区级补贴 + 补偿基金（高层业主出资）',
    timeline: '意愿征询 2 周 → 公示 10 天 → 申报审批约 2 个月 → 施工约 3 个月 → 一年后复评',
    risk_control: ['采光实测公示后方可签约', '补偿协议书面化并备案', '补贴落选兜底上限提前约定', '施工投诉渠道公示'],
    exit_mechanism: '意愿征询不达标或采光实测严重影响低层时，方案中止并退回讨论；复评不达标时停用整改',
    review_mechanism: '试点满一年由居委会组织复评，评估投诉量、使用满意度、维保账户与租金变动',
    revision_path: [
      '低层"空口补偿不可接受" → 补偿标准书面化 + 采光实测公示',
      '居委会"程序不合规会被推翻" → 补齐征询比例、公示期与申报时序',
      '租户"租金风险无人谈" → 社区公约加入租金保护条款',
      '工程师"只管装不管养五年后再爆发" → 设立维保共管账户',
      '规划师"一事一议无法复制" → 沉淀为楼栋加装操作指引',
    ],
  },

  exam_objective: {
    red_line_gate: 'pass',
    red_line_notes: ['未触发红线：方案明确标注"AI 议事结果不替代真实决策"，包含责任主体，无编造法条'],
    objective_scores: [
      { module: '法律与强制规则', score: 10, comment: '程序引用加装电梯意愿征询与公示要求，但未标注具体政策文号，扣 2 分' },
      { module: '安全与硬约束', score: 7, comment: '消防间距要求明确，但缺少结构安全鉴定环节，扣 1 分' },
      { module: '事实与证据正确性', score: 6, comment: '造价区间与维保费用为经验估算值，未给出引用来源，扣 2 分' },
      { module: '方案完整性', score: 6, comment: '责任主体、时间、资金、退出与复评机制齐备' },
      { module: '工件与过程可追踪性', score: 4, comment: '每项条款均可追溯至具体异议卡与轮次' },
      { module: '少数意见记录', score: 2, comment: '租户租金保护与高层时间表诉求均被记录并回应' },
    ],
  },

  exam_subjective: {
    subjective_scores: [
      { module: '问题理解与冲突覆盖', score: 9, comment: '识别了高层刚需、低层受损、租户弱势三层冲突，未停留在表面' },
      { module: '方案创新性', score: 8, comment: '楼层系数分摊 + 租金保护条款 + 维保共管账户是较完整的组合机制' },
      { module: '协作协调质量', score: 10, comment: '两轮鱼缸中发生了真实质询、回应与让步（低层从反对到提条件、高层接受分摊上限）' },
      { module: '公平与少数意见保护', score: 8, comment: '无签字权的租户被纳入公约保护，低层获得补偿通道' },
      { module: '可执行性与适应性', score: 8, comment: '有时间表、兜底上限与复评机制；补贴名额不确定性已设对冲' },
      { module: '推理透明度与修订路径', score: 7, comment: '修订路径清晰，但个别条款（施工时段）未注明来源异议' },
    ],
    grade_comment: '方案从"装不装"推进到"怎么装、谁出钱、如何补偿、怎样养"，协作质量高；证据引用与政策文号是其主要短板。',
  },
}
