import { useState } from 'react'
import { rpc, supabase, dm, money, phonePretty, balanceState, todayISO, type Me } from '../lib'
import { Sheet, useLoad, Loading, Err, Pill, toast } from '../ui'
import PaySheet from './PaySheet'

const LEFT = ['Переезд', 'Дорого', 'Неудобное время', 'Не понравилось', 'Болезнь', 'Другое']
const addDays = (n: number) => { const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

export default function ChildCard({ id, onClose, me }: { id: string; onClose: () => void; me?: Me }) {
  const { data, error, reload } = useLoad(() => rpc<any>('child_card', { p_child: id }), [id])
  const whoami = useLoad(() => (me ? Promise.resolve([me]) : rpc<Me[]>('whoami')), [])
  const skills = useLoad(async () => (await supabase.from('skill_levels').select('*').order('sort')).data || [], [])
  const [mode, setMode] = useState<string | null>(null)
  const [notes, setNotes] = useStateInit(data?.child?.notes || '')
  const [bal, setBal] = useState('')
  const [why, setWhy] = useState('')
  const [q, setQ] = useState('')
  const groups = useLoad(() => (mode === 'move' || mode === 'add_group' || mode === 'makeup' ? rpc<any[]>('sessions_on', { p_date: todayISO() }) : Promise.resolve([])), [mode])
  const allGroups = useLoad(async (): Promise<any[]> => (mode === 'move' || mode === 'add_group' ? (await supabase.from('groups').select('id,title,start_time,capacity,branches(name)').eq('active', true).order('start_time')).data || [] : []), [mode])
  const self = whoami.data?.[0]
  const office = self && self.role !== 'coach'

  async function act(action: string, args: any = {}, msg = 'Сохранено') {
    try { await rpc('child_action', { p_child: id, p_action: action, p_args: args }); toast(msg); setMode(null); reload() }
    catch (e: any) { toast(e.message) }
  }
  if (!data) return <Sheet onClose={onClose}>{error ? <Err e={error} /> : <Loading />}<button className="btn ghost" onClick={onClose}>Закрыть</button></Sheet>
  const c = data.child, f = data.family
  const st = c.status === 'active' ? balanceState(c) : { t: { trial: 'Пробное', reserve: 'Резерв', left: 'Ушёл', lost: 'Не дошёл' }[c.status as string] || c.status, c: 'p-mut' }

  if (mode === 'pay' && self) return <PaySheet childId={id} me={self} onClose={(ok) => { setMode(null); if (ok) reload() }} />
  return (
    <Sheet onClose={onClose}>
      <h2>{c.full_name}</h2>
      <div className="chips">
        <Pill c={st.c}>{st.t}</Pill>
        {c.plan_kind === 'annual' && <Pill c="p-acc">Годовой до {dm(c.annual_until)}</Pill>}
        {c.plan_kind === 'count' && c.sub_end && <Pill c="p-mut">Абонемент до {dm(c.sub_end)}</Pill>}
        <Pill c={c.cert_until && c.cert_until >= todayISO() ? 'p-ok' : 'p-bad'}>{c.cert_until ? `Справка до ${dm(c.cert_until)}` : 'Нет справки'}</Pill>
      </div>
      <div><span className="lbl">Группы</span>{data.groups.map((g: any) => <div key={g.group_id}>{g.title}{g.primary ? ' · основная' : ''}{g.status === 'reserve' ? ' · резерв' : ''}</div>)}</div>
      <div><span className="lbl">Семья</span><div className="name">{f.parent_name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="phone">{phonePretty(f.phone)}{f.phone2 ? `, ${phonePretty(f.phone2)}` : ''}</span>
          <button className="btn sm ghost" onClick={() => { try { navigator.clipboard.writeText(f.phone).then(() => toast('Телефон скопирован'), () => toast(f.phone)) } catch { toast(f.phone) } }}>Скопировать</button>
          <a className="btn sm ghost" href={`tel:${f.phone.replace(/[^\d+]/g, '')}`}>Позвонить</a>
        </div>
        {data.siblings.length > 0 && <div className="meta">Дети в семье: {data.siblings.map((s: any) => s.full_name).join(', ')}</div>}
      </div>
      <div><span className="lbl">Особенности</span>
        {mode === 'notes' ? <>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Боится нырять, аллергия…" />
          <div className="acts" style={{ marginTop: 6 }}><button className="btn sm" onClick={async () => { try { await rpc('update_child_notes', { p_child: id, p_notes: notes }); toast('Сохранено'); setMode(null); reload() } catch (e: any) { toast(e.message) } }}>Сохранить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </> : <div style={{ display: 'flex', gap: 8 }}><span className="grow" style={c.notes ? { color: 'var(--warn)', fontWeight: 600 } : {}}>{c.notes || 'Ничего не указано'}</span><button className="btn sm ghost" onClick={() => { setNotes(c.notes || ''); setMode('notes') }}>Изменить</button></div>}
      </div>
      {skills.data && skills.data.length > 0 && <div><span className="lbl">Навыки · {data.skills.length} из {skills.data.length}</span>
        <div className="skills">{skills.data.map((s: any) => (
          <button key={s.id} className="skill" aria-pressed={data.skills.includes(s.id)} onClick={async () => { try { await rpc('toggle_skill', { p_child: id, p_skill: s.id }); reload() } catch (e: any) { toast(e.message) } }}>
            <span className="box">{data.skills.includes(s.id) ? '✓' : ''}</span>{s.name}</button>))}</div></div>}
      <div><span className="lbl">{office ? 'Оплаты' : 'Оплаты, принятые вами'}</span>
        <div className="hist">{data.payments.length ? data.payments.map((p: any) => <div key={p.id}><span>{dm(p.paid_at.slice(0, 10))} · {p.plan_type === 'count' ? `${p.lessons} зан.` : p.plan_type}{p.cancelled ? ' (отменена)' : ''}</span><span>{money(p.amount)} · {p.method === 'cash' ? 'касса' : 'EPOS'}</span></div>) : <span className="meta">Нет</span>}</div></div>
      {data.tasks.length > 0 && <div className="warnbox">{data.tasks.map((t: any) => <div key={t.id}>{t.text}</div>)}</div>}

      {/* действия */}
      {c.status !== 'left' && c.status !== 'lost' && <button className="btn" onClick={() => setMode('pay')}>Внести оплату</button>}
      {office && <>
        {mode === 'balance' ? <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
          <label htmlFor="bal">Новый остаток занятий (сейчас {c.lessons_left})</label><input id="bal" inputMode="numeric" value={bal} onChange={(e) => setBal(e.target.value)} />
          <label htmlFor="why">Причина</label><input id="why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="сверка с тренером, перерасчёт…" />
          <div className="acts"><button className="btn sm" onClick={() => { const v = parseInt(bal, 10); if (isNaN(v) || !why.trim()) return toast('Укажите число и причину'); act('set_balance', { lessons: v, reason: why, sub_start: todayISO(), sub_end: addDays(30) }, 'Остаток изменён') }}>Сохранить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </div> : null}
        <div className="acts">
          <button className="btn sm ghost" onClick={() => { setBal(String(c.lessons_left)); setWhy(''); setMode('balance') }}>Исправить остаток</button>
          {c.frozen_until && c.frozen_until > todayISO() ? <button className="btn sm ghost" onClick={() => act('unfreeze', {}, 'Заморозка снята')}>Снять заморозку</button>
            : <button className="btn sm ghost" onClick={() => setMode('freeze')}>Заморозить</button>}
          <button className="btn sm ghost" onClick={() => setMode('makeup')}>Отработка / перенос</button>
          <button className="btn sm ghost" onClick={() => setMode('add_group')}>Добавить группу</button>
          <button className="btn sm ghost" onClick={() => setMode('move')}>Перевести</button>
          <button className="btn sm ghost" onClick={() => setMode('cert')}>Справка</button>
          {c.status === 'reserve' && <button className="btn sm" onClick={() => act('to_group', {}, 'Переведён в группу')}>Из резерва в группу</button>}
          {(c.status === 'left' || c.status === 'lost') ? <button className="btn sm" onClick={() => act('return', {}, 'Вернули')}>Вернуть</button>
            : <button className="btn sm bad" onClick={() => setMode('leave')}>Ушёл</button>}
        </div>
        {mode === 'freeze' && <div className="chips">{[7, 14, 21, 30].map((d) => <button key={d} className="chip" onClick={() => act('freeze', { days: d, reason: 'по заявлению' }, `Заморожено на ${d} дн.`)}>{d} дней</button>)}</div>}
        {mode === 'cert' && <div className="chips">{[[90, '3 месяца'], [180, '6 месяцев'], [365, '12 месяцев']].map(([d, l]) => <button key={d} className="chip" onClick={() => act('cert', { until: addDays(d as number) }, 'Справка обновлена')}>{l as string}</button>)}</div>}
        {mode === 'leave' && <div className="chips">{LEFT.map((r) => <button key={r} className="chip" onClick={() => act('leave', { reason: r }, 'Отмечено')}>{r}</button>)}</div>}
        {(mode === 'move' || mode === 'add_group') && <>
          <input placeholder="Найти группу: филиал или время" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips">{(allGroups.data || []).filter((g: any) => `${g.branches?.name} ${g.title}`.toLowerCase().includes(q.toLowerCase())).slice(0, 20).map((g: any) =>
            <button key={g.id} className="chip" onClick={() => act(mode, { group_id: g.id }, mode === 'move' ? 'Переведён' : 'Группа добавлена')}>{g.branches?.name} · {g.title}</button>)}</div>
        </>}
        {mode === 'makeup' && <>
          <p className="sub">Занятия сегодня. Занятие спишется с остатка как обычное.</p>
          <div className="chips">{(groups.data || []).filter((s: any) => s.status === 'planned').map((s: any) =>
            <button key={s.session_id} className="chip" onClick={async () => { try { await rpc('book_makeup', { p_session: s.session_id, p_child: id, p_kind: 'makeup' }); toast('Записан на отработку'); setMode(null); reload() } catch (e: any) { toast(e.message) } }}>{s.branch} · {s.title}</button>)}</div>
        </>}
      </>}
      <div><span className="lbl">История</span><div className="hist">{data.history.map((h: any, i: number) => <div key={i}><span>{dm(h.at.slice(0, 10))}</span><span>{h.text}</span></div>)}</div></div>
      <button className="btn ghost" onClick={onClose}>Закрыть</button>
    </Sheet>
  )
}

function useStateInit<T>(v: T) { return useState<T>(v) }
