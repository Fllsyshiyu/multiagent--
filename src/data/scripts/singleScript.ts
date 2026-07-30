/**
 * 预录剧本 · 单 Agent 轨道：写一封社区活动通知
 */
import type { ScriptData } from '../../engine/scripted'

export const singleScript: ScriptData = {
  dispatch: {
    agent_count: 1,
    task_type: 'single',
    game_type: null,
    domain: 'writing',
    time_pressure: 'relaxed',
    information_asymmetry: 'low',
    agent_relations: 'cooperative',
    decision_pattern: 'single_shot',
    resource_scarcity: 'low',
    verifiability: 'subjective',
    reasoning: '单纯的文本生成任务，无多方利益冲突、无信息分散 → 单 Agent 直接回答，跳过编排',
  },
  single_answer: `【社区重阳节活动通知】

各位居民朋友：

金秋送爽，丹桂飘香。在重阳节来临之际，社区定于 10 月 29 日（周三）上午 9:30 在社区文化活动中心举办"情暖重阳"主题活动，诚邀全体居民参加。

活动内容：
1. 健康义诊（9:30-11:00）：社区医生现场测量血压、血糖，提供健康咨询；
2. 重阳茶话会（10:00-11:30）：品菊花茶、吃重阳糕，共话家常；
3. 便民服务（9:30-11:30）：免费理发、磨刀、小家电维修。

温馨提示：
· 70 岁以上老人可领取节日慰问品一份（凭身份证领取）；
· 行动不便的老人可联系居委会预约上门慰问；
· 请参加活动的居民佩戴口罩，注意往返安全。

活动时间：10 月 29 日（周三）9:30-11:30
活动地点：社区文化活动中心一楼大厅
咨询电话：居委会值班室（工作日 9:00-17:00）

期待您的参与！

××社区居民委员会
××××年10月20日`,
}
