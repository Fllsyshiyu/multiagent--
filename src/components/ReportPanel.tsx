import { useMemo, useRef, useState, type RefObject } from 'react'
import { Download, Presentation, X } from 'lucide-react'
import type { RunState } from '../hooks/useRunEngine'
import {
  buildDeliberationReport, buildFullDeliberationReport, exportReportAsPdf, printReportAsPdf,
  type DeliberationReport, type ReportItem, type ReportSection,
} from '../lib/report'
import { exportAiPptx } from '../lib/presentation'
import { generateAISlideOutline } from '../lib/ai-ppt'
import { createLLMCaller } from '../engine/llm'
import { activeLLMProfile, loadLLMSettings } from '../lib/llm-settings'

function toneClass(tone?: ReportItem['tone']) {
  if (tone === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (tone === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (tone === 'danger') return 'bg-red-50 text-red-600 border-red-200'
  return 'bg-neutral-50 text-neutral-700 border-neutral-200'
}

function ReportItemView({ item }: { item: ReportItem }) {
  if (item.kind === 'list') {
    return (
      <ul className="space-y-1">
        {(item.items ?? []).map((entry, index) => (
          <li key={index} data-report-block="list-item" className="flex gap-2 text-[13px] leading-relaxed text-neutral-700">
            <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
            <span>{entry}</span>
          </li>
        ))}
      </ul>
    )
  }
  if (item.kind === 'metric') {
    return (
      <div data-report-block="metric" className="flex items-start justify-between gap-4 border-b border-dashed border-neutral-100 py-1.5">
        <span className="w-24 shrink-0 text-[12px] font-medium text-neutral-500">{item.label}</span>
        <span className="text-right text-[13px] leading-relaxed text-neutral-800">{item.text}</span>
      </div>
    )
  }
  if (item.kind === 'score') {
    const percent = Math.max(0, Math.min(100, ((item.score ?? 0) / Math.max(1, item.max ?? 1)) * 100))
    return (
      <div data-report-block="score" className="rounded-md border border-neutral-200 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-800">{item.label}</span>
          <span className="font-mono text-[12px] text-neutral-600">{item.score} / {item.max}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-neutral-900" style={{ width: `${percent}%` }} />
        </div>
        {item.text && <div className="mt-1 text-[12px] text-neutral-500">{item.text}</div>}
      </div>
    )
  }
  if (item.kind === 'status') {
    return (
      <div data-report-block="status" className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium ${toneClass(item.tone)}`}>
        <span>{item.label}：</span>
        <span>{item.text}</span>
      </div>
    )
  }
  return (
    <div data-report-block="text" className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700">
      {item.label && <span className="mr-1 font-medium text-neutral-900">{item.label}</span>}
      {item.text}
    </div>
  )
}

function ReportSectionView({ section }: { section: ReportSection }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <div data-report-block="section-title" className="mb-2 flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-neutral-900" />
        <h3 className="text-[15px] font-bold text-neutral-900">{section.title}</h3>
      </div>
      {section.subtitle && <div data-report-block="section-subtitle" className="mb-2 text-[12px] text-neutral-400">{section.subtitle}</div>}
      <div className="space-y-2">{section.items.map((item, index) => <ReportItemView key={index} item={item} />)}</div>
    </section>
  )
}

function ReportDocument({ report, containerRef }: { report: DeliberationReport; containerRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={containerRef} className="bg-white px-8 py-7">
      <div className="mb-6 border-b border-neutral-100 pb-5">
        <div data-report-block="report-title" className="text-[22px] font-bold leading-tight text-neutral-900">{report.meta.title}</div>
        <div data-report-block="report-category" className="mt-1 text-[13px] text-neutral-500">{report.meta.categoryLabel}</div>
        <div data-report-block="report-issue" className="mt-3 rounded-lg bg-neutral-50 px-4 py-3 text-[13px] leading-relaxed text-neutral-700">
          <span className="font-medium text-neutral-900">议题：</span>
          {report.meta.issue || '未记录'}
        </div>
      </div>
      {report.sections.map((section) => <ReportSectionView key={section.id} section={section} />)}
      <div data-report-block="report-footer" className="mt-4 border-t border-neutral-100 pt-4 text-center text-[11px] text-neutral-400">
        本报告由 MA-Collab 多智能体编排框架自动生成 · AI 分析结果仅用于辅助参考
      </div>
    </div>
  )
}

export function ReportPanel({ state, onClose }: { state: RunState; onClose: () => void }) {
  const reportRef = useRef<HTMLDivElement>(null)
  const fullReportRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState<'concise' | 'full' | 'ppt-concise' | 'ppt-full' | 'print' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const report = useMemo(() => buildDeliberationReport(state), [state])
  const fullReport = useMemo(() => buildFullDeliberationReport(state), [state])

  const handleExport = async (kind: 'concise' | 'full') => {
    const target = kind === 'full' ? fullReportRef.current : reportRef.current
    const selectedReport = kind === 'full' ? fullReport : report
    if (!target || exporting) return
    setExporting(kind)
    setExportError(null)
    try {
      await exportReportAsPdf(target, selectedReport.meta.title)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setExportError(message)
      console.error('PDF 导出失败：', error)
    } finally {
      setExporting(null)
    }
  }

  const handlePrint = async () => {
    if (!reportRef.current || exporting) return
    setExporting('print')
    setExportError(null)
    try {
      await printReportAsPdf(reportRef.current)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setExportError(message)
      console.error('打印失败：', error)
    } finally {
      setExporting(null)
    }
  }

  /** AI 生成 PPT：先用已配置的 LLM 生成受控大纲，再渲染导出，从源头杜绝文字溢出 */
  const handleExportPpt = async (kind: 'ppt-concise' | 'ppt-full') => {
    if (exporting) return
    const selectedReport = kind === 'ppt-full' ? fullReport : report
    const profile = activeLLMProfile(loadLLMSettings())
    if (!profile) {
      setExportError('未配置 LLM API。请先在「设置」中填写 Base URL 与 API Key，再使用 AI 生成 PPT。')
      return
    }
    setExporting(kind)
    setExportError(null)
    try {
      const caller = createLLMCaller(profile)
      const slides = await generateAISlideOutline(selectedReport, caller)
      await exportAiPptx(selectedReport, slides)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setExportError(message)
      console.error('AI PPT 导出失败：', error)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div
        className="mx-auto my-6 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-white/95 px-6 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-bold text-neutral-900">{report.meta.title}</h2>
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">{report.meta.categoryLabel}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-neutral-400">生成时间 {report.meta.generatedAt} · {report.meta.tokens.toLocaleString()} tokens</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('concise')}
              disabled={Boolean(exporting)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting === 'concise' ? '导出中…' : '导出精炼报告'}
            </button>
            <button
              onClick={() => handleExport('full')}
              disabled={Boolean(exporting)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-900 px-3.5 py-2 text-[12.5px] font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting === 'full' ? '导出中…' : '导出完整报告'}
            </button>
            <button
              onClick={() => handleExportPpt('ppt-concise')}
              disabled={Boolean(exporting)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-[12.5px] font-medium text-neutral-700 transition-colors hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Presentation className="h-3.5 w-3.5" />
              {exporting === 'ppt-concise' ? 'AI 生成中…' : 'AI 生成运行报告 PPT'}
            </button>
            <button
              onClick={() => handleExportPpt('ppt-full')}
              disabled={Boolean(exporting)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-[12.5px] font-medium text-neutral-700 transition-colors hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Presentation className="h-3.5 w-3.5" />
              {exporting === 'ppt-full' ? 'AI 生成中…' : 'AI 生成完整审计 PPT'}
            </button>
            <button
              onClick={handlePrint}
              disabled={Boolean(exporting)}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-[12.5px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
            >
              {exporting === 'print' ? '生成中…' : '打印'}
            </button>
            <button onClick={onClose} className="rounded-lg border border-neutral-200 p-2 text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-700" aria-label="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {exportError && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-2.5 text-[12px] leading-relaxed text-red-600">
            自动导出失败：{exportError}。可点击「打印」，在浏览器打印对话框中选择"另存为 PDF"。
          </div>
        )}
        <ReportDocument report={report} containerRef={reportRef} />
      </div>
      <div className="fixed left-[-10000px] top-0 w-[794px] bg-white" aria-hidden="true">
        <ReportDocument report={fullReport} containerRef={fullReportRef} />
      </div>
    </div>
  )
}
