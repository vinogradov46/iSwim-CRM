import { useEffect } from 'react'
import { rpc, todayISO } from '../lib'
import { useLoad } from '../ui'

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const label = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${WD[d.getDay()]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}${iso === todayISO() ? ' (сегодня)' : ''}` }

/** Выбор даты пробного: только ближайшие дни, когда у группы есть занятие. */
export default function TrialDates({ group, value, onChange }: { group: string | null; value: string; onChange: (v: string) => void }) {
  const { data, error } = useLoad(() => (group ? rpc<string[]>('group_next_dates', { p_group: group, p_n: 8 }) : Promise.resolve([] as string[])), [group])
  const list = (data || []).map((x: any) => (typeof x === 'string' ? x : Object.values(x)[0] as string))
  useEffect(() => { if (list.length && !list.includes(value)) onChange(list[0]) }, [data])
  if (!group) return <p className="sub">Сначала выберите группу — покажем дни её занятий</p>
  if (error) return <input type="date" value={value} min={todayISO()} onChange={(e) => onChange(e.target.value)} />
  return <div className="chips">{list.map((d) => <button key={d} className="chip" aria-pressed={value === d} onClick={() => onChange(d)}>{label(d)}</button>)}</div>
}
