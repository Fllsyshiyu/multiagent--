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

function cleanText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const CONTENT_CHARS_PER_LINE = 54
const CONTENT_MAX_LINES = 11

function wrapParagraph(value: string): string[] {
  if (!value) return ['']
  const lines: string[] = []
  let current = ''
  for (const char of value) {
    current += char
    if (current.length >= CONTENT_CHARS_PER_LINE) {
      lines.push(current)
      current = ''
    }
  }
  if (current) lines.push(current)
  return lines
}

function itemLines(item: ReportItem): string[] {
  if (item.kind === 'list') {
    return (item.items ?? []).map((entry) => `• ${cleanText(entry)}`)
  }
  const label = item.label ? `${cleanText(item.label)}：` : ''
  const value = cleanText(item.text ?? '')
  if (item.kind === 'score') {
    return [`■ ${label}${item.score ?? 0} / ${item.max ?? 0}${value ? ` · ${value}` : ''}`]
  }
  if (item.kind === 'status') {
    return [`★ ${label}${value}`]
  }
  if (item.kind === 'metric') {
    return [`■ ${label}${value}`]
  }
  return [`■ ${label}${value}`]
}

function packBlocks(blocks: string[][]): string[] {
  const pages: string[][] = [[]]
  for (const sourceBlock of blocks) {
    let block = sourceBlock.flatMap(wrapParagraph)
    while (block.length) {
      const page = pages[pages.length - 1]
      const capacity = CONTENT_MAX_LINES - page.length
      if (capacity <= 0) {
        pages.push([])
        continue
      }
      page.push(...block.slice(0, capacity))
      block = block.slice(capacity)
      if (block.length) pages.push([])
    }
  }
  return pages.map((lines) => lines.join('\n'))
}

function pageItems(items: ReportItem[]): string[] {
  if (!items.length) return ['暂无内容']
  return packBlocks(items.map((item) => itemLines(item)))
}

function pageAgenda(sections: DeliberationReport['sections']): string[] {
  return packBlocks(sections.map((section, index) => [
    `${String(index + 1).padStart(2, '0')}  ${cleanText(section.title)}`,
  ]))
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
    y: 0.52,
    w: 10.8,
    h: 0.82,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: PALETTE.ink,
    breakLine: true,
    fit: 'shrink',
  })
  slide.addShape('rect', { x: 0.78, y: 1.25, w: 0.9, h: 0.065, fill: { color: accent } })
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
  slide.addText(cleanText(report.meta.title), {
    x: 0.9,
    y: 1.45,
    w: 11.4,
    h: 1.6,
    fontFace: FONT,
    fontSize: 34,
    bold: true,
    color: PALETTE.white,
    fit: 'shrink',
  })
  slide.addText(cleanText(report.meta.issue || '未记录议题'), {
    x: 0.9,
    y: 3.0,
    w: 11.4,
    h: 1.3,
    fontFace: FONT,
    fontSize: 15,
    color: 'D1D5DB',
    breakLine: true,
    fit: 'shrink',
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
  slide.addNotes(`议题：${cleanText(report.meta.issue)}\n任务类别：${cleanText(report.meta.categoryLabel)}\n终止状态：${report.meta.terminalState}`)
}

function addAgendaSlide(pptx: PptxGenJS, content: string, partIndex: number, partCount: number, accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.canvas }
  addHeader(slide, partCount > 1 ? `议程 · ${partIndex + 1}/${partCount}` : '议程', accent)
  slide.addText(content.split('\n').map((text) => ({ text, options: { breakLine: true } })), {
    x: 1,
    y: 1.7,
    w: 11.2,
    h: 4.7,
    fontFace: FONT,
    fontSize: 13,
    color: PALETTE.ink,
    paraSpaceAfter: 7,
    fit: 'shrink',
  })
  addBrandFooter(slide, accent)
  slide.addNotes(content)
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
  slide.addText(cleanText(section.title), {
    x: 3.4,
    y: 2.35,
    w: 8.5,
    h: 1.25,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: PALETTE.white,
    breakLine: true,
    fit: 'shrink',
  })
  if (section.subtitle) {
    slide.addText(cleanText(section.subtitle), {
      x: 3.4,
      y: 3.35,
      w: 8.5,
      h: 0.9,
      fontFace: FONT,
      fontSize: 13,
      color: 'D1D5DB',
      breakLine: true,
      fit: 'shrink',
    })
  }
  slide.addNotes(`${cleanText(section.title)}\n${cleanText(section.subtitle ?? '')}`)
}

function addContentSlide(
  pptx: PptxGenJS,
  section: DeliberationReport['sections'][number],
  content: string,
  partIndex: number,
  partCount: number,
  accent: string,
) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.canvas }
  const suffix = partCount > 1 ? ` · ${partIndex + 1}/${partCount}` : ''
  addHeader(slide, `${cleanText(section.title)}${suffix}`, accent)
  slide.addText(content.split('\n').map((text) => ({ text, options: { breakLine: true } })), {
    x: 1.0,
    y: 1.75,
    w: 11.2,
    h: 4.7,
    fontFace: FONT,
    fontSize: 12,
    color: PALETTE.ink,
    lineSpacing: 18,
    paraSpaceAfter: 4,
    breakLine: true,
    fit: 'shrink',
  })
  addBrandFooter(slide, accent)
  slide.addNotes(content)
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
  const agendaPages = pageAgenda(report.sections)
  agendaPages.forEach((content, index) => addAgendaSlide(pptx, content, index, agendaPages.length, accent))

  report.sections.forEach((section, index) => {
    addSectionDivider(pptx, index, section, accent)
    const pages = pageItems(section.items)
    pages.forEach((content, pageIndex) => {
      addContentSlide(pptx, section, content, pageIndex, pages.length, accent)
    })
  })

  addClosingSlide(pptx, report, accent)
  return pptx
}

export async function exportReportAsPptx(report: DeliberationReport): Promise<void> {
  const pptx = buildReportPresentation(report)
  await pptx.writeFile({ fileName: `${safeFileName(report.meta.title)}.pptx`, compression: true })
}
