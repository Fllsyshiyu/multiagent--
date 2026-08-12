/**
 * 预录剧本 · 狼人杀（博弈轨道）
 * 6 人局：p1 沈默(狼) p2 阿岚(狼) p3 陆一(预言家) p4 苏叶(女巫) p5 老周(平民) p6 小满(平民)
 * 剧情：狼刀预言家 → 女巫救 → 平安夜 → 预言家查验狼 → 白天抗推狼成功
 */
import type { ScriptData } from '../../engine/scripted'

export const werewolfScript: ScriptData = {
  complexity: {
    dimensions: {
      reasoning_depth: 2,
      step_count: 3,
      domain_expertise: 1,
      tool_dependency: 0,
      coordination: 3,
      uncertainty: 3,
    },
    confidence: 0.88,
  },
  dispatch: {
    agent_count: 6,
    task_type: 'competitive',
    game_type: 'werewolf',
    domain: 'game',
    time_pressure: 'sustained',
    information_asymmetry: 'high',
    agent_relations: 'adversarial',
    decision_pattern: 'sequential',
    resource_scarcity: 'high',
    verifiability: 'automatable',
    reasoning: '明确的博弈游戏（狼人杀）：信息高度不对称、阵营对抗 → 博弈轨道，加载 werewolf 扩展',
  },

  werewolf: {
    wolf_talk: {
      p1: { content: '今晚先刀陆一吧，他发言最像带身份的，留着是祸害。', suggest_target: 'p3' },
      p2: { content: '同意，陆一昨天拿警徽的样子太稳了。刀他，明天我来做低身份。', suggest_target: 'p3' },
    },
    seer_check: { target: 'p1', reasoning: '沈默昨晚发言滴水不漏，反而可疑' },
    witch: { use_antidote: true, poison_target: null, reasoning: '首夜救人是常规操作，信息太少不留药' },
    day_speech: {
      p3: { content: '昨晚平安夜，女巫好药。我这里有点信息，先不明说——沈默，你能解释一下为什么从头到尾不评价任何人对错吗？', suspect: 'p1' },
      p4: { content: '平安夜确实是我用药保的。我先不站队，但陆一的质疑方向我觉得有道理，听听沈默怎么说。', suspect: 'p1' },
      p5: { content: '我是闭眼玩家，信息不多。但平安夜说明狼刀落了空，今天很关键，别分票。', suspect: null },
      p6: { content: '同上，别分票。我比较信陆一的直觉，他敢点名是有底气的。', suspect: 'p1' },
      p1: { content: '我不评价别人是因为首夜没信息，乱带节奏才像狼。陆一一上来就踩我，倒像是狼在找抗推位。我怀疑阿岚……不，我意思是，大家别被一个人带偏。', suspect: 'p3' },
      p2: { content: '我觉得沈默说得有道理，陆一太急了。今天我们是不是可以先出老周？他一直划水。', suspect: 'p5' },
    },
    vote: {
      p1: { target: 'p5', reason: '老周全程划水，先出划水位' },
      p2: { target: 'p5', reason: '同意沈默，先出划水的' },
      p3: { target: 'p1', reason: '查验结果不会骗人' },
      p4: { target: 'p1', reason: '发言回避且改口，像狼' },
      p5: { target: 'p1', reason: '陆一敢点名，我跟票' },
      p6: { target: 'p1', reason: '信预言家方向' },
    },
  },
}
