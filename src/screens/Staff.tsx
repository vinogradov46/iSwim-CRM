import { useState } from 'react'
import { rpc, money, phonePretty } from '../lib'
import { useLoad, Loading, Err, Sheet, Pill, toast } from '../ui'
import { Journal } from './Director'

type Person = {
  id: string; full_name: string; role: 'director' | 'admin' | 'coach'; phone: string | null; active: boolean
  pay_type: 'lesson' | 'percent' | null; pay_rate: number | null; pay_pct: number | null
  has_login: boolean; must_change_password: boolean; last_sign_in_at: string | null; indiv_enabled: boolean; indiv_rate: number | null
  groups: { id: string; label: string }[]
}
const ROLE = { director: 'Директор', admin: 'Администратор', coach: 'Тренер' }

/** Директор: сотрудники, доступы, ставки, группы. Внизу — журнал изменений. */
export default function Staff() {
  const [view, setView] = useState<'team' | 'log'>('team')
  const { data, error, reload } = useLoad(() => rpc<Person[]>('staff_list'), [])
  const [edit, setEdit] = useState<Person | 'new' | null>(null)
  const [open, setOpen] = useState<Person | null>(null)
  if (view === 'log') return <><button className="btn ghost" onClick={() => setView('team')}>← Сотрудники</button><Journal /></>

  const act = (data || []).filter((p) => p.active), off = (data || []).filter((p) => !p.active)
  const row = (p: Person) => (
    <button className="row" key={p.id} onClick={() => setOpen(p)}>
      <span className="grow"><span className="name">{p.full_name}</span><br />
        <span className="meta">{ROLE[p.role]}{p.role === 'coach' ? ` · ${payText(p)}` : ''}{p.role === 'coach' ? ` · групп: ${p.groups.length}` : ''}</span></span>
      {access(p)}
    </button>)
  return (
    <>
      <h2>Сотрудники</h2>
      <button className="btn" onClick={() => setEdit('new')}>+ Добавить сотрудника</button>
      <Err e={error} />
      {!data ? <Loading /> : <>
        <div className="list">{act.map(row)}</div>
        {off.length > 0 && <><h3>Отключены</h3><div className="list">{off.map(row)}</div></>}
      </>}
      <button className="btn ghost" onClick={() => setView('log')}>Журнал изменений</button>
      {edit && <EditSheet p={edit === 'new' ? null : edit} onClose={(ok) => { setEdit(null); if (ok) reload() }} />}
      {open && <PersonSheet p={open} onEdit={() => { setEdit(open); setOpen(null) }} onClose={(ok) => { setOpen(null); if (ok) reload() }} />}
    </>
  )
}

const payText = (p: Person) => p.pay_type === 'percent' ? `${p.pay_pct ?? '?'}% от оплат` : p.pay_rate ? `${money(p.pay_rate)} BYN/занятие` : 'ставка не задана'
function access(p: Person) {
  if (!p.active) return <Pill c="p-mut">отключён</Pill>
  if (!p.has_login) return <Pill c="p-warn">нет доступа</Pill>
  if (p.must_change_password) return <Pill c="p-warn">ещё не входил</Pill>
  return <Pill c="p-ok">вход есть</Pill>
}

function PersonSheet({ p, onEdit, onClose }: { p: Person; onEdit: () => void; onClose: (ok: boolean) => void }) {
  const [pw, setPw] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [assign, setAssign] = useState(false)
  const [sure, setSure] = useState(false)
  async function issue() {
    setBusy(true); setErr(null)
    try { setPw(await rpc<string>('staff_issue_password', { p_staff: p.id })) } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }
  async function setActive(v: boolean) {
    setBusy(true); setErr(null)
    try { await rpc('staff_set_active', { p_staff: p.id, p_active: v }); toast(v ? 'Сотрудник включён' : 'Сотрудник отключён'); onClose(true) } catch (e: any) { setErr(e.message); setBusy(false); setSure(false) }
  }
  const msg = pw && `iSwim CRM: https://crm.iswim.by\nТелефон: ${phonePretty(p.phone)}\nВременный пароль: ${pw}\nПри первом входе придумайте свой пароль.`
  async function copy() {
    try { await navigator.clipboard.writeText(msg!); toast('Скопировано — отправьте сотруднику') } catch { toast('Не удалось скопировать — выделите текст вручную') }
  }
  if (assign) return <AssignSheet coach={p} onClose={(ok) => { setAssign(false); if (ok) onClose(true) }} />
  return (
    <Sheet onClose={() => onClose(!!pw)}>
      <h2>{p.full_name}</h2>
      <p className="sub">{ROLE[p.role]} · {p.phone ? phonePretty(p.phone) : 'телефон не указан'}</p>
      {p.role === 'coach' && <p className="sub">Оплата: {payText(p)}</p>}
      {p.last_sign_in_at && <p className="sub">Последний вход: {new Date(p.last_sign_in_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>}
      {p.role === 'coach' && <div><span className="lbl">Группы</span>
        {p.groups.length ? <div className="list">{p.groups.map((g) => <div className="row" key={g.id}>{g.label}</div>)}</div> : <p className="sub">Групп нет</p>}
      </div>}
      {pw ? <>
        <div className="calc" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>{msg}</div>
        <button className="btn" onClick={copy}>Скопировать для отправки</button>
        <p className="note">Пароль показывается один раз. Если потеряется — выдайте новый.</p>
      </> : p.active && p.role !== 'director' && <>
        <button className="btn" disabled={busy || !p.phone} onClick={issue}>{p.has_login ? 'Сбросить пароль (выдать новый)' : 'Выдать доступ'}</button>
        {!p.phone && <p className="note">Чтобы выдать доступ, сначала укажите телефон: «Изменить».</p>}
      </>}
      <Err e={err} />
      {p.active && p.role === 'coach' && <IndivBlock p={p} onSaved={() => onClose(true)} />}
      {p.active && p.role === 'coach' && <button className="btn ghost" onClick={() => setAssign(true)}>Назначить группы</button>}
      {p.role !== 'director' && <button className="btn ghost" onClick={onEdit}>Изменить данные и ставку</button>}
      {p.role !== 'director' && (p.active
        ? (sure ? <button className="btn bad" disabled={busy} onClick={() => setActive(false)}>Да, отключить {p.full_name.split(' ')[1] || ''}</button>
                : <button className="btn ghost" onClick={() => setSure(true)}>Отключить сотрудника</button>)
        : <button className="btn ghost" disabled={busy} onClick={() => setActive(true)}>Включить снова</button>)}
      {sure && <p className="note">Сотрудник больше не сможет войти. История занятий, оплат и зарплаты сохранится.</p>}
      <button className="btn ghost" onClick={() => onClose(!!pw)}>Закрыть</button>
    </Sheet>
  )
}

function EditSheet({ p, onClose }: { p: Person | null; onClose: (ok: boolean) => void }) {
  const [name, setName] = useState(p?.full_name ?? '')
  const [role, setRole] = useState<'coach' | 'admin'>(p?.role === 'admin' ? 'admin' : 'coach')
  const [phone, setPhone] = useState(p?.phone ?? '+375 ')
  const [type, setType] = useState<'lesson' | 'percent'>(p?.pay_type ?? 'lesson')
  const [rate, setRate] = useState(p?.pay_rate != null ? String(p.pay_rate) : '')
  const [pct, setPct] = useState(p?.pay_pct != null ? String(p.pay_pct) : '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const num = (s: string) => { const v = parseFloat(s.replace(',', '.')); return v >= 0 ? v : null }
  async function save() {
    setBusy(true); setErr(null)
    try {
      await rpc('staff_save', { p_id: p?.id ?? null, p_full_name: name, p_role: role, p_phone: phone,
        p_pay_type: role === 'coach' ? type : null, p_pay_rate: type === 'lesson' ? num(rate) : null, p_pay_pct: type === 'percent' ? num(pct) : null })
      toast(p ? 'Сохранено' : 'Сотрудник добавлен. Откройте его и нажмите «Выдать доступ»'); onClose(true)
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <h2>{p ? 'Изменить сотрудника' : 'Новый сотрудник'}</h2>
      <div><label htmlFor="sn">Фамилия и имя</label><input id="sn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванова Мария" /></div>
      <div><span className="lbl">Роль</span><div className="chips">
        {([['coach', 'Тренер'], ['admin', 'Администратор']] as const).map(([v, l]) => <button key={v} className="chip" aria-pressed={role === v} onClick={() => setRole(v)}>{l}</button>)}
      </div></div>
      <div><label htmlFor="sp">Телефон (это логин)</label><input id="sp" inputMode="tel" value={phone} disabled={!!p?.has_login} onChange={(e) => setPhone(e.target.value)} /></div>
      {p?.has_login && <p className="note">Телефон — логин для входа, здесь его не поменять.</p>}
      {role === 'coach' && <>
        <div><span className="lbl">Как платим</span><div className="chips">
          {([['lesson', 'За занятие'], ['percent', 'Процент от оплат']] as const).map(([v, l]) => <button key={v} className="chip" aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}
        </div></div>
        {type === 'lesson'
          ? <div><label htmlFor="sr">Ставка за занятие, BYN</label><input id="sr" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="40" /></div>
          : <div><label htmlFor="sq">Процент от оплат его групп</label><input id="sq" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="25" /></div>}
      </>}
      <Err e={err} />
      <button className="btn" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
      <button className="btn ghost" onClick={() => onClose(false)}>Отмена</button>
    </Sheet>
  )
}

function AssignSheet({ coach, onClose }: { coach: Person; onClose: (ok: boolean) => void }) {
  const { data, error, reload } = useLoad(() => rpc<{ id: string; label: string; coach_id: string | null; coach_name: string | null }[]>('groups_for_assign'), [])
  const [err, setErr] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  async function take(gid: string) {
    setBusy(gid); setErr(null)
    try { await rpc('group_set_coach', { p_group: gid, p_coach: coach.id }); setChanged(true); toast('Группа передана'); reload() } catch (e: any) { setErr(e.message) }
    setBusy(null)
  }
  return (
    <Sheet onClose={() => onClose(changed)}>
      <h2>Группы: {coach.full_name}</h2>
      <p className="sub">Нажмите «Передать», чтобы группа перешла к этому тренеру. Прошедшие занятия останутся за прежним тренером — для зарплаты.</p>
      <Err e={error || err} />
      {!data ? <Loading /> : <div className="list">{data.map((g) => (
        <div className="row" key={g.id}>
          <span className="grow">{g.label}<br /><span className="meta">{g.coach_name || 'без тренера'}</span></span>
          {g.coach_id === coach.id ? <Pill c="p-ok">его</Pill>
            : <button className="btn sm" disabled={!!busy} onClick={() => take(g.id)}>{busy === g.id ? '…' : 'Передать'}</button>}
        </div>))}</div>}
      <button className="btn ghost" onClick={() => onClose(changed)}>Готово</button>
    </Sheet>
  )
}

/** Индивидуальные занятия тренера: включить и ставка за одно занятие */
function IndivBlock({ p, onSaved }: { p: Person; onSaved: () => void }) {
  const [on, setOn] = useState(p.indiv_enabled)
  const [rate, setRate] = useState(p.indiv_rate != null ? String(p.indiv_rate) : '')
  const [err, setErr] = useState<string | null>(null)
  const changed = on !== p.indiv_enabled || rate !== (p.indiv_rate != null ? String(p.indiv_rate) : '')
  async function save() {
    const r = rate.trim() ? parseFloat(rate.replace(',', '.')) : null
    if (r != null && !(r >= 0)) return setErr('Ставка — число')
    setErr(null)
    try { await rpc('staff_set_indiv', { p_staff: p.id, p_enabled: on, p_rate: r }); toast('Сохранено'); onSaved() } catch (e: any) { setErr(e.message) }
  }
  return (
    <div className="miss">
      <span className="lbl">Индивидуальные занятия</span>
      <div className="chips">
        <button className="chip" aria-pressed={on} onClick={() => setOn(true)}>Ведёт индивидуальные</button>
        <button className="chip" aria-pressed={!on} onClick={() => setOn(false)}>Нет</button></div>
      {on && <div><label htmlFor="ir">Тренеру за одно индивидуальное, BYN</label><input id="ir" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Например 25" /></div>}
      {on && !rate.trim() && <p className="note">Пока ставки нет, индивидуальные в зарплату не попадут. Ставка фиксируется на момент занятия.</p>}
      <Err e={err} />
      {changed && <button className="btn sm" onClick={save}>Сохранить</button>}
    </div>
  )
}
