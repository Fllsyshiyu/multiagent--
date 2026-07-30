/**
 * 试卷评估视图 · 冻结试卷 + 阅卷成绩
 */
import type { ExamBlueprint, ExamResult } from '../engine/types'
import { Chip } from './common'

export function ExamBlueprintView({ bp }: { bp: ExamBlueprint }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-neutral-900">评测试卷 · 已冻结</span>
          <Chip tone="black">先于议事生成，不允许改题</Chip>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-red-200 bg-white p-3.5">
          <div className="text-[12px] font-semibold text-red-600">第一层 · 红线合规门（{bp.red_lines.length} 条）</div>
          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-neutral-600">
            {bp.red_lines.map((r, i) => <li key={i} className="flex gap-1.5"><span className="text-red-400">✕</span>{r}</li>)}
          </ul>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3.5">
          <div className="text-[12px] font-semibold text-neutral-900">第二层 · 客观题（40 分）</div>
          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-neutral-600">
            {bp.objective.map((o, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{o.module}</span><span className="shrink-0 font-mono text-neutral-400">{o.full_score}分</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3.5">
          <div className="text-[12px] font-semibold text-neutral-900">第三层 · 主观题（60 分）</div>
          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-neutral-600">
            {bp.subjective.map((s, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{s.module}</span><span className="shrink-0 font-mono text-neutral-400">{s.full_score}分</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function ScoreBar({ label, score, full, comment }: { label: string; score: number; full: number; comment: string }) {
  const pct = Math.min(100, (score / full) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-neutral-700">{label}</span>
        <span className="font-mono text-[12px] text-neutral-500">{score} / {full}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-neutral-900 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      {comment && <div className="mt-1 text-[11.5px] leading-relaxed text-neutral-400">{comment}</div>}
    </div>
  )
}

export function ExamResultView({ result }: { result: ExamResult }) {
  const gateTone = result.red_line_gate === 'pass' ? 'green' : result.red_line_gate === 'revise' ? 'amber' : 'red'
  return (
    <div className="rounded-xl border-2 border-neutral-900 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-neutral-900">阅卷成绩</span>
          <Chip tone={gateTone}>红线门 {result.red_line_gate.toUpperCase()}</Chip>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-[34px] font-bold leading-none text-neutral-900">{result.total}</span>
          <span className="font-mono text-[14px] text-neutral-400">/ 100</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 px-5 py-4 sm:grid-cols-2">
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] font-bold text-neutral-900">客观题</span>
            <span className="font-mono text-[15px] font-bold text-neutral-900">{result.objective_total}<span className="text-[12px] font-normal text-neutral-400"> / 40</span></span>
          </div>
          <div className="space-y-3.5">
            {result.objective_scores.map((s, i) => <ScoreBar key={i} label={s.module} score={s.score} full={s.full_score} comment={s.comment} />)}
          </div>
        </div>
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] font-bold text-neutral-900">主观题</span>
            <span className="font-mono text-[15px] font-bold text-neutral-900">{result.subjective_total}<span className="text-[12px] font-normal text-neutral-400"> / 60</span></span>
          </div>
          <div className="space-y-3.5">
            {result.subjective_scores.map((s, i) => <ScoreBar key={i} label={s.module} score={s.score} full={s.full_score} comment={s.comment} />)}
          </div>
        </div>
      </div>
      {result.grade_comment && (
        <div className="border-t border-neutral-100 px-5 py-3.5 text-[13px] leading-relaxed text-neutral-600">
          <span className="font-semibold text-neutral-900">总评：</span>{result.grade_comment}
        </div>
      )}
      {result.red_line_notes.length > 0 && (
        <div className="border-t border-neutral-100 px-5 py-3 text-[12px] text-neutral-500">
          {result.red_line_notes.join('；')}
        </div>
      )}
    </div>
  )
}
