/**
 * 运行视图 · 各 Block 的渲染
 */
import type { JSX } from 'react'
import type { Block, PhaseBlock } from '../hooks/useRunEngine'
import type { ScenarioConfig, TaskProfile, TaskType, PlanScoreCard, CandidateProposal, GameRosterEntry } from '../engine/types'
import { Chip, SectionCard, BlockHeader, StrategyChips, Spinner, AgentAvatar, TokenBadge } from './common'
import { ArtifactView, ProposalCard, ScoreMatrix } from './Artifacts'
import { FishbowlCircle } from './Fishbowl'
import { ExamBlueprintView, ExamResultView } from './Exam'
import { GameActionLine, GameRoster, GameSpeechBubble, VoteTable } from './Werewolf'
import { FinalProposalView } from './Artifacts'
import { ComplexityBlock } from './Complexity'

// ---------- Dispatcher ----------
const DIM_LABELS: [keyof TaskProfile, string][] = [
  ['domain', '领域'], ['time_pressure', '时间压力'], ['information_asymmetry', '信息不对称'],
  ['agent_relations', '主体关系'], ['decision_pattern', '决策模式'], ['resource_scarcity', '资源稀缺'],
  ['verifiability', '可验证性'],
]

export function DispatchBlock({ running, profile, tokens }: { running: boolean; profile?: TaskProfile; tokens?: number }) {
  return (
    <SectionCard>
      <BlockHeader index="1" title="Dispatcher · 一句话入口分类" sub={running ? '正在分类（一次 LLM 调用，约 300 tokens）…' : profile?.reasoning} right={running ? <Spinner /> : tokens ? <TokenBadge tokens={tokens} /> : undefined} />
      {profile && (
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="black">agent_count = {profile.agent_count}</Chip>
            <Chip tone="black">task_type = {profile.task_type}</Chip>
            {profile.game_type && <Chip tone="black">game = {profile.game_type}</Chip>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {DIM_LABELS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between border-b border-dashed border-neutral-100 py-1">
                <span className="text-[12px] text-neutral-500">{label}</span>
                <span className="font-mono text-[12px] font-medium text-neutral-800">{String(profile[key])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ---------- 轨道决策 ----------
const TRACK_META: Record<TaskType, { title: string; desc: string }> = {
  single: { title: '单 Agent 轨道', desc: '直接 LLM 回答，跳过编排' },
  collaborative: { title: '协作轨道', desc: 'Scenario Compiler + 编排引擎' },
  competitive: { title: '博弈轨道', desc: 'GameRegistry 加载扩展' },
}

export function TrackBlock({ track, reason }: { track: TaskType; reason: string }) {
  const meta = TRACK_META[track]
  return (
    <div className="rounded-xl border-2 border-neutral-900 bg-neutral-900 px-5 py-4 text-white">
      <div className="flex items-center gap-3">
        <span className="text-[15px] font-bold">路由决策 → {meta.title}</span>
        <span className="rounded-md bg-white/15 px-2 py-0.5 text-[11px]">{meta.desc}</span>
      </div>
      <div className="mt-1.5 text-[13px] leading-relaxed text-neutral-300">{reason}</div>
    </div>
  )
}

// ---------- Scenario Compiler ----------
export function CompileBlock({ steps, config }: { steps: { step: number; name: string; detail: string; tokens: number }[]; config?: ScenarioConfig }) {
  const stepNames = ['场景分类', '查决策表', '生成 Agent', '信息流设计', '阶段与条件边', '评估冻结']
  return (
    <SectionCard>
      <BlockHeader index="2" title="Scenario Compiler · 场景编译" sub="把场景编译成可执行配置：仅 Step 1/3 消耗 LLM tokens，其余为确定性规则" />
      <div className="px-5 py-4">
        <ol className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const s = steps.find((x) => x.step === n)
            return (
              <li key={n} className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${s ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400'}`}>{n}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-medium ${s ? 'text-neutral-900' : 'text-neutral-400'}`}>{s?.name ?? stepNames[n - 1]}</span>
                    {s && s.tokens > 0 && <TokenBadge tokens={s.tokens} />}
                    {s && s.tokens === 0 && <span className="font-mono text-[11px] text-emerald-600">0 tok · 确定性</span>}
                  </div>
                  {s && <div className="mt-0.5 text-[12.5px] leading-relaxed text-neutral-500">{s.detail}</div>}
                </div>
              </li>
            )
          })}
        </ol>
        {config && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-[12px] font-semibold text-neutral-900">策略配方（30 格决策表查得，已通过互斥/推断校验）</div>
            <div className="mt-2"><StrategyChips combo={config.strategy} /></div>
            {config.strategy.notes.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[12px] text-neutral-500">
                {config.strategy.notes.map((n, i) => <li key={i}>· {n}</li>)}
              </ul>
            )}
            <div className="mt-4">
              <div className="mb-2 text-[12px] font-semibold text-neutral-900">Agent Pool（{config.agents.length}）</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {config.agents.map((a) => (
                  <div key={a.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <AgentAvatar name={a.name} small />
                      <div>
                        <div className="text-[13px] font-semibold text-neutral-900">{a.name}</div>
                        <div className="text-[11px] text-neutral-400">{a.archetype}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 text-[12px] leading-relaxed text-neutral-500">{a.relationship}</div>
                    <div className="mt-1 text-[12px] text-neutral-600"><span className="font-medium">立场：</span>{a.stance}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ---------- 阶段块 ----------
function PhaseItems({ phase, config, prevInner }: { phase: PhaseBlock; config?: ScenarioConfig; prevInner?: string[] }) {
  const elements: JSX.Element[] = []
  let deadList: string[] = []
  let rosterShown = false
  let roster: GameRosterEntry[] | undefined

  // 第一遍：预收集本阶段的方案与评分（聚合渲染用）
  const proposals: CandidateProposal[] = []
  const allScores: PlanScoreCard[] = []
  phase.items.forEach((item) => {
    if (item.data.t === 'artifact') {
      if (item.data.artifact.kind === 'CandidateProposal') {
        if (!proposals.some((p) => p.proposal_id === (item.data as { artifact: CandidateProposal }).artifact.proposal_id)) {
          proposals.push(item.data.artifact as CandidateProposal)
        }
      }
      if (item.data.artifact.kind === 'PlanScoreCard') allScores.push(item.data.artifact as PlanScoreCard)
    }
  })
  let proposalsRendered = false
  let matrixRendered = false

  phase.items.forEach((item, idx) => {
    const e = item.data
    switch (e.t) {
      case 'agent_start':
        elements.push(
          <div key={idx} className="mt-4 flex items-center gap-2 first:mt-0">
            <AgentAvatar name={e.name} small dim={e.agent_id.startsWith('__')} />
            <span className="text-[13px] font-semibold text-neutral-800">{e.name}</span>
            <span className="text-[11px] text-neutral-400">{e.archetype}</span>
            <span className="ml-auto font-mono text-[10.5px] text-neutral-400">{e.context_mode}</span>
          </div>,
        )
        break
      case 'artifact':
        if (e.artifact.kind === 'CandidateProposal') {
          if (!proposalsRendered) {
            proposalsRendered = true
            elements.push(
              <div key="proposals" className="mt-2 flex flex-col gap-2 sm:flex-row">
                {proposals.map((p) => <ProposalCard key={p.proposal_id} p={p} />)}
              </div>,
            )
          }
        } else if (e.artifact.kind === 'PlanScoreCard') {
          if (!matrixRendered && allScores.length > 0) {
            matrixRendered = true
            elements.push(<ScoreMatrix key="matrix" scores={allScores} config={config} proposals={proposals.length ? proposals : inferProposals(allScores)} />)
          }
        } else {
          elements.push(<ArtifactView key={idx} artifact={e.artifact} config={config} tokens={e.tokens} />)
        }
        break
      case 'speech':
        elements.push(
          <div key={idx} className="mt-2 rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-neutral-900">{e.name}</span>
              <TokenBadge tokens={e.tokens} />
            </div>
            <div className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-neutral-800">{e.content}</div>
          </div>,
        )
        break
      case 'fishbowl_plan': {
        elements.push(
          <div key={idx} className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-bold text-neutral-900">Fishbowl Planner · Round {e.round}</span>
              <Chip tone="black">按冲突数据选内圈</Chip>
            </div>
            <div className="mt-1 text-[12.5px] text-neutral-500">{e.reason}</div>
            <div className="mt-2"><FishbowlCircle config={config} inner={e.inner} outer={e.outer} prevInner={prevInner ?? []} /></div>
          </div>,
        )
        break
      }
      case 'retry':
        elements.push(
          <div key={idx} className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-[12px] text-amber-700">
            <Spinner /> {e.reason}（第 {e.attempt} 次尝试）
          </div>,
        )
        break
      case 'exam_frozen':
        elements.push(<ExamBlueprintView key={idx} bp={e.blueprint} />)
        break
      case 'exam_result':
        elements.push(<ExamResultView key={idx} result={e.result} />)
        break
      case 'final_proposal':
        elements.push(<FinalProposalView key={idx} p={e.proposal} />)
        break
      case 'game_state': {
        const prevKey = deadList.join(',')
        const nextKey = e.dead.join(',')
        deadList = e.dead
        if (e.roster) roster = e.roster
        if (rosterShown && prevKey !== nextKey) {
          elements.push(<GameRoster key={`roster-${idx}`} dead={deadList} roster={roster} />)
        }
        break
      }
      case 'game_event':
        if (!rosterShown) {
          rosterShown = true
          elements.push(<GameRoster key={`roster-${idx}`} dead={deadList} roster={roster} />)
        }
        if (e.event.kind === 'GameSpeech') {
          elements.push(<div key={idx} className="mt-2"><GameSpeechBubble speech={e.event} roster={roster} /></div>)
        } else if (e.event.kind === 'GameAction') {
          elements.push(<div key={idx} className="mt-2"><GameActionLine action={e.event} roster={roster} /></div>)
        }
        break
      case 'vote':
        elements.push(<div key={idx} className="mt-2"><VoteTable votes={e.votes} result={e.result} roster={roster} /></div>)
        break
    }
  })
  return <div className="space-y-2.5">{elements}</div>
}

function inferProposals(scores: PlanScoreCard[]): CandidateProposal[] {
  const ids = [...new Set(scores.map((s) => s.proposal_id))]
  return ids.map((id) => ({ kind: 'CandidateProposal', proposal_id: id, title: '', summary: '', supporters: [] }))
}

export function PhaseBlockView({ block, config, index, prevInner }: { block: PhaseBlock; config?: ScenarioConfig; index: number; prevInner?: string[] }) {
  return (
    <SectionCard>
      <BlockHeader
        index={String(index)}
        title={block.name}
        sub={block.purpose}
        right={block.done ? <Chip tone="green">完成</Chip> : <span className="flex items-center gap-1.5 text-[12px] text-neutral-400"><Spinner /> 进行中</span>}
      />
      {(block.strategy.A.length > 0 || block.strategy.B) && (
        <div className="flex items-center gap-2 border-b border-neutral-50 px-5 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">本阶段策略</span>
          <StrategyChips combo={block.strategy} compact />
        </div>
      )}
      <div className="px-5 py-4">
        <PhaseItems phase={block} config={config} prevInner={prevInner} />
      </div>
    </SectionCard>
  )
}

// ---------- 运行时适应 ----------
export function AdaptationBlock({ trigger, action, scope }: { trigger: string; action: string; scope: string }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5">
      <div className="flex items-center gap-2">
        <Chip tone="amber">运行时适应</Chip>
        <span className="text-[12px] text-amber-600">Observer 异常检测触发</span>
      </div>
      <div className="mt-1.5 text-[13px] font-medium text-amber-900">{trigger}</div>
      <div className="mt-0.5 text-[12.5px] text-amber-700">动作：{action} · 作用域：{scope}</div>
    </div>
  )
}

// ---------- 报告（轻量 Markdown 渲染） ----------
export function ReportBlock({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  return (
    <SectionCard>
      <BlockHeader index="★" title="最终报告" sub="结果汇总 · 结论边界" />
      <div className="px-5 py-4">
        {lines.map((line, i) => {
          if (line.startsWith('### ')) return <h4 key={i} className="mt-4 text-[14px] font-bold text-neutral-900 first:mt-0">{line.slice(4)}</h4>
          if (line.startsWith('## ')) return <h3 key={i} className="mt-4 text-[16px] font-bold text-neutral-900 first:mt-0">{line.slice(3)}</h3>
          if (line.startsWith('- ')) return <div key={i} className="flex gap-2 text-[13px] leading-relaxed text-neutral-700"><span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-neutral-400" /><span>{renderBold(line.slice(2))}</span></div>
          if (line.trim() === '') return <div key={i} className="h-2" />
          return <p key={i} className="text-[13px] leading-relaxed text-neutral-700">{renderBold(line)}</p>
        })}
      </div>
    </SectionCard>
  )
}

function renderBold(text: string): (string | JSX.Element)[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold text-neutral-900">{p.slice(2, -2)}</strong> : p))
}

// ---------- Block 分发 ----------
export function BlockView({ block, config, phaseIndex, prevInner }: { block: Block; config?: ScenarioConfig; phaseIndex: number; prevInner?: string[] }) {
  switch (block.kind) {
    case 'complexity':
      return <ComplexityBlock running={block.running} result={block.result} tokens={block.tokens} source={block.source} />
    case 'dispatch':
      return <DispatchBlock running={block.running} profile={block.profile} tokens={block.tokens} />
    case 'track':
      return <TrackBlock track={block.track} reason={block.reason} />
    case 'compile':
      return <CompileBlock steps={block.steps} config={block.config} />
    case 'phase':
      return <PhaseBlockView block={block.phase} config={config} index={phaseIndex} prevInner={prevInner} />
    case 'adaptation':
      return <AdaptationBlock trigger={block.trigger} action={block.action} scope={block.scope} />
    case 'report':
      return <ReportBlock markdown={block.markdown} />
    case 'error':
      return (
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4">
          <div className="text-[14px] font-bold text-red-700">运行出错</div>
          <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-red-600">{block.message}</div>
        </div>
      )
  }
}

/** 从 blocks 中提取最新的 ScenarioConfig */
export function extractConfig(blocks: Block[]): ScenarioConfig | undefined {
  for (const b of blocks) {
    if (b.kind === 'compile' && b.config) return b.config
  }
  return undefined
}
