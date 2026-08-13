/**
 * 内置博弈规格与注册表。
 * 狼人杀只是其中一个数据实例，不是引擎硬编码。
 */
import type { GameSpec } from './game-types'

const POLICY = {
  setup: { A: 'A1', B: 'B3', C: 'C1', D: 'D1', E: 'E1' } as const,
  night: { A: 'A2', B: 'B3', C: 'C1', D: 'D1', E: 'E1' } as const,
  day: { A: 'A1', B: 'B3', C: 'C1', D: 'D1', E: 'E1' } as const,
  vote: { A: 'A1', B: 'B3', C: 'C1', D: 'D2', E: 'E5' } as const,
  end: { A: 'A3', B: 'B2', C: 'C1', D: 'D2', E: 'E1' } as const,
}

export const WEREWOLF_SPEC: GameSpec = {
  game_type: 'werewolf',
  name: '狼人杀',
  description: '信息不对称的阵营对抗游戏。夜晚狼人私聊并袭击，预言家查验，女巫用药；白天公开发言并投票淘汰。',
  min_players: 6,
  max_players: 18,
  roles: [
    { id: 'werewolf', name: '狼人', team: 'wolf', description: '夜晚与同伴私聊并选择袭击目标；白天隐藏身份。', actions: ['wolf_talk', 'wolf_kill'] },
    { id: 'seer', name: '预言家', team: 'good', description: '每晚查验一名玩家身份。', actions: ['seer_check'] },
    { id: 'witch', name: '女巫', team: 'good', description: '拥有一瓶解药和一瓶毒药。', actions: ['witch_decide'] },
    { id: 'villager', name: '平民', team: 'good', description: '无特殊能力，通过发言和投票找出狼人。', actions: [] },
  ],
  actions: [
    {
      id: 'wolf_talk', name: '狼人私聊', primitive: 'private_chat', role: 'werewolf', audience: 'team',
      prompt: '你是狼人杀玩家「{name}」（{id}），身份：狼人。同伴是 {teammates}。现在是夜晚，请在私密频道与同伴商议今晚袭击谁。',
      output_schema: '{"content":"<40字内私聊内容>","suggest_target":"<建议袭击的玩家id>"}',
    },
    {
      id: 'wolf_kill', name: '狼人袭击', primitive: 'select_target', role: 'werewolf', audience: 'team',
      prompt: '你是狼人。请给出今晚最终的袭击目标。',
      output_schema: '{"target":"<玩家id>"}',
    },
    {
      id: 'seer_check', name: '预言家查验', primitive: 'inspect_role', role: 'seer', audience: 'self',
      prompt: '你是预言家，请选择一名玩家查验身份。',
      output_schema: '{"target":"<玩家id>","reason":"<30字内>"}',
    },
    {
      id: 'witch_decide', name: '女巫用药', primitive: 'decide_life', role: 'witch', audience: 'self',
      prompt: '你是女巫。今晚 {victim} 被狼人袭击。你有一瓶解药和一瓶毒药，请决定是否用药。',
      output_schema: '{"use_antidote":<true|false>,"poison_target":"<玩家id或null>"}',
    },
    {
      id: 'day_speech', name: '白天发言', primitive: 'public_speech', role: 'all', audience: 'public',
      prompt: '你是狼人杀玩家「{name}」（{id}）。请发表白天发言。',
      output_schema: '{"content":"<80字内发言>","suspect":"<最怀疑的玩家id或null>"}',
    },
    {
      id: 'day_vote', name: '投票', primitive: 'vote', role: 'all', audience: 'public',
      prompt: '请投出你认为最像狼人的一名玩家（不能投自己）。',
      output_schema: '{"target":"<玩家id>","reason":"<25字内>"}',
    },
    {
      id: 'resolve_night', name: '结算夜晚', primitive: 'resolve_night', role: '__system', audience: 'god',
      prompt: '结算夜晚结果。',
      output_schema: '{}',
    },
    {
      id: 'resolve_vote', name: '计票淘汰', primitive: 'resolve_vote', role: '__system', audience: 'public',
      prompt: '统计投票并淘汰得票最多者。',
      output_schema: '{}',
    },
  ],
  composition: {
    fixed: [{ role: 'seer', count: 1 }, { role: 'witch', count: 1 }],
    ratio: [{ role: 'werewolf', denominator: 3, min: 2 }],
    fill_role: 'villager',
    by_player_count: {
      '6': ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'],
    },
  },
  phases: [
    { id: 'setup', name: '秘密角色分派', purpose: '身份按 B3 角色路由，仅本人可见', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'night', name: '夜晚行动', purpose: '狼人私聊与袭击、预言家查验、女巫用药', kind: 'action', participants: ['werewolf', 'seer', 'witch'], actions: ['wolf_talk', 'wolf_kill', 'seer_check', 'witch_decide'], policy: POLICY.night, order: 'sequential', round: 1 },
    { id: 'day', name: '白天发言', purpose: 'A1 全体激活 + B3 角色路由', kind: 'speak', participants: 'all_alive', actions: ['resolve_night', 'day_speech'], policy: POLICY.day, order: 'sequential', round: 1 },
    { id: 'vote', name: '投票表决', purpose: 'E5 投票决议，得票最多者出局', kind: 'vote', participants: 'all_alive', actions: ['day_vote', 'resolve_vote'], policy: POLICY.vote, order: 'simultaneous', round: 1 },
    { id: 'end', name: '复盘', purpose: '胜负判定与策略复用清单', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'good_win', description: '所有狼人被淘汰，好人阵营获胜', type: 'role_eliminated', role: 'werewolf', winner: 'good', winner_label: '好人阵营获胜' },
    { id: 'wolf_win', description: '狼人数量不少于好人数量，狼人阵营获胜', type: 'team_ge', team_a: 'wolf', team_b: 'good', winner: 'wolf', winner_label: '狼人阵营获胜' },
  ],
  fallback_rule: '若胜负尚不明确，则本局作为一个完整昼夜循环的演示，继续追踪存活玩家与阵营。',
  game_loop: {
    cycle_phase_ids: ['night', 'day', 'vote'],
    max_rounds: 4,
    break_on_winner: true,
  },
}

export const UNDERCOVER_SPEC: GameSpec = {
  game_type: 'undercover',
  name: '谁是卧底',
  description: '所有玩家各自拿到一个词语。多数人拿到相同词，一名卧底拿到相近但不同的词。玩家轮流描述，通过发言差异投票淘汰卧底。',
  min_players: 5,
  max_players: 10,
  roles: [
    { id: 'civilian', name: '平民', team: 'civilian', description: '你拿到的词是「苹果」。不要直接说出这个词，用模糊而准确的描述让其他平民认下你。', actions: [] },
    { id: 'spy', name: '卧底', team: 'spy', description: '你拿到的词是「梨」，与多数人的「苹果」相近但不同。你要伪装成知道「苹果」的平民，避免被识破。', actions: [] },
  ],
  actions: [
    {
      id: 'describe_word', name: '描述词语', primitive: 'public_speech', role: 'all', audience: 'public',
      prompt: '你是「{name}」（{id}）。请用一句话间接描述你拿到的词，不要直接说出词语本身。卧底应模仿平民的措辞。',
      output_schema: '{"content":"<30字内的间接描述>"}',
    },
    {
      id: 'vote_suspect', name: '投票指认', primitive: 'vote', role: 'all', audience: 'public',
      prompt: '根据大家的描述，投出你认为最像卧底的一名玩家（不能投自己）。',
      output_schema: '{"target":"<玩家id>","reason":"<20字内>"}',
    },
    {
      id: 'resolve_vote', name: '计票淘汰', primitive: 'resolve_vote', role: '__system', audience: 'public',
      prompt: '统计投票并淘汰得票最多者。',
      output_schema: '{}',
    },
  ],
  composition: {
    fixed: [{ role: 'spy', count: 1 }],
    ratio: [],
    fill_role: 'civilian',
  },
  phases: [
    { id: 'setup', name: '词语分派', purpose: 'B3 角色路由：卧底与平民拿到不同词语，仅本人可见', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'describe', name: '轮流描述', purpose: 'A1 全体激活 + C1 自由描述', kind: 'speak', participants: 'all_alive', actions: ['describe_word'], policy: POLICY.day, order: 'sequential', round: 1 },
    { id: 'vote', name: '投票淘汰', purpose: 'E5 投票决议淘汰最可疑玩家', kind: 'vote', participants: 'all_alive', actions: ['vote_suspect', 'resolve_vote'], policy: POLICY.vote, order: 'simultaneous', round: 1 },
    { id: 'end', name: '复盘', purpose: '公布双方词语与胜负', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'civilian_win', description: '卧底被投票淘汰，平民阵营获胜', type: 'role_eliminated', role: 'spy', winner: 'civilian', winner_label: '平民阵营获胜' },
    { id: 'spy_win', description: '场上平民数量不高于卧底数量，卧底获胜', type: 'team_ge', team_a: 'spy', team_b: 'civilian', winner: 'spy', winner_label: '卧底获胜' },
  ],
  fallback_rule: '达到最大轮次仍未分胜负时，公布词语并判定卧底成功隐藏。',
  game_loop: {
    cycle_phase_ids: ['describe', 'vote'],
    max_rounds: 5,
    break_on_winner: true,
  },
}

export const MAFIA_SPEC: GameSpec = {
  game_type: 'mafia',
  name: '杀人游戏',
  description: '警察、杀手与平民的阵营对抗。夜晚杀手袭击，警察查验；白天发言投票淘汰嫌疑人。',
  min_players: 6,
  max_players: 16,
  roles: [
    { id: 'killer', name: '杀手', team: 'killer', description: '夜晚与同伴私聊并选择袭击目标；白天伪装成平民。', actions: ['killer_talk', 'killer_kill'] },
    { id: 'police', name: '警察', team: 'good', description: '每晚查验一名玩家是杀手还是好人。', actions: ['police_check'] },
    { id: 'civilian', name: '平民', team: 'good', description: '无特殊能力，通过发言和投票找出杀手。', actions: [] },
  ],
  actions: [
    {
      id: 'killer_talk', name: '杀手私聊', primitive: 'private_chat', role: 'killer', audience: 'team',
      prompt: '你是杀人游戏玩家「{name}」（{id}），身份：杀手。同伴是 {teammates}。请在私密频道商议今晚袭击谁。',
      output_schema: '{"content":"<40字内私聊内容>","suggest_target":"<建议袭击的玩家id>"}',
    },
    {
      id: 'killer_kill', name: '杀手袭击', primitive: 'select_target', role: 'killer', audience: 'team',
      prompt: '你是杀手。请给出今晚最终的袭击目标。',
      output_schema: '{"target":"<玩家id>"}',
    },
    {
      id: 'police_check', name: '警察查验', primitive: 'inspect_role', role: 'police', audience: 'self',
      prompt: '你是警察，请选择一名玩家查验身份。',
      output_schema: '{"target":"<玩家id>","reason":"<30字内>"}',
    },
    {
      id: 'day_speech', name: '白天发言', primitive: 'public_speech', role: 'all', audience: 'public',
      prompt: '你是杀人游戏玩家「{name}」（{id}）。请发表白天发言。',
      output_schema: '{"content":"<80字内发言>","suspect":"<最怀疑的玩家id或null>"}',
    },
    {
      id: 'day_vote', name: '投票', primitive: 'vote', role: 'all', audience: 'public',
      prompt: '请投出你认为最像杀手的玩家（不能投自己）。',
      output_schema: '{"target":"<玩家id>","reason":"<25字内>"}',
    },
    {
      id: 'resolve_night', name: '结算夜晚', primitive: 'resolve_night', role: '__system', audience: 'god',
      prompt: '结算夜晚结果。',
      output_schema: '{}',
    },
    {
      id: 'resolve_vote', name: '计票淘汰', primitive: 'resolve_vote', role: '__system', audience: 'public',
      prompt: '统计投票并淘汰得票最多者。',
      output_schema: '{}',
    },
  ],
  composition: {
    fixed: [{ role: 'police', count: 1 }],
    ratio: [{ role: 'killer', denominator: 3, min: 1 }],
    fill_role: 'civilian',
  },
  phases: [
    { id: 'setup', name: '秘密角色分派', purpose: '身份按 B3 角色路由，仅本人可见', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'night', name: '夜晚行动', purpose: '杀手私聊与袭击、警察查验', kind: 'action', participants: ['killer', 'police'], actions: ['killer_talk', 'killer_kill', 'police_check'], policy: POLICY.night, order: 'sequential', round: 1 },
    { id: 'day', name: '白天发言', purpose: 'A1 全体激活 + B3 角色路由', kind: 'speak', participants: 'all_alive', actions: ['resolve_night', 'day_speech'], policy: POLICY.day, order: 'sequential', round: 1 },
    { id: 'vote', name: '投票表决', purpose: 'E5 投票决议，得票最多者出局', kind: 'vote', participants: 'all_alive', actions: ['day_vote', 'resolve_vote'], policy: POLICY.vote, order: 'simultaneous', round: 1 },
    { id: 'end', name: '复盘', purpose: '胜负判定与阵营复盘', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'good_win', description: '所有杀手被淘汰，好人阵营获胜', type: 'role_eliminated', role: 'killer', winner: 'good', winner_label: '好人阵营获胜' },
    { id: 'killer_win', description: '杀手数量不少于好人数量，杀手阵营获胜', type: 'team_ge', team_a: 'killer', team_b: 'good', winner: 'killer', winner_label: '杀手阵营获胜' },
  ],
  fallback_rule: '达到最大轮次仍未分胜负时，判定剩余人数多的一方获胜。',
  game_loop: {
    cycle_phase_ids: ['night', 'day', 'vote'],
    max_rounds: 4,
    break_on_winner: true,
  },
}

export const AVALON_SPEC: GameSpec = {
  game_type: 'avalon',
  name: '阿瓦隆',
  description: '好人和邪恶阵营围绕五次任务进行隐藏身份博弈：队长提名队伍、全员表决、入队者秘密执行任务；好人完成三次任务后还要躲过刺客对梅林的刺杀。',
  min_players: 5,
  max_players: 10,
  roles: [
    {
      id: 'merlin', name: '梅林', team: 'good',
      description: '知道大多数邪恶玩家，但必须隐藏身份；若三次任务成功后被刺客认出，好人仍会失败。', actions: [],
      knowledge: { teams: ['evil'], except_roles: ['mordred'], label: '你看到的邪恶玩家（莫德雷德除外）' },
    },
    {
      id: 'percival', name: '派西维尔', team: 'good',
      description: '看到梅林与莫甘娜，但不知道两者谁是真梅林。', actions: [],
      knowledge: { roles: ['merlin', 'morgana'], label: '你看到的两名“梅林候选”' },
    },
    { id: 'loyal', name: '忠臣', team: 'good', description: '没有额外身份信息，通过组队和任务结果判断邪恶阵营。', actions: [] },
    {
      id: 'assassin', name: '刺客', team: 'evil',
      description: '与邪恶同伴破坏任务；若好人先完成三次任务，可以刺杀梅林实现翻盘。', actions: ['assassinate'],
      knowledge: { teams: ['evil'], except_roles: ['oberon'], label: '你知道的邪恶同伴' },
    },
    {
      id: 'morgana', name: '莫甘娜', team: 'evil',
      description: '在派西维尔视野中伪装成梅林，并协助邪恶阵营破坏任务。', actions: [],
      knowledge: { teams: ['evil'], except_roles: ['oberon'], label: '你知道的邪恶同伴' },
    },
    {
      id: 'mordred', name: '莫德雷德', team: 'evil',
      description: '梅林看不到你的邪恶身份。', actions: [],
      knowledge: { teams: ['evil'], except_roles: ['oberon'], label: '你知道的邪恶同伴' },
    },
    { id: 'oberon', name: '奥伯伦', team: 'evil', description: '不认识其他邪恶玩家，其他邪恶玩家也看不到你。', actions: [] },
  ],
  actions: [
    {
      id: 'propose_team', name: '队长提名', primitive: 'propose_team', role: '__leader', audience: 'public',
      prompt: '你是本轮队长「{name}」（{id}）。结合公开记录与自己的秘密信息，提名规定人数的任务队伍。',
      output_schema: '{"team":["<玩家id>"],"reason":"<40字内提名理由>"}',
    },
    {
      id: 'approve_team', name: '组队表决', primitive: 'approve_team', role: 'all', audience: 'public',
      prompt: '你是「{name}」（{id}）。请对当前提名队伍独立投下赞成或反对票。',
      output_schema: '{"approve":<true|false>,"reason":"<30字内理由>"}',
    },
    {
      id: 'resolve_team_vote', name: '组队计票', primitive: 'resolve_team_vote', role: '__system', audience: 'public',
      prompt: '统计组队票。', output_schema: '{}',
    },
    {
      id: 'quest_vote', name: '秘密执行任务', primitive: 'quest_vote', role: '__proposed_team', audience: 'self',
      prompt: '你已进入任务队伍。好人必须提交成功票；邪恶玩家可以选择成功或失败以隐藏或破坏任务。',
      output_schema: '{"quest_success":<true|false>,"reason":"<仅供自己记录的简短策略>"}',
    },
    {
      id: 'resolve_quest', name: '任务结算', primitive: 'resolve_quest', role: '__system', audience: 'public',
      prompt: '只公布成功/失败票数量并结算任务，不公开投票者。', output_schema: '{}',
    },
    {
      id: 'assassinate', name: '刺杀梅林', primitive: 'assassinate', role: 'assassin', audience: 'public',
      prompt: '好人已完成三次任务。你是刺客，请根据整局组队与发言选择你认为是梅林的玩家。',
      output_schema: '{"target":"<玩家id>","reason":"<40字内判断>"}',
    },
    {
      id: 'resolve_assassination', name: '刺杀结算', primitive: 'resolve_assassination', role: '__system', audience: 'public',
      prompt: '公布刺杀目标身份并结算最终胜负。', output_schema: '{}',
    },
  ],
  composition: {
    fixed: [], ratio: [], fill_role: 'loyal',
    by_player_count: {
      '5': ['merlin', 'percival', 'loyal', 'assassin', 'morgana'],
      '6': ['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana'],
      '7': ['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana', 'oberon'],
      '8': ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred'],
      '9': ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred'],
      '10': ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred', 'oberon'],
    },
  },
  phases: [
    { id: 'setup', name: '秘密身份分派', purpose: '每名玩家仅获得自己的身份与规则允许的秘密信息', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'proposal', name: '队长提名队伍', purpose: '轮换队长并按当前任务人数提名队伍', kind: 'action', participants: 'all_alive', actions: ['propose_team'], policy: POLICY.day, order: 'sequential' },
    { id: 'team_vote', name: '全员组队表决', purpose: '过半赞成才允许该队伍执行任务', kind: 'vote', participants: 'all_alive', actions: ['approve_team', 'resolve_team_vote'], policy: POLICY.vote, order: 'simultaneous' },
    { id: 'quest', name: '秘密任务与结算', purpose: '入队者秘密提交任务票；必要时进入刺杀阶段', kind: 'action', participants: 'all_alive', actions: ['quest_vote', 'resolve_quest', 'assassinate', 'resolve_assassination'], policy: POLICY.night, order: 'simultaneous' },
    { id: 'end', name: '身份揭示与复盘', purpose: '公布角色、任务轨迹与最终胜负', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'avalon_runtime', description: '由任务比分、连续否决与刺杀阶段共同判定', type: 'llm' },
  ],
  fallback_rule: '五次任务内先取得三次任务失败的邪恶阵营获胜；好人三次成功后，刺客命中梅林则邪恶翻盘，否则好人获胜。连续五次组队被否决时邪恶阵营获胜。',
  game_loop: {
    cycle_phase_ids: ['proposal', 'team_vote', 'quest'],
    max_rounds: 25,
    break_on_winner: true,
  },
  quest_rules: {
    team_sizes_by_player_count: {
      '5': [2, 3, 2, 3, 3],
      '6': [2, 3, 4, 3, 4],
      '7': [2, 3, 3, 4, 4],
      '8': [3, 4, 4, 5, 5],
      '9': [3, 4, 4, 5, 5],
      '10': [3, 4, 4, 5, 5],
    },
    fail_threshold_by_player_count: {
      '7': { '4': 2 }, '8': { '4': 2 }, '9': { '4': 2 }, '10': { '4': 2 },
    },
    successes_to_win: 3,
    failures_to_win: 3,
    max_rejected_teams: 5,
    assassin_role: 'assassin',
    protected_role: 'merlin',
    good_team: 'good',
    evil_team: 'evil',
    good_win_label: '亚瑟忠臣阵营获胜',
    evil_win_label: '莫德雷德阵营获胜',
  },
}

/** 内置游戏注册表。未知游戏不应在这里逐一追加，而应由 Dispatcher 动态生成 GameSpec。 */
export const GAME_REGISTRY: Record<string, GameSpec> = {
  werewolf: WEREWOLF_SPEC,
  undercover: UNDERCOVER_SPEC,
  mafia: MAFIA_SPEC,
  avalon: AVALON_SPEC,
}
