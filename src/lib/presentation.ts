import PptxGenJS from 'pptxgenjs'
import type { DeliberationReport, ReportItem } from './report'

const SLIDE_WIDTH = 13.333
const SLIDE_HEIGHT = 7.5
const FONT = 'Microsoft YaHei'

const PALETTE = {
  ink: '111827',
  muted: '6B7280',
  faint: '9CA3AF',
  canvas: 'FFFFFF',
  soft: 'F3F4F6',
  line: 'E5E7EB',
  white: 'FFFFFF',
  dark: '111827',
  darkSoft: '1F2937',
}

function accentFor(category: DeliberationReport['meta']['category']): string {
  if (category === 'single') return '0EA5E9'
  if (category === 'collaborative') return '10B981'
  if (category === 'competitive') return 'F59E0B'
  return '64748B'
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || '议事报告'
}

function itemLines(item: ReportItem): string[] {
  if (item.kind === 'list') {
    return (item.items ?? []).map((entry) => `• ${entry}`)
  }
  const label = item.label ? `${item.label}：` : ''
  if (item.kind === 'score') {
    return [`■ ${label}${item.score ?? 0} / ${item.max ?? 0}${item.text ? ` · ${item.text}` : ''}`]
  }
  if (item.kind === 'status') {
    return [`★ ${label}${item.text ?? ''}`]
  }
  if (item.kind === 'metric') {
    return [`■ ${label}${item.text ?? ''}`]
  }
  return [`■ ${label}${item.text ?? ''}`]
}

function addBrandFooter(slide: PptxGenJS.Slide, accent: string) {
  slide.addShape('rect', { x: 0.75, y: 7.04, w: 0.9, h: 0.035, fill: { color: accent } })
  slide.addText('MA-COLLAB · AI 议事汇报', {
    x: 0.75,
    y: 7.05,
    w: 4.5,
    h: 0.25,
    fontFace: FONT,
    fontSize: 8,
    color: PALETTE.faint,
  })
}

function addHeader(slide: PptxGenJS.Slide, title: string, accent: string) {
  slide.addText(title, {
    x: 0.75,
    y: 0.55,
    w: 10.8,
    h: 0.75,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: PALETTE.ink,
  })
  slide.addShape('rect', { x: 0.78, y: 1.2, w: 0.9, h: 0.065, fill: { color: accent } })
  slide.addText('DELIBERATION REPORT', {
    x: 0.78,
    y: 0.35,
    w: 3.4,
    h: 0.22,
    fontFace: FONT,
    fontSize: 8.5,
    color: accent,
  })
}

function addCoverSlide(pptx: PptxGenJS, report: DeliberationReport, accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.dark }
  slide.addShape('rect', { x: 0, y: 0, w: 0.2, h: SLIDE_HEIGHT, fill: { color: accent } })
  slide.addShape('rect', { x: 0, y: 6.9, w: SLIDE_WIDTH, h: 0.03, fill: { color: accent } })
  slide.addText('MA-COLLAB · DELIBERATION REPORT', {
    x: 0.9,
    y: 0.8,
    w: 8,
    h: 0.35,
    fontFace: FONT,
    fontSize: 10,
    color: accent,
  })
  slide.addText(report.meta.title, {
    x: 0.9,
    y: 1.45,
    w: 11.4,
    h: 1.45,
    fontFace: FONT,
    fontSize: 34,
    bold: true,
    color: PALETTE.white,
  })
  slide.addText(report.meta.issue || '未记录议题', {
    x: 0.9,
    y: 3.0,
    w: 11.4,
    h: 1.2,
    fontFace: FONT,
    fontSize: 15,
    color: 'D1D5DB',
    breakLine: true,
  })
  slide.addText([
    { text: report.meta.categoryLabel, options: { breakLine: true } },
    { text: `状态：${report.meta.terminalState}`, options: { breakLine: true } },
    { text: `${report.meta.agentCount} 个 Agent`, options: { breakLine: true } },
    { text: `${report.meta.calls} 次调用 · ${report.meta.tokens.toLocaleString()} tokens`, options: { breakLine: true } },
    { text: report.meta.generatedAt, options: { breakLine: true } },
  ], {
    x: 0.9,
    y: 4.6,
    w: 11.4,
    h: 1.25,
    fontFace: FONT,
    fontSize: 11,
    color: 'D1D5DB',
    paraSpaceAfter: 4,
  })
  slide.addNotes(`议题：${report.meta.issue}\n任务类别：${report.meta.categoryLabel}\n终止状态：${report.meta.terminalState}`)
}

function addAgendaSlide(pptx: PptxGenJS, report: DeliberationReport, accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.canvas }
  addHeader(slide, '议程', accent)
  const bullets = report.sections.map((section, index) => `${String(index + 1).padStart(2, '0')}  ${section.title}`)
  slide.addText(bullets.map((entry) => ({ text: entry, options: { bullet: true, breakLine: true } })), {
    x: 1,
    y: 1.7,
    w: 11.2,
    h: 4.7,
    fontFace: FONT,
    fontSize: 14,
    color: PALETTE.ink,
    paraSpaceAfter: 8,
    fit: 'shrink',
  })
  addBrandFooter(slide, accent)
}

function addSectionDivider(pptx: PptxGenJS, index: number, section: DeliberationReport['sections'][number], accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.dark }
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: SLIDE_HEIGHT, fill: { color: accent } })
  slide.addText(String(index + 1).padStart(2, '0'), {
    x: 0.9,
    y: 2.0,
    w: 3,
    h: 1.8,
    fontFace: FONT,
    fontSize: 56,
    bold: true,
    color: accent,
  })
  slide.addText(section.title, {
    x: 3.4,
    y: 2.35,
    w: 8.5,
    h: 1.1,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: PALETTE.white,
  })
  if (section.subtitle) {
    slide.addText(section.subtitle, {
      x: 3.4,
      y: 3.35,
      w: 8.5,
      h: 0.8,
      fontFace: FONT,
      fontSize: 13,
      color: 'D1D5DB',
      breakLine: true,
    })
  }
  slide.addNotes(`${section.title}\n${section.subtitle ?? ''}`)
}

function addContentSlide(
  pptx: PptxGenJS,
  report: DeliberationReport,
  section: DeliberationReport['sections'][number],
  items: ReportItem[],
  partIndex: number,
  partCount: number,
  accent: string,
) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.canvas }
  const suffix = partCount > 1 ? ` · ${partIndex + 1}/${partCount}` : ''
  addHeader(slide, `${section.title}${suffix}`, accent)
  const lines = items.flatMap((item) => [...itemLines(item), ''])
  slide.addText(lines.filter(Boolean).join('\n'), {
    x: 1.0,
    y: 1.75,
    w: 11.2,
    h: 4.85,
    fontFace: FONT,
    fontSize: 13,
    color: PALETTE.ink,
    lineSpacing: 20,
    paraSpaceAfter: 5,
    breakLine: true,
    fit: 'shrink',
  })
  addBrandFooter(slide, accent)
  slide.addNotes(lines.filter(Boolean).join('\n'))
  void report
}

function addClosingSlide(pptx: PptxGenJS, report: DeliberationReport, accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.dark }
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: SLIDE_HEIGHT, fill: { color: accent } })
  slide.addText('结论与授权边界', {
    x: 0.9,
    y: 2.1,
    w: 11,
    h: 0.8,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: PALETTE.white,
  })
  slide.addText('本报告由 AI 多智能体议事生成，仅用于辅助分析，不替代真实公共决策与实地调研。', {
    x: 0.9,
    y: 3.1,
    w: 11,
    h: 1.0,
    fontFace: FONT,
    fontSize: 14,
    color: 'D1D5DB',
    breakLine: true,
  })
  slide.addText(report.meta.title, {
    x: 0.9,
    y: 4.3,
    w: 11,
    h: 0.4,
    fontFace: FONT,
    fontSize: 10,
    color: PALETTE.faint,
  })
}

export function buildReportPresentation(report: DeliberationReport): PptxGenJS {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'DELIBERATION_WIDE', width: SLIDE_WIDTH, height: SLIDE_HEIGHT })
  pptx.layout = 'DELIBERATION_WIDE'
  const accent = accentFor(report.meta.category)
  addCoverSlide(pptx, report, accent)
  addAgendaSlide(pptx, report, accent)

  report.sections.forEach((section, index) => {
    addSectionDivider(pptx, index, section, accent)
    const chunkSize = 4
    const chunks = Array.from({ length: Math.ceil(section.items.length / chunkSize) }, (_, chunkIndex) =>
      section.items.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize),
    )
    if (chunks.length === 0) chunks.push([])
    chunks.forEach((items, chunkIndex) => {
      addContentSlide(pptx, report, section, items, chunkIndex, chunks.length, accent)
    })
  })

  addClosingSlide(pptx, report, accent)
  return pptx
}

export async function exportReportAsPptx(report: DeliberationReport): Promise<void> {
  const pptx = buildReportPresentation(report)
  await pptx.writeFile({ fileName: `${safeFileName(report.meta.title)}.pptx`, compression: true })
}
