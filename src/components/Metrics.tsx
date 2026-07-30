/**
 * Observer 指标 + TokenLedger 成本面板
 */
import type { MetricsSnapshot } from '../engine/types'
import { Chip } from './common'

function MetricRow({ label, value, hint, warn = false }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12.5px] text-neutral-600" title={hint}>{label}</span>
      <span className={`font-mono text-[12.5px] font-semibold ${warn ? 'text-red-600' : 'text-neutral-900'}`}>{value}</span>
    </div>
  )
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`

export function MetricsPanel({ metrics, ledger }: { metrics: MetricsSnapshot | null; ledger: { total_tokens: number; calls: number; by_phase: Record<string, number> } }) {
  return (
    <div className="space-y-4">
      {/* Token 账本 */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-neutral-900">TokenLedger</span>
          <span className="font-mono text-[11px] text-neutral-400">成本账本</span>
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="font-mono text-[24px] font-bold leading-none text-neutral-900">{ledger.total_tokens.toLocaleString()}</span>
          <span className="text-[11px] text-neutral-400">tokens · {ledger.calls} 次调用</span>
        </div>
        <div className="mt-3 space-y-1">
          {Object.entries(ledger.by_phase).map(([phase, tokens]) => {
            const max = Math.max(...Object.values(ledger.by_phase), 1)
            return (
              <div key={phase} className="flex items-center gap-2">
                <span className="w-24 truncate font-mono text-[10.5px] text-neutral-500">{phase}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-neutral-400 transition-all duration-500" style={{ width: `${(tokens / max) * 100}%` }} />
                </div>
                <span className="w-14 text-right font-mono text-[10.5px] text-neutral-400">{tokens.toLocaleString()}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Observer */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-neutral-900">Observer</span>
          <span className="font-mono text-[11px] text-neutral-400">过程指标</span>
        </div>
        {metrics ? (
          <div className="mt-1.5 divide-y divide-neutral-50">
            <MetricRow label="发言公平性 Gini" value={metrics.fairness_gini.toFixed(3)} hint="发言分布基尼系数，越低越均衡" warn={metrics.fairness_gini > 0.35} />
            <MetricRow label="Grounding 率" value={pct(metrics.grounding_rate)} hint="带依据的发言占比" />
            <MetricRow label="回应率" value={pct(metrics.response_rate)} hint="质询被明确回应的比例" />
            <MetricRow label="少数意见保留率" value={pct(metrics.minority_retention)} warn={metrics.minority_retention < 0.5 && metrics.minority_retention > 0} />
            <MetricRow label="鱼缸轮换率" value={metrics.rotation_rate > 0 ? pct(metrics.rotation_rate) : '—'} />
            <MetricRow label="外圈观察吸收率" value={metrics.outer_absorption_rate > 0 ? pct(metrics.outer_absorption_rate) : '—'} />
            <div className="py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-neutral-600">共识趋势</span>
                {metrics.consensus_collapse_warning && <Chip tone="red">共识坍缩警报</Chip>}
              </div>
              {metrics.consensus_trend.length > 0 ? (
                <div className="mt-1.5 flex h-10 items-end gap-1">
                  {metrics.consensus_trend.map((v, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-neutral-900/80 transition-all duration-500" style={{ height: `${Math.max(8, v * 100)}%` }} title={`${v.toFixed(2)}`} />
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-neutral-300">等待数据…</div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-neutral-300">运行后显示过程指标</div>
        )}
        {metrics && metrics.anomalies.length > 0 && (
          <div className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-[11.5px] text-red-600">
            异常：{metrics.anomalies.join('、')}
          </div>
        )}
      </div>
    </div>
  )
}
