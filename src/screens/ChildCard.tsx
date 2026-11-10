import { useState } from 'react'
import { rpc, supabase, dm, hm, gshort, gname, money, phonePretty, phoneE164, balanceState, todayISO, type Me } from '../lib'
import { Sheet, useLoad, Loading, Err, Pill, toast } from '../ui'
import PaySheet from './PaySheet'
import TrialDates from './TrialDates'

const LEFT = ['Переезд', 'Дорого', 'Неудобное время', 'Не понравилось', 'Болезнь', 'Другое']
const LOST = ['Не понравилось', 'Дорого', 'Неудобное время', 'Не отвечает', 'Передумали', 'Другое']
const PLAN: Record<string, string> = { count: 'абонемент', single: 'разовое', trial: 'пробное', month: 'месяц', annual: 'годовой', opening: 'стартовый остаток' }
const addDays = (n: number, from = todayISO()) => { const d = new Date(from + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export default function ChildCard({ id, onClose, me }: { id: string; onClose: () => void; me?: Me }) {
  const { data, error, reload } = useLoad(() => rpc<any>('child_card', { p_child: id }), [id])
  const whoami = useLoad(() => (me ? Promise.resolve([me]) : rpc<Me[]>('whoami')), [])
  const skills = useLoad(async () => (await supabase.from('skill_levels').select('*').order('sort')).data || [], [])
  const [mode, setMode] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [bal, setBal] = useState('')
  const [why, setWhy] = useState('')
  const [q, setQ] = useState('')
  const [mkDay, setMkDay] = useState(todayISO())
  const [mkKind, setMkKind] = useState<'makeup' | 'transfer' | 'credit'>('makeup')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelWhy, setCancelWhy] = useState('')
  const [taskText, setTaskText] = useState('Перезвонить')
  const [taskDay, setTaskDay] = useState(todayISO())
  const [trialDay, setTrialDay] = useState(addDays(1))
  const [subEnd, setSubEnd] = useState('')
  const [frUntil, setFrUntil] = useState('')
  const [frWhy, setFrWhy] = useState('по заявлению')
  const [ed, setEd] = useState<{ full_name: string; birth_date: string; parent_name: string; phone: string; phone2: string } | null>(null)
  const sessions = useLoad(() => (mode === 'makeup' ? rpc<any[]>('sessions_on', { p_date: mkDay }) : Promise.resolve([])), [mode, mkDay])
  const allGroups = useLoad(async (): Promise<any[]> => (mode === 'move' || mode === 'add_group' ? (await supabase.from('groups').select('id,title,start_time,capacity,branches(name)').eq('active', true).order('start_time')).data || [] : []), [mode])
  const self = whoami.data?.[0]
  const office = !!self && self.role !== 'coach'

  async function setDays(group: string, days: number[] | null) {
    try { await rpc('set_enrollment_days', { p_child: id, p_group: group, p_days: days }); toast(days ? 'Дни сохранены' : 'Ходит во все дни группы'); reload() } catch (e: any) { toast(e.message) }
  }
  async function act(action: string, args: any = {}, msg = 'Сохранено') {
    try { await rpc('child_action', { p_child: id, p_action: action, p_args: args }); toast(msg); setMode(null); reload() }
    catch (e: any) { toast(e.message) }
  }
  async function call(fn: string, args: any, msg: string) {
    try { await rpc(fn, args); toast(msg); setMode(null); reload() } catch (e: any) { toast(e.message) }
  }
  if (!data) return <Sheet side onClose={onClose}>{error ? <Err e={error} /> : <Loading />}<button className="btn ghost" onClick={onClose}>Закрыть</button></Sheet>
  const c = data.child, f = data.family
  const st = c.status === 'active' ? balanceState(c) : { t: { trial: 'Пробное', reserve: 'Резерв', left: 'Ушёл', lost: 'Не дошёл' }[c.status as string] || c.status, c: 'p-mut' }
  const gone = c.status === 'left' || c.status === 'lost'

  if (mode === 'pay' && self) return <PaySheet childId={id} me={self} plan={c.status === 'trial' ? 'trial' : undefined} onClose={(ok) => { setMode(null); if (ok) reload() }} />
  return (
    <Sheet side onClose={onClose}>
      <h2>{c.full_name}</h2>
      <div className="chips">
        <Pill c={st.c}>{st.t}</Pill>
        {c.plan_kind === 'annual' && c.annual_until && <Pill c="p-acc">Годовой до {dm(c.annual_until)}</Pill>}
        {c.plan_kind === 'count' && c.sub_end && <Pill c="p-mut">Абонемент до {dm(c.sub_end)}</Pill>}
        {c.frozen_until && c.frozen_until > todayISO() && <Pill c="p-warn">Заморожен до {dm(c.frozen_until)}</Pill>}
        <Pill c={c.cert_until && c.cert_until >= todayISO() ? 'p-ok' : 'p-bad'}>{c.cert_until ? `Справка до ${dm(c.cert_until)}` : 'Нет справки'}</Pill>
        {c.birth_date && <Pill c="p-mut">ДР {dm(c.birth_date)}.{c.birth_date.slice(0, 4)}</Pill>}
      </div>
      <div><span className="lbl">Группы</span>
        {data.groups.length === 0 && <div className="meta">Нет групп</div>}
        {data.groups.map((g: any) => <div key={g.group_id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="grow">{g.title}{g.primary ? ' · основная' : ''}{g.status === 'reserve' ? ' · резерв' : ''}
            {office && g.weekdays?.length > 1 && <span className="chips" style={{ marginTop: 4 }}>
              <button className="chip" aria-pressed={!g.days} onClick={() => setDays(g.group_id, null)}>Все дни</button>
              {g.weekdays.map((d: number) => <button key={d} className="chip" aria-pressed={!!g.days && g.days.length === 1 && g.days[0] === d} onClick={() => setDays(g.group_id, [d])}>только {WD[d - 1]}</button>)}
            </span>}
            {!office && g.days && <span className="meta"> · ходит {g.days.map((d: number) => WD[d - 1]).join('/')}</span>}</span>
          {office && !g.primary && <button className="btn sm ghost" onClick={() => act('remove_group', { group_id: g.group_id }, 'Группа убрана')}>Убрать</button>}
        </div>)}
      </div>
      <div><span className="lbl">Семья</span><div className="name">{f.parent_name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="phone" style={{ userSelect: 'text' }}>{phonePretty(f.phone)}{f.phone2 ? `, ${phonePretty(f.phone2)}` : ''}</span>
          <button className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(f.phone).then(() => toast('Телефон скопирован'), () => toast(f.phone)) }}>Скопировать</button>
          <a className="btn sm ghost" href={`tel:${f.phone.replace(/[^\d+]/g, '')}`}>Позвонить</a>
        </div>
        {data.siblings.length > 0 && <div className="meta">Дети в семье: {data.siblings.map((s: any) => s.full_name).join(', ')}</div>}
      </div>
      <div><span className="lbl">Особенности</span>
        {mode === 'notes' ? <>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Боится нырять, аллергия…" />
          <div className="acts" style={{ marginTop: 6 }}><button className="btn sm" onClick={() => call('update_child_notes', { p_child: id, p_notes: notes }, 'Сохранено')}>Сохранить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </> : <div style={{ display: 'flex', gap: 8 }}><span className="grow" style={c.notes ? { color: 'var(--warn)', fontWeight: 600 } : {}}>{c.notes || 'Ничего не указано'}</span><button className="btn sm ghost" onClick={() => { setNotes(c.notes || ''); setMode('notes') }}>Изменить</button></div>}
      </div>
      <div><span className="lbl">Медицинская справка</span>
        {(() => { const ok = c.cert_until && c.cert_until >= todayISO(); const soon = ok && c.cert_until <= addDays(14)
          return <div className={ok ? (soon ? 'warnbox' : 'okbox') : 'errbox'}>{ok ? (soon ? `Справка заканчивается ${dm(c.cert_until)} — напомните родителям принести новую` : `Справка есть, действует до ${dm(c.cert_until)}.${c.cert_until.slice(0, 4)}`) : c.cert_until ? `Справка просрочена с ${dm(c.cert_until)}. Ребёнок занимается без справки — напомните родителям` : 'Справки нет. Ребёнок занимается без справки — напомните родителям'}</div> })()}
        {mode === 'certset' ? <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12, marginTop: 6 }}>
          <span className="lbl">Справка принесена. Действует:</span>
          <div className="chips">{[[90, '3 месяца'], [180, '6 месяцев'], [365, '1 год']].map(([d, l]) => <button key={d} className="chip" onClick={() => call('set_certificate', { p_child: id, p_until: addDays(d as number) }, 'Справка отмечена')}>{l as string}</button>)}</div>
          <label htmlFor="cu">или до даты (как написано в справке)</label>
          <input id="cu" type="date" min={todayISO()} value={subEnd} onChange={(e) => setSubEnd(e.target.value)} />
          <div className="acts"><button className="btn sm" disabled={!subEnd} onClick={() => call('set_certificate', { p_child: id, p_until: subEnd }, 'Справка отмечена')}>Сохранить дату</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </div> : <div className="acts" style={{ marginTop: 6 }}>
          <button className="btn sm okb" onClick={() => { setSubEnd(''); setMode('certset') }}>Принёс справку</button>
          {c.cert_until && <button className="btn sm ghost" onClick={() => call('set_certificate', { p_child: id, p_until: null }, 'Отмечено: справки нет')}>Справки нет</button>}
        </div>}
      </div>
      {skills.data && skills.data.length > 0 && <div><span className="lbl">Навыки · {data.skills.length} из {skills.data.length}</span>
        <div className="skills">{skills.data.map((s: any) => (
          <button key={s.id} className="skill" aria-pressed={data.skills.includes(s.id)} onClick={async () => { try { await rpc('toggle_skill', { p_child: id, p_skill: s.id }); reload() } catch (e: any) { toast(e.message) } }}>
            <span className="box">{data.skills.includes(s.id) ? '✓' : ''}</span>{s.name}</button>))}</div></div>}
      <div><span className="lbl">{office ? 'Оплаты' : 'Оплаты, принятые вами'}</span>
        <div className="hist">{data.payments.length ? data.payments.map((p: any) => <div key={p.id}>
          <span>{dm(p.paid_at.slice(0, 10))} · {p.plan_type === 'count' ? `${p.lessons} зан.` : PLAN[p.plan_type] || p.plan_type}{p.cancelled ? ' · отменена' : ''}</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span style={p.cancelled ? { textDecoration: 'line-through' } : {}}>{money(p.amount)} · {p.method === 'cash' ? 'касса' : 'EPOS'}</span>
            {office && !p.cancelled && <button className="btn sm ghost" style={{ padding: '3px 8px' }} onClick={() => { setCancelId(p.id); setCancelWhy('') }}>Отменить</button>}
          </span></div>) : <span className="meta">Нет</span>}</div>
        {cancelId && <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12, marginTop: 8 }}>
          <label htmlFor="cw">Причина отмены оплаты</label>
          <input id="cw" value={cancelWhy} onChange={(e) => setCancelWhy(e.target.value)} placeholder="ошибка, внесли не тому, возврат…" />
          <p className="note">Занятия, которые дала эта оплата, снимутся с остатка. Если это EPOS — оплата вернётся во «Входящие».</p>
          <div className="acts"><button className="btn sm bad" onClick={async () => { if (!cancelWhy.trim()) return toast('Укажите причину'); await call('cancel_payment', { p_payment: cancelId, p_reason: cancelWhy }, 'Оплата отменена'); setCancelId(null) }}>Отменить оплату</button>
            <button className="btn sm ghost" onClick={() => setCancelId(null)}>Не отменять</button></div>
        </div>}
      </div>
      {(data.makeups?.length > 0 || c.makeup_credits > 0) && <div><span className="lbl">Отработки{c.makeup_credits > 0 ? ` · бесплатных доступно: ${c.makeup_credits}` : ''}</span>
        <div className="hist">{(data.makeups || []).map((m: any) => <div key={m.session_id}>
          <span>{dm(m.date)} {hm(m.time)} · {m.group}{m.kind === 'credit' ? ' · бесплатная' : m.kind === 'transfer' ? ' · перенос' : ''}</span>
          {office && <button className="btn sm ghost" style={{ padding: '3px 8px' }} onClick={() => call('cancel_makeup', { p_session: m.session_id, p_child: id }, 'Запись отменена')}>Отменить</button>}
        </div>)}{(data.makeups || []).length === 0 && <span className="meta">Пока никуда не записан. «Отработка / перенос» → «Бесплатная».</span>}</div></div>}
      {data.absences?.length > 0 && <div><span className="lbl">Пропуски за 3 месяца</span>
        <div className="hist">{data.absences.map((a: any) => <div key={a.id}>
          <span>{dm(a.date)} · {a.group}{a.reason === 'sick' ? ' · болел' : ''}</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {a.status === 'refund' || a.status === 'recalc' ? <span className="meta">возвращено</span>
              : a.status === 'credit' ? <span className="meta">в отработку</span>
              : !a.charged ? <span className="meta">не списано</span>
              : office ? <>
                <button className="btn sm ghost" style={{ padding: '3px 8px' }} onClick={() => call('compensate_absence', { p_attendance: a.id, p_mode: 'refund' }, 'Занятие возвращено на остаток')}>Вернуть</button>
                <button className="btn sm ghost" style={{ padding: '3px 8px' }} onClick={() => call('compensate_absence', { p_attendance: a.id, p_mode: 'credit' }, 'Начислена бесплатная отработка')}>В отработку</button>
              </> : <span className="meta">списано</span>}
          </span></div>)}</div>
        {office && <p className="note">Принесли справку — «Вернуть» (+1 занятие на остаток) или «В отработку» (бесплатное занятие в любой группе).</p>}
      </div>}
      {data.tasks.length > 0 && <div className="warnbox">{data.tasks.map((t: any) => <div key={t.id}>{dm(t.due)} · {t.text}</div>)}</div>}

      {!gone && <button className="btn" onClick={() => setMode('pay')}>Внести оплату</button>}
      {office && <>
        <div className="acts">
          {c.status === 'trial' && <>
            <button className="btn sm" onClick={() => setMode('retrial')}>Перенести пробное</button>
            <button className="btn sm" onClick={() => act('to_group', {}, 'Переведён в группу')}>В группу</button>
          </>}
          {c.status === 'reserve' && <button className="btn sm" onClick={() => act('to_group', {}, 'Переведён в группу')}>Из резерва в группу</button>}
          {c.status === 'active' && <button className="btn sm ghost" onClick={() => act('to_reserve', {}, 'Переведён в резерв')}>В резерв</button>}
          {!gone && <>
            <button className="btn sm ghost" onClick={() => { setBal(String(c.lessons_left)); setWhy(''); setMode('balance') }}>Исправить остаток</button>
            {c.plan_kind === 'count' && <button className="btn sm ghost" onClick={() => { setSubEnd(c.sub_end || todayISO()); setMode('sub_end') }}>Срок абонемента</button>}
            {c.frozen_until && c.frozen_until > todayISO() ? <button className="btn sm ghost" onClick={() => act('unfreeze', {}, 'Заморозка снята')}>Снять заморозку</button>
              : <button className="btn sm ghost" onClick={() => { setFrUntil(addDays(14)); setMode('freeze') }}>Заморозить</button>}
            <button className="btn sm ghost" onClick={() => { setMkDay(todayISO()); setMkKind(c.makeup_credits > 0 ? 'credit' : 'makeup'); setMode('makeup') }}>Отработка / перенос</button>
            <button className="btn sm ghost" onClick={() => setMode('add_group')}>Добавить группу</button>
            <button className="btn sm ghost" onClick={() => setMode('move')}>Перевести</button>
          </>}
          <button className="btn sm ghost" onClick={() => { setTaskText('Перезвонить'); setTaskDay(todayISO()); setMode('task') }}>Напоминание</button>
          <button className="btn sm ghost" onClick={() => { setEd({ full_name: c.full_name, birth_date: c.birth_date || '', parent_name: f.parent_name || '', phone: f.phone || '', phone2: f.phone2 || '' }); setMode('edit') }}>Данные</button>
          {gone ? <button className="btn sm" onClick={() => act('return', {}, 'Вернули')}>Вернуть</button>
            : <button className="btn sm bad" onClick={() => setMode('leave')}>{c.status === 'trial' ? 'Не дошёл' : 'Ушёл'}</button>}
        </div>
        {mode === 'balance' && <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
          <label htmlFor="bal">Новый остаток занятий (сейчас {c.lessons_left})</label><input id="bal" inputMode="numeric" value={bal} onChange={(e) => setBal(e.target.value)} />
          <label htmlFor="why">Причина</label><input id="why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="сверка с тренером, перерасчёт…" />
          <p className="note">Срок абонемента не меняется. Чтобы продлить срок — «Срок абонемента».</p>
          <div className="acts"><button className="btn sm" onClick={() => { const v = parseInt(bal, 10); if (isNaN(v) || !why.trim()) return toast('Укажите число и причину'); act('set_balance', c.sub_end ? { lessons: v, reason: why } : { lessons: v, reason: why, sub_start: todayISO(), sub_end: addDays(30) }, 'Остаток изменён') }}>Сохранить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </div>}
        {mode === 'sub_end' && <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
          <label htmlFor="se">Абонемент действует до</label><input id="se" type="date" value={subEnd} onChange={(e) => setSubEnd(e.target.value)} />
          <div className="acts"><button className="btn sm" onClick={() => act('set_sub_end', { date: subEnd }, 'Срок изменён')}>Сохранить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </div>}
        {mode === 'freeze' && (() => {
          const days = frUntil ? Math.round((new Date(frUntil + 'T12:00:00').getTime() - new Date(todayISO() + 'T12:00:00').getTime()) / 864e5) : 0
          const go = () => { if (days < 1 || days > 90) return toast('Дата — от завтра до 3 месяцев вперёд'); if (!frWhy.trim()) return toast('Укажите причину'); act('freeze', { days, reason: frWhy.trim() }, `Заморожено до ${dm(frUntil)}`) }
          return <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
            <label htmlFor="fru">Заморозить до (ребёнок вернётся в этот день)</label>
            <input id="fru" type="date" value={frUntil} min={addDays(1)} max={addDays(90)} onChange={(e) => setFrUntil(e.target.value)} />
            <div className="chips">{[[7, 'неделя'], [14, '2 недели'], [30, 'месяц']].map(([d, l]) => <button key={d} className="chip" aria-pressed={frUntil === addDays(d as number)} onClick={() => setFrUntil(addDays(d as number))}>{l as string}</button>)}</div>
            <label htmlFor="frw">Причина</label>
            <input id="frw" value={frWhy} onChange={(e) => setFrWhy(e.target.value)} placeholder="Например: болеет, справка" />
            {days > 0 && <p className="note">{days} дн. без списаний. Остаток не меняется{c.plan_kind === 'count' && c.sub_end ? `, срок абонемента сдвинется до ${dm(addDays(days, c.sub_end))}` : ''}.</p>}
            <div className="acts"><button className="btn sm" onClick={go}>Заморозить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
          </div>
        })()}
        {mode === 'leave' && <><p className="sub">{c.status === 'trial' ? 'Почему не дошёл после пробного?' : 'Причина ухода'}</p>
          <div className="chips">{(c.status === 'trial' ? LOST : LEFT).map((r) => <button key={r} className="chip" onClick={() => act('leave', { reason: r }, 'Отмечено')}>{r}</button>)}</div></>}
        {mode === 'retrial' && <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
          <span className="lbl">Новая дата пробного</span><TrialDates group={c.group_id} value={trialDay} onChange={setTrialDay} />
          <div className="acts"><button className="btn sm" onClick={() => act('retrial', { date: trialDay }, 'Пробное перенесено')}>Сохранить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </div>}
        {mode === 'task' && <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
          <label htmlFor="tt">Что сделать</label><input id="tt" value={taskText} onChange={(e) => setTaskText(e.target.value)} />
          <label htmlFor="tdd">Когда напомнить</label><input id="tdd" type="date" value={taskDay} min={todayISO()} onChange={(e) => setTaskDay(e.target.value)} />
          <div className="acts"><button className="btn sm" onClick={() => act('task', { text: taskText, date: taskDay }, 'Напоминание создано')}>Сохранить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </div>}
        {mode === 'edit' && ed && <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
          <label htmlFor="en">Фамилия и имя ребёнка</label><input id="en" value={ed.full_name} onChange={(e) => setEd({ ...ed, full_name: e.target.value })} />
          <label htmlFor="eb">Дата рождения</label><input id="eb" type="date" value={ed.birth_date} onChange={(e) => setEd({ ...ed, birth_date: e.target.value })} />
          <label htmlFor="ep">Родитель</label><input id="ep" value={ed.parent_name} onChange={(e) => setEd({ ...ed, parent_name: e.target.value })} />
          <label htmlFor="eph">Телефон</label><input id="eph" inputMode="tel" value={ed.phone} onChange={(e) => setEd({ ...ed, phone: e.target.value })} />
          <label htmlFor="eph2">Второй телефон</label><input id="eph2" inputMode="tel" value={ed.phone2} onChange={(e) => setEd({ ...ed, phone2: e.target.value })} placeholder="необязательно" />
          {data.siblings.length > 0 && <p className="note">Родитель и телефоны общие для всей семьи: поменяются и у {data.siblings.map((s: any) => s.full_name).join(', ')}.</p>}
          <div className="acts"><button className="btn sm" onClick={() => {
            if (!phoneE164(ed.phone)) return toast('Телефон: +375 и 9 цифр')
            if (ed.phone2.trim() && ed.phone2.trim() !== '+375' && !phoneE164(ed.phone2)) return toast('Второй телефон: +375 и 9 цифр')
            act('edit', { full_name: ed.full_name, birth_date: ed.birth_date, parent_name: ed.parent_name, phone: ed.phone, phone2: ed.phone2.trim() === '+375' ? '' : ed.phone2 }, 'Данные сохранены')
          }}>Сохранить</button><button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button></div>
        </div>}
        {(mode === 'move' || mode === 'add_group') && <>
          <p className="sub">{mode === 'move' ? 'Куда перевести (основная группа меняется):' : 'Ещё одна группа — остаток занятий общий:'}</p>
          <input placeholder="Найти группу: филиал или время" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips">{(allGroups.data || []).filter((g: any) => `${g.branches?.name} ${g.title} ${hm(g.start_time)}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30).map((g: any) =>
            <button key={g.id} className="chip" onClick={() => act(mode, { group_id: g.id }, mode === 'move' ? 'Переведён' : 'Группа добавлена')}>{g.branches?.name} · {gname(g.title, g.start_time)}</button>)}</div>
        </>}
        {mode === 'makeup' && <div className="miss" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
          <div className="seg">
            <button className="chip" aria-pressed={mkKind === 'makeup'} onClick={() => setMkKind('makeup')}>Отработка</button>
            <button className="chip" aria-pressed={mkKind === 'transfer'} onClick={() => setMkKind('transfer')}>Перенос</button>
            <button className="chip" aria-pressed={mkKind === 'credit'} disabled={!(c.makeup_credits > 0)} onClick={() => setMkKind('credit')}>Бесплатная{c.makeup_credits > 0 ? ` (${c.makeup_credits})` : ''}</button>
          </div>
          <label htmlFor="md">Дата</label><input id="md" type="date" value={mkDay} min={todayISO()} onChange={(e) => setMkDay(e.target.value)} />
          <p className="note">Можно в любую группу и любой филиал. {mkKind === 'credit' ? 'Бесплатная — в счёт пропуска по справке, с остатка не спишется.' : 'Если ребёнок придёт — занятие спишется с остатка как обычное.'}</p>
          {!sessions.data ? <Loading /> : <div className="chips">
            {sessions.data.filter((s: any) => s.status === 'planned').length === 0 && <span className="meta">В этот день занятий нет</span>}
            {sessions.data.filter((s: any) => s.status === 'planned').map((s: any) =>
              <button key={s.session_id} className="chip" onClick={() => call('book_makeup', { p_session: s.session_id, p_child: id, p_kind: mkKind }, mkKind === 'transfer' ? 'Перенос записан' : 'Записан на отработку')}>{hm(s.start_time)} {s.branch} · {gshort(s.title)}</button>)}
          </div>}
          <button className="btn sm ghost" onClick={() => setMode(null)}>Отмена</button>
        </div>}
      </>}
      <div><span className="lbl">История</span><div className="hist">{data.history.map((h: any, i: number) => <div key={i}><span>{dm(h.at.slice(0, 10))}</span><span>{h.text}</span></div>)}</div></div>
      <button className="btn ghost" onClick={onClose}>Закрыть</button>
    </Sheet>
  )
}
