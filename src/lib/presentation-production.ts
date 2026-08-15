import PptxGenJS from 'pptxgenjs'
import type { PresentationDeck, PresentationSlideSpec } from '../engine/types'

const W = 13.333
const H = 7.5
const FONT = 'Microsoft YaHei'
const COLOR = { ink: '111827', muted: '667085', line: 'E5E7EB', soft: 'F4F7F6', accent: '0F9F6E', accentSoft: 'DDF7EC', white: 'FFFFFF', dark: '0B1F18', amber: 'F59E0B' }

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || '多智能体演示文稿'
}

function short(value: string, max: number): string {
  const chars = [...value]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : value
}

function titleSize(value: string, base = 28): number {
  const length = [...value].length
  return length > 30 ? base - 6 : length > 22 ? base - 3 : base
}

function addFooter(slide: PptxGenJS.Slide, deck: PresentationDeck, index: number, spec: PresentationSlideSpec) {
  slide.addShape('line', { x: 0.65, y: 7.02, w: 12.03, h: 0, line: { color: COLOR.line, width: 0.7 } })
  slide.addText('MA-COLLAB · MULTI-AGENT PRESENTATION', { x: 0.7, y: 7.08, w: 4.4, h: 0.2, fontFace: FONT, fontSize: 7.5, color: '98A2B3' })
  slide.addText(`${index + 1} / ${deck.slides.length}`, { x: 11.6, y: 7.08, w: 1.0, h: 0.2, fontFace: FONT, fontSize: 8, color: COLOR.muted, align: 'right' })
  if (spec.source_refs.length) slide.addText(`来源：${spec.source_refs.join('、')}`, { x: 6.2, y: 7.08, w: 5.1, h: 0.2, fontFace: FONT, fontSize: 7.5, color: '98A2B3', align: 'right', fit: 'shrink' })
}

function addHeader(slide: PptxGenJS.Slide, deck: PresentationDeck, spec: PresentationSlideSpec, index: number) {
  slide.addText(String(index + 1).padStart(2, '0'), { x: 0.7, y: 0.5, w: 0.55, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: COLOR.accent })
  slide.addText(short(spec.title, 40), { x: 1.3, y: 0.38, w: 10.8, h: 0.62, fontFace: FONT, fontSize: titleSize(spec.title), bold: true, color: COLOR.ink, fit: 'shrink' })
  slide.addShape('rect', { x: 1.3, y: 1.08, w: 1.0, h: 0.06, fill: { color: COLOR.accent }, line: { color: COLOR.accent } })
  addFooter(slide, deck, index, spec)
}

function addKeyMessage(slide: PptxGenJS.Slide, message: string, y = 1.42) {
  slide.addShape('roundRect', { x: 0.75, y, w: 11.85, h: 0.85, rectRadius: 0.08, fill: { color: COLOR.accentSoft }, line: { color: COLOR.accentSoft } })
  slide.addText(short(message, 120), { x: 1.05, y: y + 0.16, w: 11.25, h: 0.48, fontFace: FONT, fontSize: 18, bold: true, color: COLOR.dark, align: 'center', valign: 'middle', fit: 'shrink' })
}

function addBulletCards(slide: PptxGenJS.Slide, bullets: string[], startY = 2.58) {
  const items = (bullets.length ? bullets : ['本页内容待进一步补充']).slice(0, 6)
  const cols = items.length > 3 ? 2 : 1
  const cardW = cols === 2 ? 5.65 : 11.45
  const rows = Math.ceil(items.length / cols)
  const cardH = Math.min(1.05, (4.0 - (rows - 1) * 0.16) / rows)
  items.forEach((item, index) => {
    const col = cols === 2 ? index % 2 : 0
    const row = cols === 2 ? Math.floor(index / 2) : index
    const x = 0.85 + col * 5.85
    const y = startY + row * (cardH + 0.16)
    slide.addShape('roundRect', { x, y, w: cardW, h: cardH, rectRadius: 0.06, fill: { color: index === 0 ? 'F8FAFC' : COLOR.white }, line: { color: COLOR.line, width: 0.8 } })
    slide.addShape('ellipse', { x: x + 0.22, y: y + cardH / 2 - 0.12, w: 0.24, h: 0.24, fill: { color: COLOR.accent }, line: { color: COLOR.accent } })
    slide.addText(short(item, 90), { x: x + 0.62, y: y + 0.14, w: cardW - 0.85, h: cardH - 0.24, fontFace: FONT, fontSize: 15, color: COLOR.ink, valign: 'middle', fit: 'shrink', breakLine: true })
  })
}

function addCover(pptx: PptxGenJS, deck: PresentationDeck, spec: PresentationSlideSpec) {
  const slide = pptx.addSlide()
  slide.background = { color: COLOR.dark }
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: H, fill: { color: COLOR.accent }, line: { color: COLOR.accent } })
  slide.addShape('ellipse', { x: 9.95, y: 0.05, w: 3.25, h: 3.25, fill: { color: '123D2E', transparency: 10 }, line: { color: '123D2E', transparency: 100 } })
  slide.addShape('ellipse', { x: 10.45, y: 4.55, w: 2.75, h: 2.75, fill: { color: COLOR.accent, transparency: 35 }, line: { color: COLOR.accent, transparency: 100 } })
  slide.addText('MULTI-AGENT PRESENTATION', { x: 0.92, y: 0.75, w: 5.5, h: 0.3, fontFace: FONT, fontSize: 10, color: '6EE7B7', charSpacing: 1.5 })
  slide.addText(short(spec.title || deck.title, 42), { x: 0.92, y: 1.48, w: 10.8, h: 1.55, fontFace: FONT, fontSize: titleSize(spec.title || deck.title, 42), bold: true, color: COLOR.white, fit: 'shrink', breakLine: true })
  slide.addText(short(spec.subtitle || deck.subtitle || spec.key_message, 100), { x: 0.95, y: 3.25, w: 9.9, h: 0.9, fontFace: FONT, fontSize: 18, color: 'D1FAE5', fit: 'shrink', breakLine: true })
  slide.addShape('line', { x: 0.95, y: 5.55, w: 4.2, h: 0, line: { color: COLOR.accent, width: 2.2 } })
  slide.addText(`${deck.brief.audience}\n${new Date().toLocaleDateString('zh-CN')}`, { x: 0.95, y: 5.75, w: 6.5, h: 0.65, fontFace: FONT, fontSize: 11, color: 'A7F3D0', breakLine: true })
  slide.addNotes(spec.speaker_notes)
}

function addAgenda(pptx: PptxGenJS, deck: PresentationDeck, spec: PresentationSlideSpec, index: number) {
  const slide = pptx.addSlide()
  addHeader(slide, deck, spec, index)
  const items = (spec.bullets.length ? spec.bullets : deck.slides.slice(2, -1).map((item) => item.title)).slice(0, 8)
  items.forEach((item, idx) => {
    const col = idx >= 4 ? 1 : 0
    const row = idx % 4
    const x = 0.9 + col * 6.0
    const y = 1.65 + row * 1.12
    slide.addText(String(idx + 1).padStart(2, '0'), { x, y, w: 0.65, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: COLOR.accent })
    slide.addText(short(item, 34), { x: x + 0.72, y: y - 0.02, w: 4.9, h: 0.72, fontFace: FONT, fontSize: 18, bold: true, color: COLOR.ink, fit: 'shrink', breakLine: true })
    slide.addShape('line', { x: x + 0.72, y: y + 0.72, w: 4.85, h: 0, line: { color: COLOR.line, width: 0.7 } })
  })
  slide.addNotes(spec.speaker_notes)
}

function addComparison(pptx: PptxGenJS, deck: PresentationDeck, spec: PresentationSlideSpec, index: number) {
  const slide = pptx.addSlide()
  addHeader(slide, deck, spec, index)
  addKeyMessage(slide, spec.key_message)
  const columns = spec.columns?.length ? spec.columns.slice(0, 3) : [
    { title: '主要信息', points: spec.bullets.slice(0, 3) }, { title: '补充视角', points: spec.bullets.slice(3) },
  ]
  const w = (11.8 - (columns.length - 1) * 0.25) / columns.length
  columns.forEach((column, col) => {
    const x = 0.77 + col * (w + 0.25)
    slide.addShape('roundRect', { x, y: 2.55, w, h: 3.85, rectRadius: 0.06, fill: { color: col === 0 ? COLOR.accentSoft : COLOR.soft }, line: { color: col === 0 ? 'A7E7CF' : COLOR.line } })
    slide.addText(short(column.title, 24), { x: x + 0.28, y: 2.83, w: w - 0.56, h: 0.45, fontFace: FONT, fontSize: 19, bold: true, color: col === 0 ? COLOR.dark : COLOR.ink, align: 'center', fit: 'shrink' })
    slide.addText(column.points.slice(0, 5).map((point) => `• ${short(point, 58)}`).join('\n'), { x: x + 0.35, y: 3.48, w: w - 0.7, h: 2.45, fontFace: FONT, fontSize: 14, color: COLOR.ink, breakLine: true, paraSpaceAfter: 9, fit: 'shrink', valign: 'middle' })
  })
  slide.addNotes(spec.speaker_notes)
}

function addProcess(pptx: PptxGenJS, deck: PresentationDeck, spec: PresentationSlideSpec, index: number) {
  const slide = pptx.addSlide()
  addHeader(slide, deck, spec, index)
  addKeyMessage(slide, spec.key_message)
  const steps = spec.steps?.length ? spec.steps.slice(0, 6) : spec.bullets.slice(0, 6).map((item, idx) => ({ title: `步骤 ${idx + 1}`, detail: item }))
  const count = Math.max(1, steps.length)
  const gap = 0.18
  const stepW = (11.75 - gap * (count - 1)) / count
  steps.forEach((step, idx) => {
    const x = 0.78 + idx * (stepW + gap)
    if (idx < count - 1) slide.addShape('line', { x: x + stepW, y: 4.35, w: gap, h: 0, line: { color: COLOR.accent, width: 1.5, beginArrowType: 'none', endArrowType: 'triangle' } })
    slide.addShape('roundRect', { x, y: 3.02, w: stepW, h: 2.65, rectRadius: 0.06, fill: { color: idx % 2 === 0 ? COLOR.soft : COLOR.white }, line: { color: COLOR.line } })
    slide.addShape('ellipse', { x: x + stepW / 2 - 0.28, y: 3.3, w: 0.56, h: 0.56, fill: { color: COLOR.accent }, line: { color: COLOR.accent } })
    slide.addText(String(idx + 1), { x: x + stepW / 2 - 0.18, y: 3.39, w: 0.36, h: 0.24, fontFace: FONT, fontSize: 12, bold: true, color: COLOR.white, align: 'center' })
    slide.addText(short(step.title, 18), { x: x + 0.15, y: 4.02, w: stepW - 0.3, h: 0.48, fontFace: FONT, fontSize: 16, bold: true, color: COLOR.ink, align: 'center', fit: 'shrink' })
    slide.addText(short(step.detail, 58), { x: x + 0.18, y: 4.63, w: stepW - 0.36, h: 0.72, fontFace: FONT, fontSize: 11.5, color: COLOR.muted, align: 'center', valign: 'middle', fit: 'shrink', breakLine: true })
  })
  slide.addNotes(spec.speaker_notes)
}

function addStandard(pptx: PptxGenJS, deck: PresentationDeck, spec: PresentationSlideSpec, index: number) {
  const slide = pptx.addSlide()
  addHeader(slide, deck, spec, index)
  addKeyMessage(slide, spec.key_message)
  addBulletCards(slide, spec.bullets)
  slide.addNotes(`${spec.speaker_notes}${spec.source_refs.length ? `\n来源引用：${spec.source_refs.join('、')}` : ''}`)
}

function addConclusion(pptx: PptxGenJS, deck: PresentationDeck, spec: PresentationSlideSpec, index: number) {
  const slide = pptx.addSlide()
  slide.background = { color: COLOR.dark }
  slide.addText('结论与下一步', { x: 0.9, y: 0.7, w: 6.5, h: 0.65, fontFace: FONT, fontSize: 30, bold: true, color: COLOR.white })
  slide.addShape('rect', { x: 0.92, y: 1.52, w: 1.0, h: 0.06, fill: { color: COLOR.accent }, line: { color: COLOR.accent } })
  slide.addText(short(spec.key_message, 140), { x: 0.92, y: 2.0, w: 11.2, h: 1.05, fontFace: FONT, fontSize: 23, bold: true, color: 'D1FAE5', fit: 'shrink', breakLine: true })
  const bullets = spec.bullets.slice(0, 4)
  bullets.forEach((item, idx) => {
    slide.addShape('ellipse', { x: 0.98, y: 3.55 + idx * 0.7, w: 0.28, h: 0.28, fill: { color: COLOR.accent }, line: { color: COLOR.accent } })
    slide.addText(short(item, 80), { x: 1.48, y: 3.42 + idx * 0.7, w: 9.8, h: 0.5, fontFace: FONT, fontSize: 16, color: COLOR.white, fit: 'shrink' })
  })
  slide.addText(`${index + 1} / ${deck.slides.length}`, { x: 11.4, y: 6.9, w: 1.0, h: 0.25, fontFace: FONT, fontSize: 8, color: '9CA3AF', align: 'right' })
  slide.addNotes(spec.speaker_notes)
}

export function buildPresentationDeck(deck: PresentationDeck): PptxGenJS {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'MA_PRESENTATION_WIDE', width: W, height: H })
  pptx.layout = 'MA_PRESENTATION_WIDE'
  pptx.author = 'MA-Collab Multi-Agent Presentation Pipeline'
  pptx.subject = deck.subtitle
  pptx.title = deck.title
  pptx.company = 'MA-Collab'
  deck.slides.forEach((spec, index) => {
    if (spec.type === 'cover') return addCover(pptx, deck, spec)
    if (spec.type === 'agenda') return addAgenda(pptx, deck, spec, index)
    if (spec.type === 'comparison') return addComparison(pptx, deck, spec, index)
    if (spec.type === 'process' || spec.type === 'timeline') return addProcess(pptx, deck, spec, index)
    if (spec.type === 'conclusion') return addConclusion(pptx, deck, spec, index)
    return addStandard(pptx, deck, spec, index)
  })
  return pptx
}

export async function exportPresentationDeck(deck: PresentationDeck): Promise<void> {
  await buildPresentationDeck(deck).writeFile({ fileName: `${safeFileName(deck.title)}.pptx`, compression: true })
}
