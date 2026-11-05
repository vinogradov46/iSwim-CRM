/** Разбор PDF-реестра платежей EPOS прямо в браузере */
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type EposRow = { order: string; invoice: string; paid_at: string; amount: number; payer: string }

const ROW = /^(\d{6,})\s+(\d\d\.\d\d\.\d{4})\s+(\d+)\s+(\S+)\s+(\d\d\.\d\d\.\d{4} \d\d:\d\d)\s+(\d\d\.\d\d\.\d{4})\s+([\d ]+,\d\d)\s+([\d ]+,\d\d)\s+([\d ]+,\d\d)$/
const num = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'))

export async function parseEposPdf(file: File): Promise<{ rows: EposRow[]; total: number | null }> {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const lines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    // собираем строки по координате Y
    const byY = new Map<number, { x: number; s: string }[]>()
    for (const it of tc.items as any[]) {
      if (!it.str?.trim()) continue
      const y = Math.round(it.transform[5])
      const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
      if (!byY.has(key)) byY.set(key, [])
      byY.get(key)!.push({ x: it.transform[4], s: it.str.trim() })
    }
    ;[...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()))
  }
  const rows: EposRow[] = []
  let total: number | null = null
  lines.forEach((l, i) => {
    const t = l.match(/Итого по услуге:\s*([\d ]+,\d\d)/)
    if (t) total = num(t[1])
    const m = l.match(ROW)
    if (!m) return
    const next = lines[i + 1] || ''
    const payer = next && !ROW.test(next) && !/^(Номер|Мемориальный|Итого|Занятия)/.test(next) ? next : ''
    rows.push({ order: m[1], invoice: m[4], paid_at: m[5], amount: num(m[7]), payer })
  })
  return { rows, total }
}
