import { useState } from 'react'
import { rpc, dateRu, todayISO, hm, dm, phonePretty, balanceState, gshort, gname, type Me } from '../lib'

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
import { useLoad, Loading, Err, Pill, Sheet, toast } from '../ui'
import PaySheet from './PaySheet'
import ChildCard from './ChildCard'

type Sess = { session_id: string; branch: string; title: string; start_time: string; coach_name: string; substitute_name: string | null;
  status: string; cancel_reason: string | null; capacity: number; expected: number; marked: number; trials: number; can_mark: boolean; ended: boolean; coach_id: string; substitute_id: string | null }

export default function Today({ me }: { me: Me }) {
  const [day, setDay] = useState(todayISO())
  const [open, setOpen] = useState<{ id: string; day: string } | null>(null)
  const { data, error, reload } = useLoad(() => rpc<Sess[]>('sessions_on', { p_date: day }), [day])
  const office = me.role !== 'coach'
  const inbox = useLoad(() => (office ? rpc<any>('office_inbox') : Promise.resolve(null)), [office])

  if (open) return <Session id={open.id} day={open.day} me={me} onBack={() => { setOpen(null); reload(); inbox.reload() }} />
  const late = (data || []).filter((s) => s.status === 'planned' && s.ended && s.marked < s.expected)
  return (
    <div className={office ? 'split' : 'col'}>
      {office && <section className="col"><Inbox data={inbox.data} reload={() => { inbox.reload(); reload() }} onOpen={(id, d) => setOpen({ id, day: d })} />
        {inbox.data && !inbox.data.sick?.length && !inbox.data.handovers?.length && !inbox.data.tasks?.length && !inbox.data.unmarked?.length && !inbox.data.incoming && <div className="okbox desk-only">Входящих дел нет</div>}</section>}
      <section className="col">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h2 className="grow" style={{ textTransform: 'capitalize' }}>{dateRu(day)}</h2>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 'auto' }} aria-label="Дата" />
      </div>
      {office && late.length > 0 && <div className="warnbox">Не отмечено после занятия: {late.length}</div>}
      <Err e={error} />
      {!data ? <Loading /> : (
        <div className="list">
          {data.length === 0 && <div className="row meta">В этот день занятий нет</div>}
          {data.map((s) => {
            const isLate = late.includes(s)
            return (
              <div className="miss" key={s.session_id}>
                <button className="row" style={{ padding: 0 }} onClick={() => s.status === 'planned' && setOpen({ id: s.session_id, day })}>
                  <span className="time">{hm(s.start_time)}</span>
                  <span className="grow"><span className="name">{s.branch} · {gshort(s.title)}</span><br />
                    <span className="meta">{s.substitute_name ? `${s.substitute_name} (замена за ${s.coach_name})` : s.coach_name || 'тренер не назначен'}
                      {s.status === 'cancelled' ? ` · отменено: ${s.cancel_reason}` : ` · ${s.expected} детей${s.trials ? ` · пробных ${s.trials}` : ''}`}</span></span>
                  {s.status === 'cancelled' ? <Pill c="p-mut">Отменено</Pill> : isLate ? <Pill c="p-bad">Не отмечено</Pill>
                    : s.marked >= s.expected && s.expected > 0 ? <Pill c="p-ok">Отмечено</Pill> : <Pill c="p-acc">{s.marked}/{s.expected}</Pill>}
                </button>
                {office && s.status === 'planned' && <SessionActions s={s} reload={reload} />}
              </div>
            )
          })}
        </div>
      )}
      </section>
    </div>
  )
}

function SessionActions({ s, reload }: { s: Sess; reload: () => void }) {
  const [mode, setMode] = useState<null | 'sub' | 'cancel'>(null)
  const staff = useLoad(() => (mode === 'sub' ? rpc<any[]>('staff_directory') : Promise.resolve([])), [mode])
  async function act(fn: string, args: any, msg: string) {
    try { await rpc(fn, args); toast(msg); setMode(null); reload() } catch (e: any) { toast(e.message) }
  }
  return (
    <>
      <div className="acts">
        <button className="btn sm ghost" onClick={() => setMode('sub')}>Замена тренера</button>
        <button className="btn sm ghost" onClick={() => setMode('cancel')}>Отменить занятие</button>
      </div>
      {mode === 'sub' && (
        <Sheet onClose={() => setMode(null)}>
          <h2>Кто проведёт занятие?</h2>
          <p className="sub">{s.branch} · {gname(s.title, s.start_time)}. Зарплату за занятие получит тот, кто проведёт.</p>
          <div className="chips">
            {(staff.data || []).filter((x: any) => x.role === 'coach' && x.id !== s.coach_id).map((x: any) => (
              <button key={x.id} className="chip" onClick={() => act('set_substitute', { p_session: s.session_id, p_coach: x.id }, `Замена: ${x.full_name}`)}>{x.full_name}</button>
            ))}
          </div>
          {s.substitute_id && <button className="btn ghost" onClick={() => act('set_substitute', { p_session: s.session_id, p_coach: null }, 'Замена снята')}>Убрать замену</button>}
          <button className="btn ghost" onClick={() => setMode(null)}>Закрыть</button>
        </Sheet>
      )}
      {mode === 'cancel' && (
        <Sheet onClose={() => setMode(null)}>
          <h2>Причина отмены</h2>
          <p className="sub">Занятие ни у кого не спишется, родители получат сообщение.</p>
          <div className="chips">
            {['Санитарный день', 'Бассейн закрыт', 'Праздник', 'Соревнования', 'Болезнь тренера'].map((r) => (
              <button key={r} className="chip" onClick={() => act('cancel_session', { p_session: s.session_id, p_reason: r }, 'Занятие отменено')}>{r}</button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setMode(null)}>Закрыть</button>
        </Sheet>
      )}
    </>
  )
}

function Inbox({ data, reload, onOpen }: { data: any; reload: () => void; onOpen: (id: string, day: string) => void }) {
  const [card, setCard] = useState<string | null>(null)
  if (!data) return null
  async function act(fn: string, args: any, msg: string) {
    try { await rpc(fn, args); toast(msg); reload() } catch (e: any) { toast(e.message) }
  }
  return (
    <>
      <div className="stats">
        <div className={`stat ${data.incoming ? 'hot' : ''}`}><b>{data.incoming}</b><small>оплат EPOS разобрать</small></div>
        <div className={`stat ${data.handovers.length ? 'hot' : ''}`}><b>{data.handovers.length}</b><small>сдачи наличных</small></div>
        <div className={`stat ${data.sick.length ? 'hot' : ''}`}><b>{data.sick.length}</b><small>ждём справку</small></div>
        <div className={`stat ${data.tasks.length ? 'hot' : ''}`}><b>{data.tasks.length}</b><small>задач</small></div>
      </div>
      {data.unmarked?.length > 0 && <>
        <h2>Не отмечены занятия · {data.unmarked.length}</h2>
        <p className="sub">Без отметок тренеру не начислится зарплата за занятие. Откройте и отметьте.</p>
        <div className="list">{data.unmarked.map((u: any) => (
          <button className="row" key={u.session_id} onClick={() => onOpen(u.session_id, u.date)}>
            <span className="time">{dm(u.date)}</span>
            <span className="grow"><span className="name">{u.group}</span><br /><span className="meta">{u.coach || 'без тренера'}</span></span>
            <Pill c="p-bad">Отметить</Pill>
          </button>))}
        </div></>}
      {data.sick.length > 0 && <>
        <h2>Болеют · ждём справку</h2>
        <p className="sub">Занятие уже списано. Если принесли справку — верните занятие на остаток или дайте бесплатную отработку.</p>
        <div className="list">{data.sick.map((s: any) => (
          <div className="miss" key={s.attendance_id}>
            <button className="kidname" onClick={() => setCard(s.child_id)}><span className="name">{s.full_name}</span><br /><span className="meta">{dm(s.date)} · {s.group}</span></button>
            <div className="acts">
              <button className="btn sm okb" onClick={() => act('compensate_absence', { p_attendance: s.attendance_id, p_mode: 'refund' }, 'Занятие возвращено на остаток')}>Справка → вернуть занятие</button>
              <button className="btn sm okb" onClick={() => act('compensate_absence', { p_attendance: s.attendance_id, p_mode: 'credit' }, 'Начислена бесплатная отработка')}>Справка → в отработку</button>
              <button className="btn sm ghost" onClick={() => act('compensate_absence', { p_attendance: s.attendance_id, p_mode: 'kept' }, 'Оставлено списанным')}>Справки нет</button>
            </div>
          </div>))}
        </div></>}
      {data.handovers.length > 0 && <>
        <h2>Тренеры сдают наличные</h2>
        <div className="list">{data.handovers.map((h: any) => (
          <div className="row" key={h.id}><span className="grow"><span className="name">{h.coach}</span><br /><span className="meta">{Number(h.amount)} BYN</span></span>
            <button className="btn sm okb" onClick={() => act('confirm_handover', { p_id: h.id }, 'Получение подтверждено')}>Получила</button></div>))}
        </div></>}
      {data.tasks.length > 0 && <>
        <h2>Задачи · {data.tasks.length}</h2>
        <div className="list">{data.tasks.map((t: any) => (
          <div className="miss" key={t.id}>
            <button className="kidname" onClick={() => t.child_id && setCard(t.child_id)}><span className="name">{t.full_name || 'Задача'}</span><br /><span className="meta">{t.text}</span><br /><span className="meta phone">{phonePretty(t.phone)}</span></button>
            <button className="btn sm ghost" onClick={() => act('complete_task', { p_task: t.id }, 'Задача закрыта')}>Готово</button>
          </div>))}
        </div></>}
      {card && <ChildCard id={card} onClose={() => { setCard(null); reload() }} />}
    </>
  )
}

type R = { child_id: string; full_name: string; phone: string; notes: string | null; kind: string; trial_id: string | null; trial_paid: boolean | null; trial_result: string | null;
  plan_kind: string; lessons_left: number; sub_end: string | null; frozen_until: string | null; paid_month: string | null; cert_until: string | null; birth_date: string | null;
  mark: string | null; absence_reason: string | null; sick_status: string | null }

function Session({ id, day, me, onBack }: { id: string; day: string; me: Me; onBack: () => void }) {
  const sess = useLoad(() => rpc<Sess[]>('sessions_on', { p_date: day }).then((l) => l.find((x) => x.session_id === id) || null), [id, day])
  const { data, error, reload } = useLoad(() => rpc<R[]>('session_roster', { p_session: id }), [id])
  const [pay, setPay] = useState<string | null>(null)
  const [card, setCard] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const s = sess.data
  const canMark = !!s?.can_mark
  async function mark(c: R, m: string | null, reason?: string) {
    if (busy) return
    setBusy(true)
    try {
      if (c.kind === 'trial') await rpc('mark_trial', { p_trial: c.trial_id, p_result: m === 'present' ? 'came' : m })
      else {
        const r: any = await rpc('mark_attendance', { p_session: id, p_child: c.child_id, p_mark: m, p_reason: reason ?? null })
        if (m === 'present' && r?.debt) toast(`${c.full_name}: занятие в долг. Примите оплату`)
        else if (m === 'present' && r?.month_unpaid) toast(`${c.full_name}: месяц не оплачен`)
        else if (reason === 'sick') toast('Списано. Если будет справка — администратор возместит')
      }
      reload()
    } catch (e: any) { toast(e.message) }
    setBusy(false)
  }
  async function allHere() {
    try { const r: any = await rpc('mark_all_present', { p_session: id }); toast(r.unpaid.length ? `Отмечено ${r.marked}. Без оплаты: ${r.unpaid.join(', ')}` : `Отмечено ${r.marked}. Исправьте отсутствующих`); reload() }
    catch (e: any) { toast(e.message) }
  }
  const rows = data || []
  const unmarked = rows.filter((c) => c.kind === 'group' && !c.mark && !(c.frozen_until && c.frozen_until > day)).length
  return (
    <div className="col narrow">
      <button className="back" onClick={onBack}>← Назад</button>
      {s && <div><h2>{s.branch} · {gshort(s.title)}</h2><p className="sub" style={{ textTransform: 'capitalize' }}>{dateRu(day)} · {hm(s.start_time)} · {s.substitute_name ? `замена: ${s.substitute_name}` : s.coach_name}</p></div>}
      {me.role !== 'coach' && canMark && <div className="warnbox">Вы правите отметки тренера. Каждое изменение попадёт в журнал</div>}
      {!canMark && s && <div className="note">{day > todayISO() ? 'Отмечать можно в день занятия.' : 'Отмечать можно только в день занятия. Позже исправляет администратор.'}</div>}
      <Err e={error} />
      {canMark && unmarked > 0 && <button className="btn okb" onClick={allHere}>Все были ({unmarked}), потом исправить отсутствующих</button>}
      {!data ? <Loading /> : (
        <div className="list">
          {rows.map((c) => {
            const st = c.kind === 'trial'
              ? (c.trial_result === 'came' ? { t: c.trial_paid ? 'Был на пробном' : 'Был, не оплатил', c: c.trial_paid ? 'p-ok' : 'p-warn' } : c.trial_result === 'noshow' ? { t: 'Не пришёл', c: 'p-bad' } : { t: c.trial_paid ? 'Пробное оплачено' : 'Пробное', c: c.trial_paid ? 'p-acc' : 'p-warn' })
              : balanceState(c)
            const pressed = c.kind === 'trial' ? (c.trial_result === 'came' ? 'present' : c.trial_result === 'noshow' ? 'absent' : null) : c.mark
            const frozen = !!(c.frozen_until && c.frozen_until > day)
            const bday = c.birth_date && c.birth_date.slice(5) === day.slice(5)
            return (
              <div className={`kid${frozen ? ' frozen' : ''}`} key={c.child_id + c.kind}>
                <button className="kidname" onClick={() => setCard(c.child_id)}>
                  <span className="name">{c.full_name}</span>{c.kind !== 'group' && <> <span className="meta">{c.kind === 'trial' ? '· пробное' : '· отработка'}</span></>}<br />
                  <span className="meta phone">{phonePretty(c.phone)}</span>
                  {c.notes && <><br /><span className="meta" style={{ color: 'var(--warn)' }}>Важно: {c.notes}</span></>}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {bday && <Pill c="p-acc">День рождения</Pill>}
                  {c.kind !== 'trial' && (!c.cert_until || c.cert_until < day ? <Pill c="p-bad">Нет справки</Pill>
                    : c.cert_until <= addDays(day, 14) ? <Pill c="p-warn">Справка до {dm(c.cert_until)}</Pill> : null)}
                  <Pill c={st.c}>{st.t}</Pill>
                  {!frozen && <button className="btn sm ghost" onClick={() => setPay(c.child_id)}>+ Оплата</button>}
                </div>
                {canMark && !frozen && <>
                  <div className="marks">
                    <button className="mk m-p" aria-pressed={pressed === 'present'} onClick={() => mark(c, pressed === 'present' ? null : 'present')}>{c.kind === 'trial' ? 'Пришёл' : 'Был'}</button>
                    <button className="mk m-a" aria-pressed={pressed === 'absent'} onClick={() => c.kind === 'trial' ? mark(c, pressed === 'absent' ? null : 'noshow') : mark(c, pressed === 'absent' ? null : 'absent', 'none')}>{c.kind === 'trial' ? 'Не пришёл' : 'Пропуск'}</button>
                  </div>
                  {c.kind !== 'trial' && pressed === 'absent' && (
                    <div className="reasons">
                      {([['none', 'Без причины'], ['sick', 'Болеет — будет справка']] as const).map(([v, l]) => (
                        <button key={v} className="mk m-r" aria-pressed={c.absence_reason === v} onClick={() => mark(c, 'absent', v)}>{l}</button>
                      ))}
                    </div>
                  )}
                </>}
              </div>
            )
          })}
          {rows.length === 0 && <div className="row meta">В группе пока никого</div>}
        </div>
      )}
      <p className="note">«Был» и «Пропуск» списывают занятие. «Болеет — будет справка» тоже списывает, но попадает администратору: когда принесут справку, он вернёт занятие или даст бесплатную отработку. Бесплатная отработка не списывается.</p>
      {pay && <PaySheet childId={pay} me={me} plan={rows.find((r) => r.child_id === pay)?.kind === 'trial' ? 'trial' : undefined} onClose={(ok) => { setPay(null); if (ok) reload() }} />}
      {card && <ChildCard id={card} onClose={() => { setCard(null); reload() }} />}
    </div>
  )
}

