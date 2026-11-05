import { useState } from 'react'
import { rpc, supabase, money, dm, type Me } from '../lib'
import { useLoad, Loading, Err, Sheet, toast } from '../ui'

export default function Cash({ me }: { me: Me }) {
  const onHand = useLoad(() => rpc<number>('cash_on_hand'), [])
  const pays = useLoad(async () => (await supabase.from('payments').select('id,amount,method,plan_type,lessons,paid_at,cancelled_at,children(full_name)').eq('received_by', me.id).order('paid_at', { ascending: false }).limit(50)).data || [], [])
  const hos = useLoad(async () => (await supabase.from('cash_handovers').select('*').eq('coach_id', me.id).order('created_at', { ascending: false }).limit(20)).data || [], [])
  const sal = useLoad(() => rpc<any[]>('payroll_calc'), [])
  const [give, setGive] = useState(false)
  const [amt, setAmt] = useState('')
  const on = Number(onHand.data || 0)
  const my = sal.data?.[0]
  async function handover() {
    const v = parseFloat(amt.replace(',', '.'))
    if (!(v > 0) || v > on + 0.001) return toast(`Сумма от 0 до ${money(on)} BYN`)
    try { await rpc('handover_cash', { p_amount: v }); toast('Отправлено администратору'); setGive(false); onHand.reload(); hos.reload() } catch (e: any) { toast(e.message) }
  }
  return (
    <>
      <div className="list"><div className="row"><span className="grow"><span className="name">Моя зарплата за месяц</span><br />
        <span className="meta">{!my ? '…' : my.pay_type === 'percent' ? `${my.pay_pct}% от ${money(my.base_amount)} BYN оплат групп` : my.pay_rate ? `${my.sessions_done} занятий × ${money(my.pay_rate)} BYN` : `${my.sessions_done} занятий · ставку ещё не внесли`}</span></span>
        <span className="big" style={{ fontSize: 20 }}>{my?.salary != null ? `${money(my.salary)} BYN` : '—'}</span></div></div>
      <div className="stats two"><div className={`stat ${on > 0 ? 'hot' : ''}`}><b>{money(on)}</b><small>BYN наличных у вас</small></div>
        <button className="stat" disabled={on <= 0} onClick={() => { setAmt(String(on)); setGive(true) }}><b>→</b><small>Сдать администратору</small></button></div>
      <h2>Принятые оплаты</h2>
      <Err e={pays.error} />
      {!pays.data ? <Loading /> : <div className="list">{pays.data.length === 0 && <div className="row meta">Пока ничего</div>}
        {pays.data.map((p: any) => <div className="row" key={p.id}><span className="grow"><span className="name">{p.children?.full_name}</span><br /><span className="meta">{dm(p.paid_at.slice(0, 10))} · {p.method === 'cash' ? 'касса' : 'EPOS'}{p.cancelled_at ? ' · отменена' : ''}</span></span><span className="pill p-warn">{money(p.amount)} BYN</span></div>)}</div>}
      <h2>Сдача наличных</h2>
      {!hos.data ? <Loading /> : <div className="list">{hos.data.length === 0 && <div className="row meta">Ещё не сдавали</div>}
        {hos.data.map((h: any) => <div className="row" key={h.id}><span className="grow"><span className="name">{money(h.amount)} BYN</span><br /><span className="meta">{dm(h.created_at.slice(0, 10))}</span></span><span className={`pill ${h.status === 'confirmed' ? 'p-ok' : 'p-warn'}`}>{h.status === 'confirmed' ? 'Получено' : 'Ждёт подтверждения'}</span></div>)}</div>}
      {give && <Sheet onClose={() => setGive(false)}>
        <h2>Сдать наличные</h2><p className="sub">Администратор подтвердит получение. До этого сумма числится за вами.</p>
        <div><label htmlFor="ha">Сумма, BYN</label><input id="ha" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
        <button className="btn" onClick={handover}>Сдать</button><button className="btn ghost" onClick={() => setGive(false)}>Отмена</button>
      </Sheet>}
    </>
  )
}
