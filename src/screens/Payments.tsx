import { useState } from 'react'
import { rpc, supabase, money, dm, hm, phonePretty, type Me } from '../lib'
import { useLoad, Loading, Err, Pill, Chips, toast } from '../ui'
import { parseEposPdf } from '../epos'
import PaySheet from './PaySheet'
import ChildCard from './ChildCard'

export default function Payments({ me }: { me: Me }) {
  const [view, setView] = useState<'in' | 'groups' | 'cash'>('in')
  return (
    <>
      <Chips options={[['in', 'Входящие EPOS'], ['groups', 'Кто оплатил'], ['cash', 'Наличные']]} value={view} onChange={setView} />
      {view === 'in' ? <Incoming me={me} /> : view === 'groups' ? <ByGroup /> : <CashOverview />}
    </>
  )
}

function Incoming({ me }: { me: Me }) {
  const { data, error, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('bot_payments').select('*').eq('status', 'new').order('paid_at')
    if (error) throw error
    const withMatch = await Promise.all((data || []).map(async (b: any) => ({ ...b, cands: await rpc<any[]>('match_bot_payment', { p_id: b.id }).catch(() => []) })))
    return withMatch
  }, [])
  const [busy, setBusy] = useState(false)
  const [pay, setPay] = useState<{ child: string; b: any } | null>(null)
  const [pick, setPick] = useState<any | null>(null)
  const [q, setQ] = useState('')
  const found = useLoad(() => (pick && q.length >= 2 ? rpc<any[]>('search_children', { p_q: q, p_limit: 10 }) : Promise.resolve([])), [q, !!pick])

  async function upload(f: File) {
    setBusy(true)
    try {
      const { rows, total } = await parseEposPdf(f)
      const sum = Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100
      if (!rows.length) throw new Error('В файле не найдено ни одной оплаты. Это точно реестр платежей EPOS в PDF?')
      if (total != null && Math.abs(sum - total) > 0.01) toast(`Внимание: сумма строк ${money(sum)} не совпала с итогом ${money(total)}`)
      const r: any = await rpc('import_epos_rows', { p_rows: rows })
      toast(`Загружено новых: ${r.added}. Уже были: ${r.already_loaded}. До старта учёта: ${r.before_start_date}`)
      reload()
    } catch (e: any) { toast(e.message) }
    setBusy(false)
  }
  async function quick(b: any, childId: string) {
    const plan = (await rpc<any[]>('plan_from_amount', { p_amount: b.amount }))[0]
    if (!plan) return setPay({ child: childId, b })
    try {
      await rpc('record_payment', { p_child: childId, p_amount: b.amount, p_method: 'epos', p_plan_type: plan.plan_type, p_lessons: plan.lessons, p_family_discount: plan.family_discount, p_bot_payment: b.id })
      toast('Проведено'); reload()
    } catch (e: any) { toast(e.message) }
  }
  async function ignore(b: any) {
    try { await rpc('ignore_bot_payment', { p_id: b.id, p_reason: 'не за плавание / дубль' }); toast('Убрано из списка'); reload() } catch (e: any) { toast(e.message) }
  }
  return (
    <>
      <div className="note">Скачайте в кабинете EPOS «Реестр платежей» в PDF и загрузите сюда. Повторная загрузка того же периода ничего не задвоит.</div>
      <label className="btn" style={{ textAlign: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 15, color: 'var(--accent-ink)' }}>
        {busy ? 'Читаю отчёт…' : 'Загрузить отчёт EPOS (PDF)'}
        <input type="file" accept="application/pdf" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      <Err e={error} />
      <h2>Ждут разбора · {data?.length ?? '…'}</h2>
      {!data ? <Loading /> : (
        <div className="list">
          {data.length === 0 && <div className="row meta">Всё разобрано</div>}
          {data.map((b: any) => (
            <div className="miss" key={b.id}>
              <div className="bot">{money(b.amount)} BYN · {b.paid_at ? new Date(b.paid_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}{'\n'}Плательщик: {b.payer || '(не указан)'}{b.lessons ? `\nПо сумме: ${b.lessons} зан.` : '\nСумма не по прайсу'}</div>
              {b.cands.length === 1 ? <>
                <div className="okbox">{b.cands[0].child_name} · {b.cands[0].reason}</div>
                <div className="acts"><button className="btn sm okb" onClick={() => quick(b, b.cands[0].child_id)}>Провести</button><button className="btn sm ghost" onClick={() => { setPick(b); setQ('') }}>Другой ребёнок</button></div>
              </> : b.cands.length > 1 ? <>
                <div className="warnbox">Подходят несколько. За кого оплата?</div>
                <div className="chips">{b.cands.map((c: any) => <button key={c.child_id} className="chip" onClick={() => quick(b, c.child_id)}>{c.child_name}</button>)}<button className="chip" onClick={() => { setPick(b); setQ('') }}>Другой…</button></div>
              </> : <>
                <div className="warnbox">Ребёнок не найден автоматически</div>
                <div className="acts"><button className="btn sm" onClick={() => { setPick(b); setQ(b.payer?.split(' ')[0] || '') }}>Выбрать ребёнка</button><button className="btn sm ghost" onClick={() => ignore(b)}>Не за плавание</button></div>
              </>}
              {pick?.id === b.id && <>
                <input autoFocus placeholder="Фамилия ребёнка или родителя" value={q} onChange={(e) => setQ(e.target.value)} />
                <div className="list">{(found.data || []).map((c: any) => <button key={c.child_id} className="row" onClick={() => { setPick(null); setPay({ child: c.child_id, b }) }}><span className="grow"><span className="name">{c.full_name}</span><br /><span className="meta">{c.groups} · {phonePretty(c.phone)}</span></span></button>)}</div>
              </>}
            </div>
          ))}
        </div>
      )}
      {pay && <PaySheet childId={pay.child} me={me} incoming={{ id: pay.b.id, amount: Number(pay.b.amount), payer: pay.b.payer, lessons: pay.b.lessons }} onClose={(ok) => { setPay(null); if (ok) reload() }} />}
    </>
  )
}

function ByGroup() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const sum = useLoad(() => rpc<any[]>('payment_summary', { p_month: month + '-01' }), [month])
  const [open, setOpen] = useState<string | null>(null)
  const [card, setCard] = useState<string | null>(null)
  const det = useLoad(() => (open ? rpc<any[]>('payment_status', { p_month: month + '-01', p_group: open }) : Promise.resolve([])), [open, month])
  const ST: Record<string, [string, string]> = { paid: ['Оплачено', 'p-ok'], balance: ['Есть остаток', 'p-acc'], frozen: ['Заморожен', 'p-mut'], unpaid: ['Не оплачено', 'p-bad'] }
  return (
    <>
      <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setOpen(null) }} aria-label="Месяц" />
      <Err e={sum.error} />
      {!sum.data ? <Loading /> : (
        <div className="list">
          {sum.data.map((g: any) => (
            <div key={g.group_id}>
              <button className="row" onClick={() => setOpen(open === g.group_id ? null : g.group_id)}>
                <span className="time">{hm(g.start_time)}</span>
                <span className="grow"><span className="name">{g.branch} · {g.coach || ''}</span><br />
                  <span className="meta">{g.total} детей: оплатили {g.paid}, остаток {g.balance}, не оплатили {g.unpaid}{g.frozen ? `, заморожено ${g.frozen}` : ''}</span><br />
                  <span className="meta">касса {money(g.cash)} · EPOS {money(g.epos)}</span></span>
                <Pill c={g.unpaid ? 'p-bad' : 'p-ok'}>{g.unpaid ? `не опл. ${g.unpaid}` : 'все'}</Pill>
              </button>
              {open === g.group_id && (det.data ? det.data.map((c: any) => (
                <button className="row" key={c.child_id} style={{ paddingLeft: 28 }} onClick={() => setCard(c.child_id)}>
                  <span className="grow"><span className="name">{c.child_name}</span><br />
                    <span className="meta">{Number(c.paid_cash) ? `касса ${money(c.paid_cash)} ` : ''}{Number(c.paid_epos) ? `EPOS ${money(c.paid_epos)} ` : ''}{c.last_paid_at ? `· ${dm(c.last_paid_at.slice(0, 10))}` : ''}{c.state === 'balance' ? `остаток ${c.lessons_left}` : ''}</span><br />
                    <span className="meta phone">{phonePretty(c.phone)}</span></span>
                  <Pill c={ST[c.state][1]}>{ST[c.state][0]}</Pill>
                </button>)) : <Loading />)}
            </div>
          ))}
          {sum.data.length === 0 && <div className="row meta">Нет групп</div>}
        </div>
      )}
      {card && <ChildCard id={card} onClose={() => setCard(null)} />}
    </>
  )
}

function CashOverview() {
  const { data, error } = useLoad(() => rpc<any[]>('cash_overview'), [])
  const total = (data || []).reduce((a, r) => a + Number(r.on_hand) + Number(r.pending), 0)
  return (
    <>
      <p className="sub">Сколько наличных сейчас у каждого сотрудника: принято в кассу минус сдано. «Ждёт» — сдал, но получение ещё не подтверждено (подтверждается на вкладке «Сегодня»).</p>
      <Err e={error} />
      {!data ? <Loading /> : <div className="list">
        {data.length === 0 && <div className="row meta">Наличных оплат ещё не было</div>}
        {data.map((r: any) => <div className="row" key={r.staff_id}>
          <span className="grow"><span className="name">{r.full_name}</span><br />
            <span className="meta">{Number(r.pending) ? `ждёт подтверждения ${money(r.pending)} BYN · ` : ''}{r.last_handover ? `последняя сдача ${dm(r.last_handover.slice(0, 10))}` : 'ещё не сдавал(а)'}</span></span>
          <Pill c={Number(r.on_hand) > 0 ? 'p-warn' : 'p-ok'}>{money(r.on_hand)} BYN</Pill>
        </div>)}
      </div>}
      <div className="calc">Всего вне кассы: {money(total)} BYN</div>
    </>
  )
}
