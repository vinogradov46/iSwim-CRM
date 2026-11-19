import { useState } from 'react'
import { rpc, money, lw, perLesson, priceFor, PRICE, DISCOUNTS, type Me } from '../lib'
import { Sheet, Err, toast } from '../ui'

type Plan = 'count' | 'single' | 'trial' | 'month' | 'annual' | 'event'
const REASONS = ['ЕПАМ', 'Второй ребёнок', 'Друг', 'Акция']
const off = (b: number, d: number) => Math.round(b * (100 - d)) / 100
/** По сумме EPOS: подбираем тариф и скидку, если сумма не стандартная */
function guess(amount: number): { plan: Plan; n: number; disc: number } | null {
  const near = (x: number) => Math.abs(x - amount) <= 0.5
  for (const d of DISCOUNTS) {
    if (near(off(PRICE.trial, d))) return { plan: 'trial', n: 1, disc: d }
    if (near(off(PRICE.single, d))) return { plan: 'single', n: 1, disc: d }
    for (let n = 2; n <= 40; n++) if (near(priceFor(n, d))) return { plan: 'count', n, disc: d }
  }
  return null
}

/** Оплата: тренер — наличные в кассу, офис — EPOS (или из входящей оплаты) */
export default function PaySheet({ childId, me, onClose, incoming, plan: initPlan }: {
  childId: string; me: Me; onClose: (ok: boolean) => void; plan?: Plan
  incoming?: { id: string; amount: number; payer: string | null; lessons: number | null }
}) {
  const g0 = incoming ? guess(incoming.amount) : null
  const office = me.role !== 'coach'
  const [plan, setPlan] = useState<Plan>(g0?.plan ?? initPlan ?? 'count')
  const [n, setN] = useState(g0?.n ?? (incoming?.lessons || 8))
  const [disc, setDisc] = useState(g0?.disc ?? 0)
  const [reason, setReason] = useState('')
  const [amt, setAmt] = useState<string>(incoming ? String(incoming.amount) : initPlan === 'trial' ? String(PRICE.trial) : String(priceFor(8)))
  const [method, setMethod] = useState<'cash' | 'epos'>(incoming ? 'epos' : me.role === 'coach' ? 'cash' : 'epos')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [confirmOdd, setConfirmOdd] = useState(false)

  const canDisc = (p: Plan) => p === 'count' || p === 'single' || p === 'trial' || p === 'annual'
  const base = (p: Plan, k: number) => p === 'trial' ? PRICE.trial : p === 'single' ? PRICE.single : p === 'count' ? priceFor(k) : p === 'annual' ? PRICE.annual : 0
  const suggest = (p: Plan, k: number, d: number) => (canDisc(p) ? off(base(p, k), d) : 0)
  const dd = canDisc(plan) ? disc : 0
  function upd(p: Plan, k: number, d: number) {
    setPlan(p); setN(k); setDisc(d); setConfirmOdd(false); setErr(null)
    if (!incoming) setAmt(p === 'month' || p === 'event' ? '' : String(suggest(p, k, d)))
  }
  const dtxt = dd ? ` − ${dd}% = ${money(suggest(plan, n, dd))} BYN` : ''
  const calc = plan === 'count' ? `${n} × ${money(perLesson(n))} = ${money(priceFor(n))} BYN${dtxt}`
    : plan === 'trial' ? `Пробное: ${PRICE.trial} BYN${dtxt}` : plan === 'single' ? `Разовое: ${PRICE.single} BYN${dtxt}` : plan === 'annual' ? `Годовой: ${PRICE.annual} BYN в месяц${dtxt}, 8 занятий каждый месяц` : plan === 'event' ? 'Соревнования и прочее: не влияет на абонемент и остаток занятий' : 'Месяц: сумма вручную'
  const a = parseFloat(amt.replace(',', '.'))
  const expected = suggest(plan, n, dd)
  const mismatch = incoming && canDisc(plan) && plan !== 'annual' && Math.abs(expected - a) > 0.5

  async function save() {
    if (!(a > 0)) return setErr('Введите сумму больше нуля')
    if (plan === 'event' && !note.trim()) return setErr('Укажите, за что оплата (например: Соревнования 22.11)')
    if (plan === 'count' && !incoming && Math.abs(expected - a) > 0.5 && !confirmOdd) { setConfirmOdd(true); return setErr(`Сумма ${money(a)} не совпадает с прайсом (${money(expected)}). Нажмите «Записать» ещё раз, если всё верно`) }
    setBusy(true); setErr(null)
    try {
      if (plan === 'event') await rpc('record_event_payment', { p_child: childId, p_amount: a, p_method: method, p_note: note, p_bot_payment: incoming?.id ?? null })
      else await rpc('record_payment', { p_child: childId, p_amount: a, p_method: method, p_plan_type: plan,
        p_lessons: plan === 'count' ? n : plan === 'annual' ? 8 : null, p_family_discount: false, p_bot_payment: incoming?.id ?? null,
        p_discount: office ? dd : 0, p_discount_reason: office && dd ? reason : null })
      toast(`Записано: ${money(a)} BYN`); onClose(true)
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <h2>Оплата</h2>
      {incoming ? <p className="sub">EPOS {money(incoming.amount)} BYN{incoming.payer ? ` от ${incoming.payer}` : ''}</p>
        : me.role === 'coach' ? <p className="sub">Наличные в кассу</p>
        : <div className="chips">{(['epos', 'cash'] as const).map((m) => <button key={m} className="chip" aria-pressed={method === m} onClick={() => setMethod(m)}>{m === 'epos' ? 'EPOS' : 'Касса'}</button>)}</div>}
      <div><span className="lbl">Что оплачено</span>
        <div className="chips">
          {([['count', 'Абонемент'], ['single', 'Разовое'], ['trial', 'Пробное'], ['annual', 'Годовой'], ['month', 'Месяц'], ['event', 'Соревнования / прочее']] as [Plan, string][]).map(([p, l]) =>
            <button key={p} className="chip" aria-pressed={plan === p} onClick={() => upd(p, n, canDisc(p) ? disc : 0)}>{l}</button>)}
        </div></div>
      {plan === 'count' && <div>
        <span className="lbl">Сколько занятий</span>
        <div className="stepper"><button onClick={() => n > 1 && upd(plan, n - 1, disc)} aria-label="Меньше">−</button><output>{n} {lw(n)}</output><button onClick={() => n < 40 && upd(plan, n + 1, disc)} aria-label="Больше">+</button></div>
        <div className="chips" style={{ marginTop: 8 }}>{[4, 5, 6, 7, 8, 9, 10, 12, 16].map((k) => <button key={k} className="chip" aria-pressed={n === k} onClick={() => upd(plan, k, disc)}>{k}</button>)}</div>
        <p className="sub" style={{ marginTop: 6 }}>Абонемент действует 30 дней</p>
      </div>}
      {office && canDisc(plan) && <div><span className="lbl">Скидка</span>
        <div className="chips">{DISCOUNTS.map((d) => <button key={d} className="chip" aria-pressed={disc === d} onClick={() => upd(plan, n, d)}>{d ? `${d}%` : 'Без скидки'}</button>)}</div>
        {disc > 0 && <>
          <div className="chips" style={{ marginTop: 8 }}>{REASONS.map((r) => <button key={r} className="chip" aria-pressed={reason === r} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>)}</div>
          <input style={{ marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина скидки (необязательно)" aria-label="Причина скидки" />
        </>}</div>}
      {plan === 'event' && <div><label htmlFor="note">За что оплата</label><input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Соревнования 22.11" /></div>}
      <div className="calc">{calc}</div>
      <div><label htmlFor="amt">{incoming ? 'Пришло, BYN' : 'К оплате, BYN'}</label><input id="amt" inputMode="decimal" value={amt} readOnly={!!incoming} onChange={(e) => { setAmt(e.target.value); setConfirmOdd(false) }} /></div>
      {mismatch && <div className="warnbox">Пришло {money(a)}, а по прайсу {money(expected)}. Проверьте, что оплачено.</div>}
      <Err e={err} />
      <button className="btn" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : `Записать · ${method === 'cash' ? 'касса' : 'EPOS'}`}</button>
      <button className="btn ghost" onClick={() => onClose(false)}>Отмена</button>
    </Sheet>
  )
}
