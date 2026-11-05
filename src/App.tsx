import { useEffect, useState } from 'react'
import { supabase, rpc, phoneE164, cleanError, type Me } from './lib'
import { Toaster, Err, Loading } from './ui'
import Today from './screens/Today'
import Children from './screens/Children'
import Payments from './screens/Payments'
import Cash from './screens/Cash'
import { Salary, Journal } from './screens/Director'

const ROLE: Record<string, string> = { director: 'Директор', admin: 'Администратор', coach: 'Тренер' }
const TABS: Record<string, [string, string][]> = {
  coach: [['today', 'Сегодня'], ['kids', 'Дети'], ['cash', 'Касса']],
  admin: [['today', 'Сегодня'], ['kids', 'Дети'], ['pay', 'Оплаты']],
  director: [['today', 'Сегодня'], ['kids', 'Дети'], ['pay', 'Оплаты'], ['salary', 'Зарплата'], ['log', 'Журнал']],
}
/** Вход по телефону: в Supabase это e-mail вида 375291234567@staff.iswim.by */
const staffEmail = (e164: string) => `${e164.slice(1)}@staff.iswim.by`

export default function App() {
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('today')

  async function loadMe() {
    try {
      const r = await rpc<Me[]>('whoami')
      if (!r.length) { setError('Этот номер не найден среди сотрудников iSwim'); await supabase.auth.signOut(); setMe(null) }
      else setMe(r[0])
    } catch (e: any) { setError(e.message) }
    setReady(true)
  }
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => (data.session ? loadMe() : setReady(true)))
    const { data: sub } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') setMe(null) })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <div className="app"><Loading /></div>
  if (!me) return <div className="app"><Login onIn={loadMe} error={error} /></div>
  if (me.must_change_password) return <div className="app"><NewPassword onDone={loadMe} /></div>

  const tabs = TABS[me.role]
  const body = tab === 'today' ? <Today me={me} /> : tab === 'kids' ? <Children me={me} /> : tab === 'pay' ? <Payments me={me} />
    : tab === 'cash' ? <Cash me={me} /> : tab === 'salary' ? <Salary /> : <Journal />
  return (
    <>
      <div className="app">
        <header><div className="brand">i<span>Swim</span> CRM</div></header>
        <div className="me">
          <div className="ava">{me.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
          <div className="grow"><div className="name">{me.full_name}</div><div className="meta">{ROLE[me.role]}</div></div>
          <button className="btn sm ghost" onClick={() => supabase.auth.signOut()}>Выйти</button>
        </div>
        {body}
      </div>
      <nav className="tabs">
        <div className="tabs-in" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>
          {tabs.map(([id, l]) => (
            <button key={id} className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); window.scrollTo(0, 0) }}>{l}</button>
          ))}
        </div>
      </nav>
      <Toaster />
    </>
  )
}

function Login({ onIn, error }: { onIn: () => void; error: string | null }) {
  const [phone, setPhone] = useState('+375 ')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(error)
  const [busy, setBusy] = useState(false)
  async function go(e: React.FormEvent) {
    e.preventDefault()
    const p = phoneE164(phone)
    if (!p) return setErr('Введите номер: +375 и 9 цифр')
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: staffEmail(p), password: pw })
    setBusy(false)
    if (error) setErr(cleanError(error.message)); else onIn()
  }
  return (
    <form className="center" onSubmit={go}>
      <div className="loginlogo">i<span>Swim</span> CRM</div>
      <p className="sub" style={{ textAlign: 'center' }}>Вход для тренеров и администраторов</p>
      <div><label htmlFor="ph">Телефон</label><input id="ph" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div><label htmlFor="pw">Пароль</label><input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <Err e={err} />
      <button className="btn" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
      <p className="note">Первый раз? Введите временный пароль, который дал администратор. Потом приложение попросит придумать свой.</p>
    </form>
  )
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [a, setA] = useState(''), [b, setB] = useState('')
  const [err, setErr] = useState<string | null>(null)
  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (a.length < 6) return setErr('Пароль: не меньше 6 символов')
    if (a !== b) return setErr('Пароли не совпадают')
    const { error } = await supabase.auth.updateUser({ password: a })
    if (error) return setErr(cleanError(error.message))
    try { await rpc('password_changed'); onDone() } catch (e: any) { setErr(e.message) }
  }
  return (
    <form className="center" onSubmit={go}>
      <h2>Придумайте свой пароль</h2>
      <p className="sub">Временный пароль больше не понадобится.</p>
      <div><label htmlFor="a">Новый пароль</label><input id="a" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></div>
      <div><label htmlFor="b">Ещё раз</label><input id="b" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></div>
      <Err e={err} />
      <button className="btn">Сохранить</button>
    </form>
  )
}
