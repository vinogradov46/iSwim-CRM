import { useState } from 'react'
import { rpc, money, todayISO } from '../lib'
import { useLoad, Loading, Err, Pill, Chips } from '../ui'
import ChildCard from './ChildCard'

type G = { id: string; title: string; branch: string | null; coach: string | null; cap: number; n: number; reserve: number; fill: number }
type A = {
  month: string; revenue: { branch: string; sum: number; cash: number | null; epos: number | null; n: number }[]; revenue_prev: number
  groups: G[]; debt: { n: number; lessons: number; sum: number; zero: number; top: { id: string; name: string; lessons: number; sum: number; group: string | null }[] }
  trials: { total: number; came: number; noshow: number; open: number; bought: number }
  left: { n: number; reasons: { reason: string; n: number }[] }; totals: { active: number; reserve: number; trial: number }
}
const monthNow = () => todayISO().slice(0, 7)
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0)

/** Аналитика для директора: деньги, группы, пробные, должники, уходы. */
export default function Analytics() {
  const [month, setMonth] = useState(monthNow())
  const [gf, setGf] = useState<'all' | 'free' | 'full'>('all')
  const [card, setCard] = useState<string | null>(null)
  const { data: d, error, reload } = useLoad(() => rpc<A>('analytics', { p_month: month + '-01' }), [month])
  const total = d ? d.revenue.reduce((a, x) => a + Number(x.sum), 0) : 0
  const maxB = d ? Math.max(1, ...d.revenue.map((x) => Number(x.sum))) : 1
  const delta = d && d.revenue_prev > 0 ? Math.round((100 * (total - d.revenue_prev)) / d.revenue_prev) : null
  const groups = (d?.groups || []).filter((g) => gf === 'all' ? true : gf === 'free' ? g.n < g.cap : g.n >= g.cap || g.reserve > 0)
  const seats = d ? d.groups.reduce((a, g) => a + Math.max(0, g.cap - g.n), 0) : 0
  return (
    <>
      <input type="month" value={month} max={monthNow()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Месяц" />
      <Err e={error} />
      {!d ? <Loading /> : <>
        <div className="stats two">
          <div className="stat"><b>{money(total)}</b><small>BYN выручка{delta !== null ? ` · ${delta > 0 ? '+' : ''}${delta}% к прошлому месяцу` : ''}</small></div>
          <div className="stat"><b>{d.totals.active}</b><small>детей занимаются сейчас · в резерве {d.totals.reserve}</small></div>
          <div className={`stat ${d.debt.n ? 'hot' : ''}`}><b>{d.debt.n}</b><small>ходят без оплаты · {money(d.debt.sum)} BYN</small></div>
          <div className="stat"><b>{d.left.n}</b><small>ушли за месяц</small></div>
        </div>
        {delta === null && <p className="note">Прошлого месяца в системе нет, поэтому сравнивать не с чем. Система работает с ноября 2026.</p>}

        <h2>Выручка по филиалам</h2>
        <div className="list">
          {d.revenue.length === 0 && <div className="row meta">Оплат за месяц нет</div>}
          {d.revenue.map((r) => (
            <div className="row an-row" key={r.branch}>
              <span className="grow"><span className="name">{r.branch}</span><br />
                <span className="meta">{r.n} оплат · EPOS {money(r.epos || 0)} · наличные {money(r.cash || 0)}</span>
                <span className="an-bar"><i style={{ width: `${(100 * Number(r.sum)) / maxB}%` }} /></span></span>
              <b>{money(r.sum)}</b>
            </div>))}
        </div>

        <h2>Пробные занятия</h2>
        <div className="stats three">
          <div className="stat"><b>{d.trials.total}</b><small>записалось</small></div>
          <div className="stat"><b>{d.trials.came}</b><small>пришло{d.trials.open ? ` · ещё впереди ${d.trials.open}` : ''}</small></div>
          <div className="stat"><b>{d.trials.bought}</b><small>купили абонемент · {pct(d.trials.bought, d.trials.came)}% от пришедших</small></div>
        </div>
        {d.trials.noshow > 0 && <p className="note">Не пришли на пробное: {d.trials.noshow}. Им стоит позвонить и предложить другую дату.</p>}

        <h2>Заполненность групп</h2>
        <p className="sub">Свободных мест всего: {seats}</p>
        <Chips options={[['all', 'Все'], ['free', 'Есть места'], ['full', 'Полные / очередь']]} value={gf} onChange={setGf} />
        <div className="list">
          {groups.map((g) => (
            <div className="row an-row" key={g.id}>
              <span className="grow"><span className="name">{g.title}</span><br />
                <span className="meta">{[g.branch, g.coach, g.reserve ? `в очереди ${g.reserve}` : null].filter(Boolean).join(' · ')}</span>
                <span className="an-bar"><i className={g.fill >= 100 ? 'full' : g.fill < 50 ? 'low' : ''} style={{ width: `${Math.min(100, g.fill)}%` }} /></span></span>
              <span style={{ textAlign: 'right' }}><b>{g.n}/{g.cap}</b><br /><span className="meta">{g.fill}%</span></span>
            </div>))}
          {groups.length === 0 && <div className="row meta">Таких групп нет</div>}
        </div>

        <h2>Ходят без оплаты</h2>
        <p className="sub">{d.debt.n} детей, {d.debt.lessons} занятий, примерно {money(d.debt.sum)} BYN. Ещё {d.debt.zero} с закончившимся абонементом.</p>
        <div className="list">
          {d.debt.top.map((x) => (
            <button className="row" key={x.id} onClick={() => setCard(x.id)}>
              <span className="grow"><span className="name">{x.name}</span><br /><span className="meta">{x.group} · {x.lessons} зан.</span></span>
              <Pill c="p-bad">{money(x.sum)} BYN</Pill>
            </button>))}
          {d.debt.n > d.debt.top.length && <div className="row meta">Показаны {d.debt.top.length} самых больших из {d.debt.n}</div>}
        </div>

        <h2>Кто ушёл</h2>
        <div className="list">
          {d.left.reasons.length === 0 && <div className="row meta">За месяц никто не ушёл</div>}
          {d.left.reasons.map((r) => <div className="row" key={r.reason}><span className="grow">{r.reason}</span><b>{r.n}</b></div>)}
        </div>
        <p className="note">Оплаты считаются по дате в Минске, без отменённых. Выручка к филиалу относится по текущей группе ребёнка.</p>
      </>}
      {card && <ChildCard id={card} onClose={() => { setCard(null); reload() }} />}
    </>
  )
}
