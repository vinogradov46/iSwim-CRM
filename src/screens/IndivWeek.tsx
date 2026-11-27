import { useState } from 'react'
import { rpc, hm, dm, todayISO, type Me } from '../lib'
import { useLoad, Loading, Err, Chips } from '../ui'

type B = { kind: 'indiv' | 'group'; id: string; coach_id: string; coach_name: string; date: string; start_time: string | null; duration_min: number; label: string; planned: boolean; branch: string | null }
export type Preset = { date: string; time: string; coach: string | null }

const H = 44, FROM = 7, TO = 22
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const monday = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return addDays(iso, -((d.getDay() + 6) % 7)) }
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const mins = (t: string) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10)

/** Недельный календарь индивидуальных: занято (групповые и индивидуальные) и свободное время тренера. */
export default function IndivWeek({ me, reloadKey, onOpen, onNew }: { me: Me; reloadKey: number; onOpen: (id: string, date: string) => void; onNew: (p: Preset) => void }) {
  const office = me.role !== 'coach'
  const [start, setStart] = useState(monday(todayISO()))
  const [coach, setCoach] = useState('all')
  const coaches = useLoad(() => (office ? rpc<{ id: string; full_name: string }[]>('indiv_coaches') : Promise.resolve([])), [])
  const { data, error } = useLoad(() => rpc<B[]>('indiv_week', { p_from: start, p_coach: office && coach !== 'all' ? coach : null }), [start, coach, reloadKey])
  const one = !office || coach !== 'all'
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const today = todayISO()
  const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })()
  const timed = (data || []).filter((b) => b.start_time)
  const untimed = (data || []).filter((b) => !b.start_time)
  const rows = TO - FROM
  const first = (n: string) => n.split(' ')[0]

  return (
    <>
      {office && (coaches.data?.length || 0) > 0 && <Chips options={[['all', 'Все тренеры'], ...coaches.data!.map((c) => [c.id, first(c.full_name)] as [string, string])]} value={coach} onChange={setCoach} />}
      <div className="wk-nav">
        <button className="chip" onClick={() => setStart(addDays(start, -7))} aria-label="Предыдущая неделя">‹</button>
        <button className="chip" onClick={() => setStart(monday(today))}>{dm(days[0])} – {dm(days[6])}</button>
        <button className="chip" onClick={() => setStart(addDays(start, 7))} aria-label="Следующая неделя">›</button>
      </div>
      <Err e={error} />
      {!data ? <Loading /> : <>
        <div className="wk-scroll">
          <div className="wk" style={{ gridTemplateColumns: `38px repeat(7, minmax(88px, 1fr))` }}>
            <div />
            {days.map((d, i) => <div key={d} className={`wk-h${d === today ? ' now' : ''}`}>{WD[i]} {d.slice(8)}</div>)}
            <div className="wk-hours">{Array.from({ length: rows }, (_, i) => <div key={i} style={{ height: H }}>{String(FROM + i).padStart(2, '0')}</div>)}</div>
            {days.map((d) => {
              const bl = timed.filter((b) => b.date === d).sort((a, b) => mins(a.start_time!) - mins(b.start_time!))
              // дорожки для наложений (когда видны все тренеры)
              const lanes: number[] = []; const lane = new Map<string, number>()
              bl.forEach((b) => { const s = mins(b.start_time!); let k = lanes.findIndex((e) => e <= s); if (k < 0) { k = lanes.length; lanes.push(0) } lanes[k] = s + b.duration_min; lane.set(b.id, k) })
              const nl = Math.max(1, lanes.length)
              return (
                <div key={d} className="wk-col" style={{ height: rows * H }}>
                  {Array.from({ length: rows }, (_, i) => {
                    const a = (FROM + i) * 60, busy = bl.some((b) => mins(b.start_time!) < a + 60 && mins(b.start_time!) + b.duration_min > a)
                    const past = d < today || (d === today && a + 60 <= nowMin)
                    const free = one && !busy && !past
                    return office
                      ? <button key={i} className={`wk-cell${free ? ' free' : ''}`} style={{ top: i * H, height: H }} disabled={!one || past} aria-label={`Записать на ${dm(d)} ${FROM + i}:00`}
                          onClick={() => onNew({ date: d, time: `${String(FROM + i).padStart(2, '0')}:00`, coach: coach === 'all' ? null : coach })} />
                      : <div key={i} className={`wk-cell${free ? ' free' : ''}`} style={{ top: i * H, height: H }} />
                  })}
                  {bl.map((b) => {
                    const top = Math.max(0, (mins(b.start_time!) - FROM * 60) / 60 * H), h = Math.max(22, b.duration_min / 60 * H - 2), k = lane.get(b.id)!
                    const isI = b.kind === 'indiv'
                    return <button key={b.kind + b.id + b.date} className={`wk-b ${isI ? (b.planned ? 'plan' : 'done') : 'grp'}`} disabled={!isI}
                      style={{ top, height: h, left: `${k / nl * 100}%`, width: `calc(${100 / nl}% - 2px)` }} onClick={() => isI && onOpen(b.id, b.date)}>
                      <b>{hm(b.start_time!)}</b> {b.label}{!one && isI ? ` · ${first(b.coach_name)}` : ''}
                    </button>
                  })}
                </div>
              )
            })}
          </div>
        </div>
        {untimed.length > 0 && <div className="note">Без времени: {untimed.map((b) => `${dm(b.date)} ${b.label}`).join('; ')}</div>}
        <div className="wk-legend"><span><i className="free" /> свободно</span><span><i className="grp" /> группа</span><span><i className="plan" /> запись</span><span><i className="done" /> индивидуальное</span></div>
        {office && !one && <p className="note">Выберите тренера, чтобы увидеть его свободное время и записать клиента нажатием на свободную клетку.</p>}
        {office && one && <p className="note">Зелёные клетки свободны (группы тренера учтены). Нажмите на клетку, чтобы записать клиента.</p>}
      </>}
    </>
  )
}
