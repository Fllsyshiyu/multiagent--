/**
 * 工件渲染器 · 把结构化工件渲染成卡片（议事过程的核心可视化）
 */
import { useState } from 'react'
import { Download } from 'lucide-react'
import type {
  Artifact, CandidateProposal, ConflictMap, FinalProposal, FishbowlSummaryCard,
  InitialAssessmentCard, ObjectionCard, OuterObservationCard, PlanScoreCard, ScenarioConfig,
  PresentationBrief, PresentationDeck, PresentationDeckReview, PresentationEvidenceCard, PresentationOutline, PresentationResearchPlan,
} from '../engine/types'
import { Chip, TokenBadge } from './common'

function agentName(config: ScenarioConfig | undefined, id: string | undefined): string {
  if (!id) return ''
  return config?.agents.find((a) => a.id === id)?.name ?? id
}

function List({ items, tone = 'text-neutral-700' }: { items: string[]; tone?: string }) {
  return (
    <ul className={`space-y-1 text-[13px] leading-relaxed ${tone}`}>
      {items.map((x, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  )
}

function stanceTone(stance: string): 'green' | 'red' | 'amber' | 'gray' {
  if (stance.includes('强烈支持') || stance === '支持') return 'green'
  if (stance.includes('反对') && !stance.includes('条件')) return 'red'
  if (stance.includes('条件')) return 'amber'
  return 'gray'
}

// ---- 首发卡 ----
export function InitialCard({ card, name, tokens }: { card: InitialAssessmentCard; name: string; tokens?: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-neutral-900">{name}</span>
          <Chip tone={stanceTone(card.initial_stance)}>{card.initial_stance}</Chip>
        </div>
        <span className="flex items-center gap-2">
          <Chip>Initial Assessment</Chip>
          {tokens ? <TokenBadge tokens={tokens} /> : null}
        </span>
      </div>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-neutral-800">{card.content}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">关注</div>
          <List items={card.main_concerns} />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-400">底线</div>
          <List items={card.non_negotiables} />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-500">可让步</div>
          <List items={card.possible_concessions} />
        </div>
      </div>
    </div>
  )
}

// ---- 候选方案卡 ----
export function ProposalCard({ p }: { p: CandidateProposal }) {
  return (
    <div className="flex-1 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-900 font-mono text-[12px] font-bold text-white">{p.proposal_id}</span>
        <span className="text-[14px] font-semibold text-neutral-900">{p.title}</span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">{p.summary}</p>
    </div>
  )
}

// ---- 评分矩阵（热力表格） ----
export function ScoreMatrix({ scores, config, proposals }: { scores: PlanScoreCard[]; config?: ScenarioConfig; proposals: CandidateProposal[] }) {
  const agents = [...new Set(scores.map((s) => s.agent_id))]
  const cell = (agentId: string, pid: string) => scores.find((s) => s.agent_id === agentId && s.proposal_id === pid)
  const heat = (v: number) =>
    v >= 4 ? 'bg-emerald-500 text-white' : v === 3 ? 'bg-amber-100 text-amber-800' : v > 0 ? 'bg-red-100 text-red-700' : 'bg-neutral-50 text-neutral-400'
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-neutral-50 text-left text-[12px] text-neutral-500">
            <th className="border-b border-neutral-200 px-3 py-2 font-medium">Agent</th>
            {proposals.map((p) => (
              <th key={p.proposal_id} className="border-b border-neutral-200 px-3 py-2 font-medium">
                <span className="font-mono">{p.proposal_id}</span> {p.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((aid) => (
            <tr key={aid} className="border-b border-neutral-100 last:border-0">
              <td className="px-3 py-2 font-medium text-neutral-800">{agentName(config, aid)}</td>
              {proposals.map((p) => {
                const c = cell(aid, p.proposal_id)
                return (
                  <td key={p.proposal_id} className="px-3 py-2">
                    {c ? (
                      <div className="group relative inline-block">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-bold ${heat(c.support_score)}`}>{c.support_score}</span>
                        <div className="pointer-events-none absolute left-0 top-8 z-20 hidden w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg group-hover:block">
                          <div className="text-[12px] font-semibold text-neutral-800">{agentName(config, aid)} → {p.proposal_id}</div>
                          <div className="mt-1 grid grid-cols-4 gap-1 text-[11px] text-neutral-500">
                            <span>支持 {c.support_score}</span><span>可行 {c.feasibility_score}</span><span>公平 {c.fairness_score}</span><span>风险 {c.risk_score}</span>
                          </div>
                          <div className="mt-1.5 text-[12px] text-neutral-600"><span className="font-medium">异议：</span>{c.main_objection}</div>
                          <div className="mt-0.5 text-[12px] text-neutral-600"><span className="font-medium">支持条件：</span>{c.support_condition}</div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- 冲突图 ----
export function ConflictPanel({ map, config }: { map: ConflictMap; config?: ScenarioConfig }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-neutral-900 bg-neutral-900 p-4 text-white">
        <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">领先方案</div>
        <div className="mt-1 font-mono text-lg font-bold">{map.leading_proposal}</div>
        <div className="mt-1 text-[12px] text-neutral-400">仅是当前领先，不等于最终最佳</div>
      </div>
      <div className="rounded-lg border border-neutral-200 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">阵营</div>
        <div className="mt-2 space-y-1 text-[13px]">
          <div><span className="font-medium text-emerald-700">支持：</span>{map.main_supporters.map((id) => agentName(config, id)).join('、') || '—'}</div>
          <div><span className="font-medium text-red-600">反对：</span>{map.main_opponents.map((id) => agentName(config, id)).join('、') || '—'}</div>
        </div>
      </div>
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-red-500">否决性风险</div>
        <div className="mt-1.5"><List items={map.veto_risks} tone="text-red-800" /></div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-amber-600">少数意见（必须保留）</div>
        <div className="mt-1.5"><List items={map.minority_opinions} tone="text-amber-800" /></div>
      </div>
      <div className="rounded-lg border border-neutral-200 p-4 sm:col-span-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">证据缺口（待真实调研）</div>
        <div className="mt-1.5"><List items={map.evidence_gaps} /></div>
      </div>
    </div>
  )
}

// ---- 异议/修订卡 ----
export function ObjectionCardView({ card, config, tokens }: { card: ObjectionCard; config?: ScenarioConfig; tokens?: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-neutral-900">{agentName(config, card.agent_id)}</span>
          <Chip tone="red">{card.objection_type}</Chip>
          {card.reply_to && <span className="text-[12px] text-neutral-400">→ 回应 {agentName(config, card.reply_to)}</span>}
        </div>
        {tokens ? <TokenBadge tokens={tokens} /> : null}
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-800">{card.objection}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">要求修订</div>
          <List items={card.required_revision} />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-500">支持条件</div>
          <div className="text-[13px] leading-relaxed text-neutral-700">{card.support_condition}</div>
        </div>
      </div>
    </div>
  )
}

// ---- 外圈观察卡 ----
export function OuterCardView({ card, config, tokens }: { card: OuterObservationCard; config?: ScenarioConfig; tokens?: number }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-neutral-700">{agentName(config, card.agent_id)}</span>
          <Chip>外圈观察</Chip>
          {card.request_to_enter_inner_circle && <Chip tone="amber">申请进入内圈</Chip>}
          {card.absorbed && <Chip tone="green">已被吸收</Chip>}
        </div>
        {tokens ? <TokenBadge tokens={tokens} /> : null}
      </div>
      <div className="mt-2 text-[13px] leading-relaxed text-neutral-700">
        <span className="font-medium">遗漏问题：</span>{card.missed_issue}
      </div>
      <div className="mt-1 text-[13px] leading-relaxed text-neutral-600">{card.objection}</div>
    </div>
  )
}

// ---- 鱼缸摘要卡 ----
export function SummaryCardView({ card }: { card: FishbowlSummaryCard }) {
  return (
    <div className="rounded-lg border-2 border-neutral-900 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-bold text-neutral-900">Fishbowl Summary · Round {card.round}</span>
        <Chip tone="black">摘要继承 · 替代完整聊天记录</Chip>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-600">多数意见</div><List items={card.majority_views} /></div>
        <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-600">少数意见</div><List items={card.minority_views} /></div>
        <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-500">核心冲突</div><List items={card.core_conflicts} /></div>
        <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">下轮必答</div><List items={card.unanswered_questions} /></div>
      </div>
      {card.absorbed_observations.length > 0 && (
        <div className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-[12px] text-neutral-600">
          <span className="font-medium">外圈吸收：</span>{card.absorbed_observations.join('；')}
        </div>
      )}
    </div>
  )
}

// ---- 最终方案 ----
export function FinalProposalView({ p }: { p: FinalProposal }) {
  return (
    <div className="rounded-xl border-2 border-neutral-900 bg-white">
      <div className="border-b border-neutral-100 px-5 py-4">
        <div className="flex items-center gap-2"><Chip tone="black">最终修订方案</Chip></div>
        <div className="mt-1.5 text-[17px] font-bold text-neutral-900">「{p.title}」</div>
        <div className="mt-1 text-[13px] text-neutral-500">{p.goal}</div>
      </div>
      <div className="grid grid-cols-1 gap-5 px-5 py-4 sm:grid-cols-2">
        <div><div className="mb-1.5 text-[12px] font-semibold text-neutral-900">措施</div><List items={p.measures} /></div>
        <div className="space-y-3">
          <div><div className="mb-1 text-[12px] font-semibold text-neutral-900">责任主体</div><div className="text-[13px] text-neutral-700">{p.responsible_parties.join('、')}</div></div>
          <div><div className="mb-1 text-[12px] font-semibold text-neutral-900">资源来源</div><div className="text-[13px] text-neutral-700">{p.resources}</div></div>
          <div><div className="mb-1 text-[12px] font-semibold text-neutral-900">时间安排</div><div className="text-[13px] text-neutral-700">{p.timeline}</div></div>
          <div><div className="mb-1 text-[12px] font-semibold text-neutral-900">退出机制</div><div className="text-[13px] text-neutral-700">{p.exit_mechanism}</div></div>
          <div><div className="mb-1 text-[12px] font-semibold text-neutral-900">复评机制</div><div className="text-[13px] text-neutral-700">{p.review_mechanism}</div></div>
        </div>
      </div>
      <div className="border-t border-neutral-100 px-5 py-4">
        <div className="mb-1.5 text-[12px] font-semibold text-neutral-900">修订路径（方案如何由异议逐步修改而来）</div>
        <ol className="space-y-1.5">
          {p.revision_path.map((r, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-neutral-700">
              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-mono text-[10px] font-semibold text-neutral-500" style={{ height: 18, width: 18 }}>{i + 1}</span>
              <span>{r}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function PresentationBriefView({ brief }: { brief: PresentationBrief }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2"><Chip tone="black">Presentation Brief</Chip><Chip>{brief.slide_count} 页</Chip><Chip>{brief.language}</Chip></div>
      <div className="mt-2 text-[15px] font-bold text-neutral-900">{brief.title}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-neutral-600">{brief.purpose}</div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-[12.5px] text-neutral-600 sm:grid-cols-2">
        <div><span className="font-medium text-neutral-900">受众：</span>{brief.audience}</div>
        <div><span className="font-medium text-neutral-900">语气：</span>{brief.tone}</div>
      </div>
    </div>
  )
}

function ResearchPlanView({ plan }: { plan: PresentationResearchPlan }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2"><Chip tone="black">资料任务规划</Chip><Chip>{plan.questions.length} 个研究问题</Chip></div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">研究问题</div><List items={plan.questions} /></div>
        <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-600">能力边界</div><List items={plan.limitations} tone="text-amber-800" /></div>
      </div>
    </div>
  )
}

function EvidenceCardView({ card }: { card: PresentationEvidenceCard }) {
  const tone = card.verified ? 'green' : card.source_type === 'evidence_gap' ? 'amber' : 'gray'
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2"><Chip tone={tone}>{card.verified ? '已核验输入' : card.source_type === 'evidence_gap' ? '证据缺口' : '待核验'}</Chip><span className="font-mono text-[11px] text-neutral-400">{card.evidence_id}</span></div>
      <div className="mt-2 text-[13.5px] font-semibold text-neutral-900">{card.claim}</div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-neutral-600">{card.summary}</div>
      <div className="mt-2 text-[11.5px] text-neutral-400">来源：{card.source_ref} · 置信度：{card.confidence}</div>
    </div>
  )
}

function OutlineView({ outline }: { outline: PresentationOutline }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2"><Chip tone="black">叙事结构</Chip><Chip>{outline.sections.length} 个章节</Chip></div>
      <div className="mt-2 text-[14px] font-semibold text-neutral-900">{outline.thesis}</div>
      <div className="mt-1 text-[12.5px] text-neutral-500">{outline.storyline}</div>
      <div className="mt-3 space-y-2">
        {outline.sections.map((section, index) => (
          <div key={`${section.title}-${index}`} className="flex gap-3 rounded-md bg-neutral-50 px-3 py-2">
            <span className="font-mono text-[11px] font-bold text-emerald-600">{String(index + 1).padStart(2, '0')}</span>
            <div><div className="text-[12.5px] font-semibold text-neutral-800">{section.title}</div><div className="text-[12px] text-neutral-500">{section.key_message}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DeckReviewView({ review }: { review: PresentationDeckReview }) {
  return (
    <div className={`rounded-lg border p-4 ${review.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center gap-2"><Chip tone={review.passed ? 'green' : 'amber'}>{review.passed ? '审校通过' : '已触发修订'}</Chip><span className="font-mono text-[13px] font-bold text-neutral-800">{review.score}/100</span></div>
      {review.strengths.length > 0 && <div className="mt-3"><List items={review.strengths} tone="text-neutral-700" /></div>}
      {review.issues.length > 0 && <div className="mt-3"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-700">问题与修订</div><List items={review.issues} tone="text-amber-900" /></div>}
    </div>
  )
}

function PresentationDeckView({ deck }: { deck: PresentationDeck }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const download = async () => {
    setExporting(true)
    setError('')
    try {
      const { exportPresentationDeck } = await import('../lib/presentation-production')
      await exportPresentationDeck(deck)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setExporting(false)
    }
  }
  return (
    <div className="rounded-xl border-2 border-neutral-900 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Chip tone="black">可编辑 PPTX</Chip><Chip>{deck.slides.length} 页</Chip><Chip tone={deck.qa.passed ? 'green' : 'amber'}>{deck.qa.passed ? '基础 QA 通过' : '含质量警告'}</Chip></div>
          <div className="mt-2 text-[17px] font-bold text-neutral-900">{deck.title}</div>
          <div className="mt-1 text-[12.5px] text-neutral-500">{deck.subtitle}</div>
        </div>
        <button onClick={() => void download()} disabled={exporting} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300">
          <Download className="h-4 w-4" />{exporting ? '正在生成…' : '下载可编辑 PPTX'}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {deck.slides.map((slide, index) => (
          <div key={slide.slide_id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            <div className="flex items-center gap-2"><span className="font-mono text-[10.5px] text-emerald-600">{String(index + 1).padStart(2, '0')}</span><span className="truncate text-[12.5px] font-semibold text-neutral-800">{slide.title}</span><span className="ml-auto text-[10px] text-neutral-400">{slide.type}</span></div>
            <div className="mt-1 line-clamp-2 text-[11.5px] text-neutral-500">{slide.key_message}</div>
          </div>
        ))}
      </div>
      {deck.qa.warnings.length > 0 && <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">{deck.qa.warnings.join('；')}</div>}
      {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[11.5px] text-red-700">PPTX 生成失败：{error}</div>}
    </div>
  )
}

// ---- 工件分发 ----
export function ArtifactView({ artifact, config, tokens }: { artifact: Artifact; config?: ScenarioConfig; tokens?: number }) {
  switch (artifact.kind) {
    case 'InitialAssessmentCard':
      return <InitialCard card={artifact} name={agentName(config, artifact.agent_id)} tokens={tokens} />
    case 'CandidateProposal':
      return null // 方案由 ScoreMatrix 之前统一渲染
    case 'PlanScoreCard':
      return null // 评分由矩阵统一渲染
    case 'ConflictMap':
      return <ConflictPanel map={artifact} config={config} />
    case 'ObjectionCard':
      return <ObjectionCardView card={artifact} config={config} tokens={tokens} />
    case 'OuterObservationCard':
      return <OuterCardView card={artifact} config={config} tokens={tokens} />
    case 'FishbowlSummaryCard':
      return <SummaryCardView card={artifact} />
    case 'PresentationBrief':
      return <PresentationBriefView brief={artifact} />
    case 'PresentationResearchPlan':
      return <ResearchPlanView plan={artifact} />
    case 'PresentationEvidenceCard':
      return <EvidenceCardView card={artifact} />
    case 'PresentationOutline':
      return <OutlineView outline={artifact} />
    case 'PresentationDeckReview':
      return <DeckReviewView review={artifact} />
    case 'PresentationDeck':
      return <PresentationDeckView deck={artifact} />
    default:
      return null
  }
}
