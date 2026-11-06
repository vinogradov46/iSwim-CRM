import { useState } from 'react'
import { rpc, supabase, money, dm, hm, todayISO, phonePretty, type Me } from '../lib'
import { useLoad, Loading, Err, Sheet, Pill, Chips, toast } from '../ui'

type L = { id: string; coach_id: string; coach_name: string; branch_id: string | null; branch: string | null; date: string; start_time: string | null
  duration_min: number; client_name: string; phone: string | null; price: number; cash: number; rate: number | null; note: string | null
  cancelled: boolean; cancel_reason: string | null; can_edit: boolean }
type Client = { client_name: string; phone: string | null; price: number; duration_min: number; branch_id: string | null }

const monthNow = () => todayISO().slice(0, 7)

/** Индивидуальные занятия. Тренер — свои, офис — все. */
export default function Indiv({ me }: { me: Me }) {
  const office = me.role !== 'coach'
  const [month, setMonth] = useState(monthNow())
  const [coach, setCoach] = useState<string>('all')
  const { data, error, reload } = useLoad(() => rpc<L[]>('indiv_list', { p_month: month + '-01', p_coach: office && coach !== 'all' ? coach : null }), [month, coach])
  const [edit, setEdit] = useState<L | 'new' | null>(null)
  const live = (data || []).filter((x) => !x.cancelled)
  const sum = live.reduce((a, x) => a + Number(x.price), 0)
  const debt = live.filter((x) => Number(x.cash) < Number(x.price))
  const coaches = [...new Map((data || []).map((x) => [x.coach_id, x.coach_name])).entries()]
  const pay = live.reduce((a, x) => a + Number(x.rate || 0), 0)
  return (
    <>
      {!office && <button className="btn" onClick={() => setEdit('new')}>+ Провёл индивидуальное</button>}
      <input type="month" value={month} max={monthNow()} onChange={(e) => setMonth(e.target.value)} aria-label="Месяц" />
      {office && coaches.length > 1 && <Chips options={[['all', 'Все тренеры'], ...coaches] as [string, string][]} value={coach} onChange={setCoach} />}
      <div className="stats">
        <div className="stat"><b>{live.length}</b><small>занятий</small></div>
        <div className="stat"><b>{money(sum)}</b><small>BYN заплатили</small></div>
        {!office ? <div className="stat"><b>{money(pay)}</b><small>BYN вам за них</small></div>
          : <div className={`stat ${debt.length ? 'hot' : ''}`}><b>{debt.length}</b><small>не оплачено</small></div>}
      </div>
      <Err e={error} />
      {!data ? <Loading /> : <div className="list">
        {data.length === 0 && <div className="row meta">За этот месяц занятий нет</div>}
        {data.map((x) => (
          <button className="row" key={x.id} disabled={!x.can_edit} onClick={() => setEdit(x)} style={x.cancelled ? { opacity: 0.5 } : {}}>
            <span className="time">{dm(x.date)}</span>
            <span className="grow"><span className="name">{x.client_name}</span><br />
              <span className="meta">{[x.start_time && hm(x.start_time), `${x.duration_min} мин`, x.branch, office && x.coach_name, x.cancelled && `удалено: ${x.cancel_reason}`, x.note].filter(Boolean).join(' · ')}</span></span>
            {x.cancelled ? <Pill c="p-mut">удалено</Pill> : Number(x.cash) < Number(x.price) ? <Pill c="p-bad">долг {money(x.price)}</Pill> : <Pill c="p-ok">{money(x.price)} BYN</Pill>}
          </button>))}
      </div>}
      {!office && <p className="note">Внесите занятие после того, как провели. Наличные сразу попадают в вашу кассу («Касса» → сдать администратору). Исправить или удалить можно 7 дней.</p>}
      {edit && <EditIndiv l={edit === 'new' ? null : edit} me={me} onClose={(ok) => { setEdit(null); if (ok) reload() }} />}
    </>
  )
}

function EditIndiv({ l, me, onClose }: { l: L | null; me: Me; onClose: (ok: boolean) => void }) {
  const clients = useLoad(() => (l || me.role !== 'coach' ? Promise.resolve([] as Client[]) : rpc<Client[]>('indiv_clients')), [])
  const branches = useLoad(async () => (await supabase.from('branches').select('id,name').eq('active', true).order('sort')).data || [], [])
  const [date, setDate] = useState(l?.date ?? todayISO())
  const [time, setTime] = useState(l?.start_time ? hm(l.start_time) : '')
  const [branch, setBranch] = useState<string | null>(l?.branch_id ?? null)
  const [client, setClient] = useState(l?.client_name ?? '')
  const [phone, setPhone] = useState(l?.phone ?? '')
  const [dur, setDur] = useState(String(l?.duration_min ?? 45))
  const [price, setPrice] = useState(l ? String(l.price) : '')
  const [paid, setPaid] = useState(l ? Number(l.cash) >= Number(l.price) : true)
  const [note, setNote] = useState(l?.note ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState(false)
  const [why, setWhy] = useState('')
  const pick = (c: Client) => { setClient(c.client_name); setPhone(c.phone ?? ''); setPrice(String(c.price)); setDur(String(c.duration_min)); if (c.branch_id) setBranch(c.branch_id) }
  const minDate = me.role === 'coach' ? new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10) : undefined
  async function save() {
    const p = parseFloat(price.replace(',', '.'))
    if (!client.trim()) return setErr('Укажите, с кем было занятие')
    if (!(p >= 0)) return setErr('Укажите цену занятия')
    setBusy(true); setErr(null)
    try {
      await rpc('indiv_save', { p_id: l?.id ?? null, p_date: date, p_time: time || null, p_branch: branch, p_client: client, p_phone: phone || null,
        p_duration: parseInt(dur, 10) || 45, p_price: p, p_paid: paid, p_note: note || null, p_coach: null })
      toast(l ? 'Сохранено' : paid && p > 0 ? `Занятие внесено, ${money(p)} BYN в кассе` : 'Занятие внесено'); onClose(true)
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  async function remove() {
    if (!why.trim()) return setErr('Напишите причину')
    setBusy(true); setErr(null)
    try { await rpc('indiv_cancel', { p_id: l!.id, p_reason: why }); toast('Занятие удалено'); onClose(true) } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <h2>{l ? 'Индивидуальное занятие' : 'Провёл индивидуальное'}</h2>
      {l && me.role !== 'coach' && <p className="sub">Тренер: {l.coach_name}</p>}
      {!!clients.data?.length && !client && <div><span className="lbl">Недавние клиенты</span><div className="chips">
        {clients.data.slice(0, 12).map((c) => <button key={c.client_name} className="chip" onClick={() => pick(c)}>{c.client_name}</button>)}</div></div>}
      <div><label htmlFor="ic">С кем занятие (ребёнок или взрослый)</label><input id="ic" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Фамилия Имя" /></div>
      <div><label htmlFor="ip">Телефон (необязательно)</label><input id="ip" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+375 …" />
        {phone && phonePretty(phone) !== phone && <span className="meta">{phonePretty(phone)}</span>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8 }}>
        <div><label htmlFor="id">Дата</label><input id="id" type="date" value={date} min={minDate} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label htmlFor="it">Время</label><input id="it" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label htmlFor="iv">Цена, BYN</label><input id="iv" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" /></div>
        <div><label htmlFor="iu">Минут</label><input id="iu" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
      </div>
      <div><span className="lbl">Где</span><div className="chips">
        {(branches.data || []).map((b: any) => <button key={b.id} className="chip" aria-pressed={branch === b.id} onClick={() => setBranch(branch === b.id ? null : b.id)}>{b.name}</button>)}</div></div>
      <div><span className="lbl">Оплата</span><div className="chips">
        <button className="chip" aria-pressed={paid} onClick={() => setPaid(true)}>Заплатил наличными</button>
        <button className="chip" aria-pressed={!paid} onClick={() => setPaid(false)}>Ещё не заплатил</button></div></div>
      <div><label htmlFor="in">Заметка</label><input id="in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: техника кроля" /></div>
      <Err e={err} />
      {!del && <button className="btn" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : l ? 'Сохранить' : 'Внести занятие'}</button>}
      {l && (del ? <>
        <div><label htmlFor="iw">Почему удаляете</label><input id="iw" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Ошибся / занятия не было" /></div>
        <button className="btn bad" disabled={busy} onClick={remove}>Да, удалить занятие</button>
      </> : <button className="btn ghost" onClick={() => setDel(true)}>Удалить занятие</button>)}
      <button className="btn ghost" onClick={() => onClose(false)}>Отмена</button>
    </Sheet>
  )
}
