import { useState } from 'react'
import { rpc, money, lw, perLesson, priceFor, PRICE, type Me } from '../lib'
import { Sheet, Err, toast } from '../ui'

type Plan = 'count' | 'single' | 'trial' | 'month' | 'annual'

/** Оплата: тренер — наличные в кассу, офис — EPOS (или из входящей оплаты) */
export default function PaySheet({ childId, me, onClose, incoming }: {
  childId: string; me: Me; onClose: (ok: boolean) => void
  incoming?: { id: string; amount: number; payer: string | null; lessons: number | null }
}) {
  const [plan, setPlan] = useState<Plan>('count')
  const [n, setN] = useState(incoming?.lessons || 8)
  const [fam, setFam] = useState(false)
  const [amt, setAmt] = useState<string>(incoming ? String(incoming.amount) : String(priceFor(8)))
  const [method, setMethod] = useState<'cash' | 'epos'>(incoming ? 'epos' : me.role === 'coach' ? 'cash' : 'epos')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const suggest = (p: Plan, k: number, f: boolean) => p === 'trial' ? PRICE.trial : p === 'single' ? PRICE.single : p === 'count' ? priceFor(k, f) : 0
  function upd(p: Plan, k: number, f: boolean) {
    setPlan(p); setN(k); setFam(f)
    if (!incoming) setAmt(p === 'month' || p === 'annual' ? '' : String(suggest(p, k, f)))
  }
  const calc = plan === 'count' ? `${n} × ${money(perLesson(n))} = ${money(priceFor(n))} BYN${fam ? ` − 10% = ${money(priceFor(n, true))} BYN` : ''}`
    : plan === 'trial' ? `Пробное: ${PRICE.trial} BYN` : plan === 'single' ? `Разовое: ${PRICE.single} BYN` : plan === 'annual' ? 'Годовой: 8 занятий каждый месяц' : 'Месяц: сумма вручную'
  const a = parseFloat(amt.replace(',', '.'))
  const mismatch = incoming && plan === 'count' && Math.abs(priceFor(n, fam) - a) > 0.5

  async function save() {
    if (!(a > 0)) return setErr('Введите сумму больше нуля')
    setBusy(true); setErr(null)
    try {
      await rpc('record_payment', { p_child: childId, p_amount: a, p_method: method, p_plan_type: plan,
        p_lessons: plan === 'count' ? n : plan === 'annual' ? 8 : null, p_family_discount: fam, p_bot_payment: incoming?.id ?? null })
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
          {([['count', 'Абонемент'], ['single', 'Разовое'], ['trial', 'Пробное'], ['annual', 'Годовой'], ['month', 'Месяц']] as [Plan, string][]).map(([p, l]) =>
            <button key={p} className="chip" aria-pressed={plan === p} onClick={() => upd(p, n, fam)}>{l}</button>)}
        </div></div>
      {plan === 'count' && <div>
        <span className="lbl">Сколько занятий</span>
        <div className="stepper"><button onClick={() => n > 1 && upd(plan, n - 1, fam)} aria-label="Меньше">−</button><output>{n} {lw(n)}</output><button onClick={() => n < 40 && upd(plan, n + 1, fam)} aria-label="Больше">+</button></div>
        <div className="chips" style={{ marginTop: 8 }}>{[4, 5, 6, 7, 8, 9, 10, 12, 16].map((k) => <button key={k} className="chip" aria-pressed={n === k} onClick={() => upd(plan, k, fam)}>{k}</button>)}</div>
        <div className="chips" style={{ marginTop: 8 }}><button className="chip" aria-pressed={fam} onClick={() => upd(plan, n, !fam)}>Скидка 10% для семьи</button></div>
        <p className="sub" style={{ marginTop: 6 }}>Абонемент действует 30 дней</p>
      </div>}
      <div className="calc">{calc}</div>
      <div><label htmlFor="amt">{incoming ? 'Пришло, BYN' : 'К оплате, BYN'}</label><input id="amt" inputMode="decimal" value={amt} readOnly={!!incoming} onChange={(e) => setAmt(e.target.value)} /></div>
      {mismatch && <div className="warnbox">Пришло {money(a)}, а по прайсу {money(priceFor(n, fam))}. Проверьте, что оплачено.</div>}
      <Err e={err} />
      <button className="btn" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : `Записать · ${method === 'cash' ? 'касса' : 'EPOS'}`}</button>
      <button className="btn ghost" onClick={() => onClose(false)}>Отмена</button>
    </Sheet>
  )
}
