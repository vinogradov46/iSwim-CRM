import { useState } from 'react'
import { rpc, supabase, money } from '../lib'
import { useLoad, Loading, Err, Chips, toast } from '../ui'

export function Salary() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const { data, error, reload } = useLoad(() => rpc<any[]>('payroll_calc', { p_month: month + '-01' }), [month])
  const [rates, setRates] = useState<Record<string, string>>({})
  async function save(id: string, type: string, pct: number | null) {
    const v = parseFloat((rates[id] || '').replace(',', '.'))
    try { await rpc('set_coach_pay', { p_staff: id, p_type: type, p_rate: type === 'lesson' ? (v > 0 ? v : null) : null, p_pct: type === 'percent' ? pct : null }); toast('Ставка сохранена'); reload() } catch (e: any) { toast(e.message) }
  }
  const total = (data || []).reduce((a, r) => a + Number(r.salary || 0), 0)
  return (
    <>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Месяц" />
      <p className="sub">Считается из отмеченных занятий. Замену получает тот, кто провёл. Тренер видит только свою сумму.</p>
      <Err e={error} />
      {!data ? <Loading /> : <div className="list">{data.map((r) => (
        <div className="miss" key={r.staff_id}>
          <div style={{ display: 'flex', gap: 10 }}><span className="grow"><span className="name">{r.full_name}</span><br />
            <span className="meta">{r.pay_type === 'percent' ? `${r.pay_pct}% от ${money(r.base_amount)} BYN оплат` : `${r.sessions_done} занятий${r.pay_rate ? ` × ${money(r.pay_rate)}` : ' · ставка не задана'}`}</span></span>
            <span className="big" style={{ fontSize: 18 }}>{r.salary != null ? money(r.salary) : '—'}</span></div>
          {r.pay_type !== 'percent' && <div style={{ display: 'flex', gap: 8 }}>
            <input inputMode="decimal" placeholder={r.pay_rate ? String(r.pay_rate) : 'ставка за занятие'} value={rates[r.staff_id] ?? ''} onChange={(e) => setRates({ ...rates, [r.staff_id]: e.target.value })} />
            <button className="btn sm" onClick={() => save(r.staff_id, 'lesson', null)}>Сохранить</button></div>}
        </div>))}</div>}
      <div className="calc">Итого: {money(total)} BYN</div>
    </>
  )
}

export function Journal() {
  const staff = useLoad(() => rpc<any[]>('staff_directory'), [])
  const [who, setWho] = useState<string>('all')
  const { data, error } = useLoad(async () => {
    let q = supabase.from('audit_log').select('id,at,action,details,actor_id,children(full_name)').order('at', { ascending: false }).limit(150)
    if (who !== 'all') q = who === 'system' ? q.is('actor_id', null) : q.eq('actor_id', who)
    const r = await q; if (r.error) throw r.error; return r.data
  }, [who])
  const name = (id: string | null) => (id ? staff.data?.find((s: any) => s.id === id)?.full_name : 'Система') || '…'
  const A: Record<string, string> = { attendance: 'Отметка', attendance_fix: 'Правка отметки (офис)', attendance_cleared: 'Отметка снята', payment: 'Оплата', payment_cancel: 'Отмена оплаты',
    enroll: 'Запись', cash_handover: 'Сдал наличные', cash_confirmed: 'Получены наличные', sick_resolved: 'Пропуск по болезни', epos_import: 'Загрузка отчёта EPOS', expired: 'Сгорание остатка',
    session_cancel: 'Отмена занятия', substitute: 'Замена', makeup: 'Отработка', pay_scheme: 'Ставка тренера', notes: 'Особенности', skill: 'Навык', task_done: 'Задача', trial_mark: 'Пробное' }
  return (
    <>
      <h2>Журнал изменений</h2>
      <Chips options={[['all', 'Все'], ['system', 'Система'], ...((staff.data || []).map((s: any) => [s.id, s.full_name]) as [string, string][])]} value={who} onChange={setWho} />
      <Err e={error} />
      {!data ? <Loading /> : <div className="list">{data.map((j: any) => (
        <div className="row" key={j.id}><span className="grow"><span className="meta">{new Date(j.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {name(j.actor_id)}</span><br />
          {A[j.action] || j.action}{j.children?.full_name ? `: ${j.children.full_name}` : ''}{j.details?.amount ? ` · ${money(j.details.amount)} BYN` : ''}{j.details?.reason ? ` · ${j.details.reason}` : ''}</span></div>))}</div>}
    </>
  )
}
