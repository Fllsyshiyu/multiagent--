/**
 * 演示预设：四条轨道场景
 */
import type { ScriptData } from '../engine/scripted'
import { elevatorScript } from './scripts/elevator'
import { squareDanceScript } from './scripts/squareDance'
import { werewolfScript } from './scripts/werewolfScript'
import { singleScript } from './scripts/singleScript'

export interface Preset {
  id: string
  label: string
  input: string
  track_hint: 'single' | 'collaborative' | 'competitive'
  description: string
  script: ScriptData
}

export const PRESETS: Preset[] = [
  {
    id: 'elevator',
    label: '电梯加装议事',
    input: '老旧小区加装电梯：六层无电梯老楼，高层老人上下楼困难，低层担心采光和房价，费用分摊谈不拢，社区该如何推进？',
    track_hint: 'collaborative',
    description: '协作轨道 · 两阶段鱼缸议事 + 可追踪报告',
    script: elevatorScript,
  },
  {
    id: 'square_dance',
    label: '广场舞场地之争',
    input: '小区广场舞场地之争：老人每晚跳广场舞健身，周边居民不堪音响困扰多次投诉，物业夹在中间，如何化解？',
    track_hint: 'collaborative',
    description: '协作轨道 · 同一引擎，换个描述即可',
    script: squareDanceScript,
  },
  {
    id: 'werewolf',
    label: '狼人杀一局',
    input: '来一局狼人杀：6 人局，2 狼人、1 预言家、1 女巫、2 平民，演示一个完整昼夜循环',
    track_hint: 'competitive',
    description: '博弈轨道 · werewolf 扩展（私密通信 Modifier / B3 角色路由 / E5 投票）',
    script: werewolfScript,
  },
  {
    id: 'single',
    label: '写活动通知',
    input: '帮我写一封社区重阳节活动的通知',
    track_hint: 'single',
    description: '单 Agent 轨道 · 跳过编排，直接回答',
    script: singleScript,
  },
]
