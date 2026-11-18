import { useState } from 'react'
import { rpc, dm, hm, todayISO } from '../lib'
import { useLoad, Loading, Err, toast } from '../ui'

type Row = { session_id: string; date: string; start_time: string; grp: string; kind: 'group' | 'makeup' | 'guest'; mark: 'present' | 'absent' | null
  auto: boolean; charged: boolean; sick_status: string | null; absence_reason: string | null; marked_by: string | null; marked_at: string | null
  session_status: string; cancel_reason: string | null }

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const SICK: Record<string, string> = { wait: 'ждёт решения администратора', transfer: 'перенос по справке', credit: 'отработка начислена', refund: 'занятие возвращено', recalc: 'занятие возвращено', kept: 'без возврата', charged: 'без возврата' }

function state(r: Row, today: string): { c: string; t: string } {
  if (r.mark === 'present') return { c: 'ok', t: r.kind === 'makeup' ? 'был · отработка' : r.kind === 'guest' ? 'был · из другой группы' : 'был' }
  if (r.mark === 'absent') return { c: 'bad', t: 'не был' + (r.auto ? ' (поставила программа)' : '') + (r.absence_reason === 'makeup_cert' ? ' · отработка по справке (перенос на след. месяц)' : r.absence_reason === 'makeup_nocert' ? ' · отработка без справки (доп. день)' : '') + (r.sick_status ? ` · ${SICK[r.sick_status] || r.sick_status}` : r.absence_reason === 'sick' ? ' · болеет' : '') }
  if (r.session_status === 'cancelled') return { c: 'mut', t: 'отменено' + (r.cancel_reason ? `: ${r.cancel_reason.toLowerCase()}` : '') }
  if (r.date < today) return { c: 'warn', t: r.kind === 'makeup' ? 'записан на отработку — нет отметки' : 'нет отметки' }
  return { c: 'plan', t: r.kind === 'makeup' ? 'записан на отработку' : 'по расписанию' }
}

const shift = (m: string, n: number) => { const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7) }
const when = (ts: string) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** Календарь посещений ребёнка за месяц */
export default function AttCalendar({ childId, office, onChanged }: { childId: string; office?: boolean; onChanged?: () => void }) {
  const today = todayISO()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data, error, reload } = useLoad(() => rpc<Row[]>('child_attendance', { p_child: childId, p_month: month + '-01' }), [childId, month])
  const rows = data || []
  const byDay = new Map<string, Row[]>()
  rows.forEach((r) => byDay.set(r.date, [...(byDay.get(r.date) || []), r]))
  const first = new Date(month + '-01T12:00:00')
  const lead = (first.getDay() + 6) % 7
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  const cnt = (f: (r: Row) => boolean) => rows.filter(f).length
  const present = cnt((r) => r.mark === 'present'), absent = cnt((r) => r.mark === 'absent'), nomark = cnt((r) => !r.mark && r.session_status !== 'cancelled' && r.date < today)
  async function setMark(r: Row, m: 'present' | 'absent' | null, reason = 'none') {
    if (busy) return
    setBusy(true)
    try { await rpc('mark_attendance', { p_session: r.session_id, p_child: childId, p_mark: m, p_reason: m === 'absent' ? reason : null }); toast(m === 'present' ? 'Отмечено: был' : m === 'absent' ? (reason === 'none' ? 'Отмечено: не был' : 'Отмечено: не был. Директору поставлена задача разобрать пропуск') : 'Отметка снята'); reload(); onChanged?.() }
    catch (e: any) { toast(e.message) }
    setBusy(false)
  }
  async function undo(r: Row) {
    if (busy) return
    setBusy(true)
    try { await rpc('undo_compensation_s', { p_session: r.session_id, p_child: childId }); toast('Возврат снят: пропуск снова ждёт решения'); reload(); onChanged?.() }
    catch (e: any) { toast(e.message) }
    setBusy(false)
  }
  const list = open ? byDay.get(open) || [] : rows.filter((r) => r.mark || r.session_status === 'cancelled' || r.date < today)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="lbl grow" style={{ margin: 0 }}>Посещения</span>
        <button className="btn sm ghost" aria-label="Предыдущий месяц" onClick={() => { setMonth(shift(month, -1)); setOpen(null) }}>‹</button>
        <span style={{ minWidth: 104, textAlign: 'center', fontWeight: 600 }}>{MONTHS[first.getMonth()]} {first.getFullYear()}</span>
        <button className="btn sm ghost" aria-label="Следующий месяц" onClick={() => { setMonth(shift(month, 1)); setOpen(null) }}>›</button>
      </div>
      <Err e={error} />
      {!data ? <Loading /> : <>
        <div className="cal" role="grid">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div key={d} className="cal-h">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={'e' + i} />
            const rs = byDay.get(d) || []
            const st = rs.map((r) => state(r, today).c)
            const c = st.includes('ok') ? 'ok' : st.includes('bad') ? 'bad' : st.includes('warn') ? 'warn' : st.includes('mut') ? 'mut' : st.includes('plan') ? 'plan' : ''
            return <button key={d} className={`cal-d ${c} ${d === today ? 'today' : ''}`} aria-pressed={open === d} disabled={!rs.length}
              onClick={() => setOpen(open === d ? null : d)}>{+d.slice(8)}{rs.length > 1 && <i>{rs.length}</i>}</button>
          })}
        </div>
        <div className="cal-legend"><span className="ok">был {present}</span><span className="bad">не был {absent}</span>{nomark > 0 && <span className="warn">нет отметки {nomark}</span>}<span className="plan">по расписанию</span><span className="mut">отменено</span></div>
        <div className="hist">
          {list.length === 0 && <span className="meta">{open ? 'В этот день занятий нет' : 'В этом месяце отметок пока нет'}</span>}
          {list.map((r) => { const s = state(r, today); const can = office && r.session_status !== 'cancelled' && r.date <= today; return <div key={r.session_id + r.kind} style={can ? { flexWrap: 'wrap' } : undefined}>
            <span>{dm(r.date)} {hm(r.start_time)} · {r.grp}<br /><span className={`meta cal-t ${s.c}`}>{s.t}</span></span>
            <span className="meta" style={{ textAlign: 'right' }}>{r.mark && !r.auto ? <>{r.marked_by || 'администратор'}<br />{r.marked_at && when(r.marked_at)}</> : r.auto && r.marked_at ? <>авто<br />{when(r.marked_at)}</> : ''}</span>
            {can && <div className="marks" style={{ width: '100%' }}>
              <button className="mk m-p" aria-pressed={r.mark === 'present'} disabled={busy} onClick={() => setMark(r, r.mark === 'present' ? null : 'present')}>Был</button>
              <button className="mk m-a" aria-pressed={r.mark === 'absent'} disabled={busy} onClick={() => setMark(r, r.mark === 'absent' ? null : 'absent')}>Не был</button>
              {r.mark !== 'present' && !r.sick_status?.match(/^(transfer|refund|credit|recalc)$/) && <>
                <button className="mk m-r" aria-pressed={r.absence_reason === 'makeup_cert'} disabled={busy} onClick={() => setMark(r, r.absence_reason === 'makeup_cert' ? null : 'absent', 'makeup_cert')}>Отработка по справке</button>
                <button className="mk m-r" aria-pressed={r.absence_reason === 'makeup_nocert'} disabled={busy} onClick={() => setMark(r, r.absence_reason === 'makeup_nocert' ? null : 'absent', 'makeup_nocert')}>Отработка без справки</button>
              </>}
              {r.mark === 'absent' && ['transfer', 'refund', 'credit', 'recalc'].includes(r.sick_status || '') && <button className="mk m-r" disabled={busy} onClick={() => undo(r)}>Снять возврат</button>}
            </div>}
          </div> })}
        </div>
        {open && <button className="btn sm ghost" onClick={() => setOpen(null)}>Показать весь месяц</button>}
      </>}
    </div>
  )
}
