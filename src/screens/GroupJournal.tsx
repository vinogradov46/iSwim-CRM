import { useState } from 'react'
import { rpc, dm, hm, gname, money, todayISO, lw, type Me } from '../lib'
import { useLoad, Loading, Err, Sheet, Pill, toast } from '../ui'
import ChildCard from './ChildCard'
import PaySheet from './PaySheet'

type Mark = { s: string; m: 'present' | 'absent' | null; r: string | null; auto: boolean; sick: string | null }
type Kid = { child_id: string; full_name: string; child_status: string; enr: 'active' | 'reserve' | 'guest'; days: number[] | null; phone: string | null
  plan_kind: string; lessons_left: number; lessons_total: number | null; paid_sum: number; last_paid_at: string | null; state: string; marks: Mark[] }
type Ses = { id: string; date: string; status: string }
type J = { sessions: Ses[]; kids: Kid[] }
export type JGroup = { id: string; branch: string; title: string | null; weekdays: number[]; start_time: string; coach_name: string | null }

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const wdOf = (iso: string) => ((new Date(iso + 'T12:00:00').getDay() + 6) % 7) + 1
const shift = (m: string, n: number) => { const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7) }

function sym(m: Mark | undefined, s: Ses, k: Kid, today: string): { t: string; c: string; hint: string } {
  if (s.status === 'cancelled') return { t: '–', c: 'mut', hint: 'занятие отменено' }
  if (m?.m === 'present') return { t: '✓', c: 'ok', hint: 'был' }
  if (m?.m === 'absent') {
    if (m.r === 'sick') return { t: 'Б', c: 'bad', hint: 'болеет' }
    if (m.r === 'warned') return { t: 'П', c: 'bad', hint: 'предупредил' }
    if (m.r === 'makeup_cert') return { t: 'ОС', c: 'bad', hint: 'отработка по справке' }
    if (m.r === 'makeup_nocert') return { t: 'ОБ', c: 'bad', hint: 'отработка без справки' }
    return { t: '✗', c: 'bad', hint: 'не был' }
  }
  const off = k.days && k.days.length && !k.days.includes(wdOf(s.date))
  if (off) return { t: '', c: 'off', hint: 'в этот день не ходит' }
  return s.date < today ? { t: '?', c: 'warn', hint: 'нет отметки' } : { t: '·', c: 'plan', hint: 'по расписанию' }
}

/** Журнал группы: дети × даты, посещения и оплата. Офис. */
export default function GroupJournal({ g, me, onBack }: { g: JGroup; me: Me; onBack: () => void }) {
  const today = todayISO()
  const [month, setMonth] = useState(today.slice(0, 7))
  const { data, error, reload } = useLoad(() => rpc<J>('group_journal', { p_group: g.id, p_month: month + '-01' }), [g.id, month])
  const [cell, setCell] = useState<{ k: Kid; s: Ses } | null>(null)
  const [card, setCard] = useState<string | null>(null)
  const [pay, setPay] = useState<Kid | null>(null)
  const [busy, setBusy] = useState(false)
  const [reserve, setReserve] = useState(false)

  const ses = data?.sessions || []
  const all = data?.kids || []
  const main = all.filter((k) => k.enr !== 'reserve')
  const kids = reserve ? all : main
  const multi = g.weekdays.length > 1
  const first = new Date(month + '-01T12:00:00')
  const markOf = (k: Kid, s: Ses) => k.marks.find((m) => m.s === s.id)
  const nUnpaid = main.filter((k) => k.state === 'unpaid').length
  const nPaid = main.filter((k) => k.state === 'paid' || k.state === 'balance').length

  async function setMark(k: Kid, s: Ses, m: 'present' | 'absent' | null, reason = 'none') {
    if (busy) return
    setBusy(true)
    try {
      await rpc('mark_attendance', { p_session: s.id, p_child: k.child_id, p_mark: m, p_reason: m === 'absent' ? reason : null })
      toast(m === 'present' ? 'Отмечено: был' : m === 'absent' ? (reason === 'none' ? 'Отмечено: не был' : 'Отмечено. Директору поставлена задача разобрать пропуск') : 'Отметка снята')
      setCell(null); reload()
    } catch (e: any) { toast(e.message) }
    setBusy(false)
  }

  const cm = cell ? markOf(cell.k, cell.s) : undefined
  return (
    <>
      <button className="back" onClick={onBack}>← Группы</button>
      <h2>{g.branch} · {gname(g.title, g.start_time)}</h2>
      <p className="sub">{g.weekdays.map((d) => WD[d - 1]).join('/')} · {g.coach_name || 'без тренера'}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="grow" />
        <button className="btn sm ghost" aria-label="Предыдущий месяц" onClick={() => setMonth(shift(month, -1))}>‹</button>
        <span style={{ minWidth: 112, textAlign: 'center', fontWeight: 600 }}>{MONTHS[first.getMonth()]} {first.getFullYear()}</span>
        <button className="btn sm ghost" aria-label="Следующий месяц" onClick={() => setMonth(shift(month, 1))}>›</button>
      </div>
      <Err e={error} />
      {!data ? <Loading /> : <>
        <div className="cal-legend" style={{ flexWrap: 'wrap' }}>
          <span>Детей: {main.length}</span><span className="ok">оплачено {nPaid}</span>{nUnpaid > 0 && <span className="bad">долг / нет оплаты {nUnpaid}</span>}
          {all.length > main.length && <button className="chip" aria-pressed={reserve} onClick={() => setReserve(!reserve)}>резерв: {all.length - main.length}</button>}
        </div>
        {ses.length === 0 ? <div className="row meta">В этом месяце занятий нет</div> :
          <div className="jr-wrap"><table className="jr">
            <thead><tr>
              <th className="jr-n">Ребёнок</th>
              {ses.map((s) => <th key={s.id} className={`jr-d ${s.status === 'cancelled' ? 'x' : ''} ${s.date === today ? 'today' : ''}`}>{dm(s.date)}<br /><small>{WD[wdOf(s.date) - 1]}</small></th>)}
              <th className="jr-p">Оплата</th>
            </tr></thead>
            <tbody>
              {kids.length === 0 && <tr><td className="jr-n meta" colSpan={ses.length + 2}>В группе пока никого</td></tr>}
              {kids.map((k, i) => (
                <tr key={k.child_id} style={k.enr === 'reserve' ? { opacity: 0.6 } : undefined}>
                  <td className="jr-n">
                    <button className="jr-name" onClick={() => setCard(k.child_id)}><span className="meta">{i + 1}.</span> {k.full_name}</button>
                    <span className="meta jr-sub">
                      {k.enr === 'reserve' ? 'резерв' : k.enr === 'guest' ? 'из другой группы' : k.child_status === 'trial' ? 'пробное' : multi ? (k.days && k.days.length ? 'только ' + k.days.map((d) => WD[d - 1]).join('/') : 'все дни') : ''}
                    </span>
                  </td>
                  {ses.map((s) => { const x = sym(markOf(k, s), s, k, today); const can = s.status !== 'cancelled' && s.date <= today
                    return <td key={s.id} className="jr-c"><button className={`jr-b ${x.c}`} title={x.hint} aria-label={`${k.full_name} ${dm(s.date)}: ${x.hint}`} disabled={!can} onClick={() => setCell({ k, s })}>{x.t}</button></td> })}
                  <td className="jr-p"><button className="jr-pay" onClick={() => setPay(k)}>
                    {k.state === 'trial' ? <Pill c="p-acc">пробное</Pill>
                      : k.state === 'paid' ? <Pill c="p-ok">{money(k.paid_sum)}</Pill>
                      : k.state === 'balance' ? <Pill c="p-ok">ост. {k.lessons_left}</Pill>
                      : k.state === 'frozen' ? <Pill c="p-mut">заморозка</Pill>
                      : <Pill c="p-bad">{k.lessons_left < 0 ? `долг ${-k.lessons_left}` : 'нет оплаты'}</Pill>}
                    {k.state !== 'trial' && k.plan_kind === 'count' && k.state !== 'unpaid' && <span className="meta jr-sub">{k.lessons_left} {lw(k.lessons_left)}</span>}
                  </button></td>
                </tr>))}
            </tbody>
            <tfoot><tr>
              <td className="jr-n meta">Пришло</td>
              {ses.map((s) => <td key={s.id} className="jr-c meta">{s.status === 'cancelled' ? '–' : s.date <= today || kids.some((k) => markOf(k, s)) ? kids.filter((k) => markOf(k, s)?.m === 'present').length : ''}</td>)}
              <td className="jr-p" />
            </tr></tfoot>
          </table></div>}
        <p className="note">✓ был · ✗ не был · Б болеет · П предупредил · ОС/ОБ отработка по справке / без справки · ? нет отметки. Нажмите на клетку, чтобы поправить отметку, на сумму — чтобы провести оплату, на имя — открыть карточку ребёнка. Пустые клетки: ребёнок в этот день не ходит.</p>
      </>}

      {cell && <Sheet onClose={() => setCell(null)}>
        <h2>{cell.k.full_name}</h2>
        <p className="sub">{dm(cell.s.date)} {WD[wdOf(cell.s.date) - 1]} {hm(g.start_time)} · {sym(cm, cell.s, cell.k, today).hint}{cm?.auto ? ' (поставила программа)' : ''}</p>
        <div className="marks">
          <button className="mk m-p" aria-pressed={cm?.m === 'present'} disabled={busy} onClick={() => setMark(cell.k, cell.s, cm?.m === 'present' ? null : 'present')}>Был</button>
          <button className="mk m-a" aria-pressed={cm?.m === 'absent' && (cm.r === 'none' || !cm.r)} disabled={busy} onClick={() => setMark(cell.k, cell.s, 'absent')}>Не был</button>
          <button className="mk m-r" aria-pressed={cm?.r === 'makeup_cert'} disabled={busy || cm?.m === 'present'} onClick={() => setMark(cell.k, cell.s, 'absent', 'makeup_cert')}>Отработка по справке</button>
          <button className="mk m-r" aria-pressed={cm?.r === 'makeup_nocert'} disabled={busy || cm?.m === 'present'} onClick={() => setMark(cell.k, cell.s, 'absent', 'makeup_nocert')}>Отработка без справки</button>
        </div>
        {cm?.m && <button className="btn ghost" disabled={busy} onClick={() => setMark(cell.k, cell.s, null)}>Снять отметку</button>}
        <p className="note">Возвраты и переносы по справкам — в карточке ребёнка (нажмите на имя).</p>
        <button className="btn ghost" onClick={() => setCell(null)}>Закрыть</button>
      </Sheet>}
      {card && <ChildCard key={card} id={card} me={me} onClose={() => { setCard(null); reload() }} />}
      {pay && <PaySheet childId={pay.child_id} me={me} plan={pay.child_status === 'trial' ? 'trial' : undefined} onClose={(ok) => { setPay(null); if (ok) reload() }} />}
    </>
  )
}
