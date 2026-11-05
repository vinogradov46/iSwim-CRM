import { useState } from 'react'
import { rpc, supabase, phonePretty, phoneE164, balanceState, gname, todayISO, type Me } from '../lib'
import { useLoad, Loading, Err, Pill, Sheet, Chips, toast } from '../ui'
import ChildCard from './ChildCard'
import Groups from './Groups'

const STATUS: [string, string][] = [['active', 'Занимаются'], ['trial', 'Пробные'], ['reserve', 'Резерв'], ['left', 'Ушли'], ['lost', 'Не дошли']]

export default function Children({ me }: { me: Me }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>('active')
  const [card, setCard] = useState<string | null>(null)
  const [add, setAdd] = useState(false)
  const [groups, setGroups] = useState(false)
  const { data, error, reload } = useLoad(() => rpc<any[]>('search_children', { p_q: q, p_status: status, p_limit: 80 }), [q, status])
  const office = me.role !== 'coach'
  if (groups) return <Groups me={me} onBack={() => { setGroups(false); reload() }} />
  return (
    <>
      {office && <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <button className="btn" onClick={() => setAdd(true)}>+ Записать ребёнка</button>
        <button className="btn ghost" onClick={() => setGroups(true)}>Группы</button></div>}
      <input placeholder="Ребёнок, родитель или телефон" value={q} onChange={(e) => setQ(e.target.value)} />
      <Chips options={STATUS} value={status} onChange={setStatus} />
      <Err e={error} />
      {!data ? <Loading /> : (
        <div className="list">
          {data.length === 0 && <div className="row meta">Никого не найдено</div>}
          {data.map((c) => {
            const st = c.status === 'active' ? balanceState({ ...c, frozen_until: null, paid_month: null }) : { t: STATUS.find((x) => x[0] === c.status)?.[1] || c.status, c: 'p-mut' }
            return (
              <button className="row" key={c.child_id} onClick={() => setCard(c.child_id)}>
                <span className="grow"><span className="name">{c.full_name}</span><br /><span className="meta">{c.groups || 'без группы'}</span><br /><span className="meta phone">{phonePretty(c.phone)}</span></span>
                <Pill c={st.c}>{st.t}</Pill>
              </button>
            )
          })}
          {data.length === 80 && <div className="row meta">Показаны первые 80. Уточните поиск</div>}
        </div>
      )}
      {card && <ChildCard id={card} me={me} onClose={() => { setCard(null); reload() }} />}
      {add && <Enroll onClose={(ok) => { setAdd(false); if (ok) reload() }} />}
    </>
  )
}

function Enroll({ onClose }: { onClose: (ok: boolean) => void }) {
  const groups = useLoad(async () => (await supabase.from('groups').select('id,title,start_time,capacity,branch_id,branches(name)').eq('active', true).order('start_time')).data || [], [])
  const [mode, setMode] = useState<'trial' | 'group' | 'reserve'>('trial')
  const [name, setName] = useState(''), [birth, setBirth] = useState(''), [parent, setParent] = useState(''), [phone, setPhone] = useState('+375 ')
  const [branch, setBranch] = useState<string | null>(null), [gid, setGid] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO()), [src, setSrc] = useState('Instagram')
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const gs = (groups.data || []) as any[]
  const branches = [...new Map(gs.map((g) => [g.branch_id, g.branches?.name])).entries()]
  const ov = useLoad(() => rpc<any[]>('groups_overview'), [])
  const load = (id: string) => ov.data?.find((x: any) => x.id === id)
  const full = (id: string) => { const x = load(id); return !!x && x.active_kids >= x.capacity }
  async function save() {
    if (!name.trim().includes(' ')) return setErr('Фамилия и имя ребёнка через пробел')
    if (!phoneE164(phone)) return setErr('Телефон: +375 и 9 цифр')
    if (!gid) return setErr('Выберите группу')
    if (mode === 'group' && full(gid)) return setErr('Группа заполнена. Запишите в резерв или увеличьте вместимость в «Группах»')
    setBusy(true); setErr(null)
    try {
      const r: any = await rpc('enroll_child', { p_parent_name: parent, p_phone: phonePretty(phone), p_child_name: name, p_birth: birth || null, p_group: gid,
        p_mode: mode, p_trial_date: mode === 'trial' ? date : null, p_source: src })
      toast(r.family_existed ? 'Записано. Семья найдена по телефону' : r.possible_duplicate ? `Записано. Внимание: уже есть «${r.possible_duplicate}»` : 'Записано')
      onClose(true)
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <h2>Записать ребёнка</h2>
      <div className="seg">{([['trial', 'На пробное'], ['group', 'В группу'], ['reserve', 'В резерв']] as const).map(([v, l]) => <button key={v} className="chip" aria-pressed={mode === v} onClick={() => setMode(v)}>{l}</button>)}</div>
      <div><label htmlFor="n">Фамилия и имя ребёнка</label><input id="n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванова Аня" /></div>
      <div><label htmlFor="b">Дата рождения</label><input id="b" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></div>
      <div><label htmlFor="p">Родитель</label><input id="p" value={parent} onChange={(e) => setParent(e.target.value)} placeholder="Имя родителя" /></div>
      <div><label htmlFor="t">Телефон родителя</label><input id="t" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div><span className="lbl">Откуда узнали</span><Chips options={['Instagram', 'Google', 'Сайт', 'Рекомендация', 'Telegram'].map((x) => [x, x] as [string, string])} value={src} onChange={setSrc} /></div>
      <div><span className="lbl">Филиал</span><Chips options={branches.map(([id, n]) => [id, n] as [string, string])} value={branch} onChange={(v) => { setBranch(v); setGid(null) }} /></div>
      {branch && <div><span className="lbl">Группа</span><Chips options={gs.filter((g) => g.branch_id === branch).map((g) => { const x = load(g.id); return [g.id, `${gname(g.title, g.start_time)}${x ? ` · ${x.active_kids}/${x.capacity}` : ''}`] as [string, string] })} value={gid} onChange={setGid} /></div>}
      {mode === 'trial' && <div><label htmlFor="d">Дата пробного</label><input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
      <Err e={err} />
      <button className="btn" disabled={busy} onClick={save}>{mode === 'trial' ? 'Записать на пробное' : mode === 'group' ? 'Добавить в группу' : 'Записать в резерв'}</button>
      <button className="btn ghost" onClick={() => onClose(false)}>Отмена</button>
    </Sheet>
  )
}
