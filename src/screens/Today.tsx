import { useState } from 'react'
import { rpc, supabase, dateRu, todayISO, hm, dm, phonePretty, balanceState, gshort, gname, type Me } from '../lib'

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
import { useLoad, Loading, Err, Pill, Sheet, toast } from '../ui'
import PaySheet from './PaySheet'
import ChildCard from './ChildCard'

type Sess = { session_id: string; branch: string; title: string; start_time: string; coach_name: string; substitute_name: string | null;
  status: string; cancel_reason: string | null; capacity: number; expected: number; marked: number; trials: number; can_mark: boolean; ended: boolean; coach_id: string; substitute_id: string | null }

export default function Today({ me }: { me: Me }) {
  const [day, setDay] = useState(todayISO())
  const [open, setOpen] = useState<{ id: string; day: string } | null>(null)
  const [dayOff, setDayOff] = useState(false)
  const { data, error, reload } = useLoad(() => rpc<Sess[]>('sessions_on', { p_date: day }), [day])
  const office = me.role !== 'coach'
  const inbox = useLoad(() => (office ? rpc<any>('office_inbox') : Promise.resolve(null)), [office])
  const yday = addDays(todayISO(), -1)
  const prev = useLoad(() => (office ? Promise.resolve([] as Sess[]) : rpc<Sess[]>('sessions_on', { p_date: yday })), [office])
  const prevOpen = (prev.data || []).filter((s) => s.status === 'planned' && s.can_mark && s.expected > 0 && s.marked === 0)

  if (open) return <Session id={open.id} day={open.day} me={me} onBack={() => { setOpen(null); reload(); inbox.reload(); prev.reload() }} />
  const late = (data || []).filter((s) => s.status === 'planned' && s.ended && s.expected > 0 && s.marked === 0)
  return (
    <div className={office ? 'split' : 'col'}>
      {office && <section className="col"><Inbox data={inbox.data} reload={() => { inbox.reload(); reload() }} onOpen={(id, d) => setOpen({ id, day: d })} />
        {inbox.data && !inbox.data.sick?.length && !inbox.data.handovers?.length && !inbox.data.tasks?.length && !inbox.data.unmarked?.length && !inbox.data.incoming && !inbox.data.trials_open?.length && !inbox.data.debtors?.length && !inbox.data.ending?.length && <div className="okbox desk-only">Входящих дел нет</div>}</section>}
      <section className="col">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h2 className="grow" style={{ textTransform: 'capitalize' }}>{dateRu(day)}</h2>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 'auto' }} aria-label="Дата" />
      </div>
      {office && (data || []).some((s) => s.status === 'planned') && <div className="acts"><button className="btn sm ghost" onClick={() => setDayOff(true)}>Отменить весь день…</button></div>}
      {dayOff && data && <CancelDay day={day} sessions={data} onClose={(ok) => { setDayOff(false); if (ok) { reload(); inbox.reload() } }} />}
      {office && late.length > 0 && <div className="warnbox">Не отмечено после занятия: {late.length}</div>}
      {!office && day === todayISO() && prevOpen.length > 0 && <div className="warnbox">
        <b>Вчера не отмечены занятия.</b> Можно доделать сегодня, завтра уже только через администратора.
        <div className="list" style={{ marginTop: 8 }}>{prevOpen.map((s) => <button className="row" key={s.session_id} onClick={() => setOpen({ id: s.session_id, day: yday })}>
          <span className="time">{hm(s.start_time)}</span><span className="grow"><span className="name">{s.branch} · {gshort(s.title)}</span><br /><span className="meta">никто не отмечен</span></span><Pill c="p-warn">Отметить</Pill></button>)}</div>
      </div>}
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
                    : s.marked > 0 ? <Pill c="p-ok">Отмечено · {s.marked}</Pill> : <Pill c="p-acc">0/{s.expected}</Pill>}
                </button>
                {office && s.status === 'planned' && <SessionActions s={s} reload={reload} />}
                {office && s.status === 'cancelled' && <div className="acts"><button className="btn sm ghost" onClick={async () => {
                  try { await rpc('restore_session', { p_session: s.session_id }); toast('Занятие возвращено, срок абонементов вернули назад'); reload() } catch (e: any) { toast(e.message) } }}>Вернуть занятие</button></div>}
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
          <p className="sub">Занятие ни у кого не спишется, срок абонемента у детей группы продлится на неделю, родители получат сообщение.</p>
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

function Debts({ title, hint, items, tone, onCard }: { title: string; hint: string; items: any[] | undefined; tone: string; onCard: (id: string) => void }) {
  const [all, setAll] = useState(false)
  if (!items?.length) return null
  const list = all ? items : items.slice(0, 10)
  return (
    <>
      <h2>{title} · {items.length}</h2>
      <p className="sub">{hint}</p>
      <div className="list">{list.map((d: any) => (
        <button className="row" key={d.child_id} onClick={() => onCard(d.child_id)}>
          <span className="grow"><span className="name">{d.full_name}</span><br /><span className="meta">{d.group || '—'}</span><br /><span className="meta phone">{phonePretty(d.phone)}</span></span>
          <Pill c={tone}>{d.lessons_left < 0 ? `долг ${-d.lessons_left}` : `остаток ${d.lessons_left}`}</Pill>
        </button>))}
      </div>
      {items.length > 10 && <button className="btn sm ghost" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Показать всех (${items.length})`}</button>}
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
        <div className={`stat ${data.sick.length ? 'hot' : ''}`}><b>{data.sick.length}</b><small>пропусков разобрать</small></div>
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
      {data.sick.length > 0 && <Absences items={data.sick} reload={reload} onCard={setCard} />}
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
      {data.auto_posted?.length > 0 && <>
        <h2>Разнесено автоматически · {data.auto_posted.length}</h2>
        <p className="sub">Оплаты, которые пришли из Telegram и сами провелись, потому что плательщик уже известен. Если что-то не так — отмените, оплата вернётся в очередь EPOS.</p>
        <div className="list">{data.auto_posted.map((a: any) => (
          <div className="miss" key={a.payment_id}>
            <button className="kidname" onClick={() => setCard(a.child_id)}><span className="name">{a.full_name}</span><br /><span className="meta">{Number(a.amount)} BYN · {a.what} · {a.payer}</span></button>
            <button className="btn sm ghost" onClick={() => { if (window.confirm('Отменить эту оплату? Она вернётся в очередь EPOS.')) act('cancel_payment', { p_payment: a.payment_id, p_reason: 'автоматическое разнесение: неверно' }, 'Оплата отменена, она в очереди EPOS') }}>Отменить</button>
          </div>))}
        </div></>}
      {data.trials_open?.length > 0 && <>
        <h2>Пробные без отметки · {data.trials_open.length}</h2>
        <p className="sub">Пробное прошло, а результата нет. Отметьте — и родителю уйдёт сообщение, а вам придёт задача.</p>
        <div className="list">{data.trials_open.map((t: any) => (
          <div className="miss" key={t.id}>
            <button className="kidname" onClick={() => setCard(t.child_id)}><span className="name">{t.full_name}</span><br /><span className="meta">{dm(t.date)} · {t.group}</span><br /><span className="meta phone">{phonePretty(t.phone)}</span></button>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm okb" onClick={() => act('mark_trial', { p_trial: t.id, p_result: 'came' }, 'Отмечено: пришёл')}>Пришёл</button>
              <button className="btn sm ghost" onClick={() => act('mark_trial', { p_trial: t.id, p_result: 'noshow' }, 'Отмечено: не пришёл')}>Не пришёл</button>
            </span>
          </div>))}
        </div></>}
      <Debts title="Долг по занятиям" hint="Ребёнок отходил больше, чем оплачено. Если оплата уже была, но не внесена — проведите её в карточке." items={data.debtors} tone="p-bad" onCard={setCard} />
      <Debts title="Абонемент заканчивается" hint="Остался 0–1 урок, а ребёнок ходил последние три недели. Самое время напомнить об оплате." items={data.ending} tone="p-warn" onCard={setCard} />
      {(data.nodays > 0 || data.no_tg?.length > 0) && <>
        <h2>Порядок в данных</h2>
        <div className="list">
          {data.nodays > 0 && <div className="row"><span className="grow"><span className="name">Не указаны дни у {data.nodays} детей</span><br /><span className="meta">Дети → Группы → «Изменить» у группы → «Настроить дни». Без этого программа может поставить ложный пропуск.</span></span></div>}
          {data.no_tg?.length > 0 && <div className="row"><span className="grow"><span className="name">Telegram не подключён: {data.no_tg.length}</span><br /><span className="meta">{data.no_tg.join(', ')}. Им не приходят напоминания об отметках. Пусть нажмут «Telegram» вверху экрана.</span></span></div>}
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
  const [guest, setGuest] = useState(false)
  const [showNoSub, setShowNoSub] = useState(false)
  const s = sess.data
  const canMark = !!s?.can_mark
  const br = useLoad(async () => (await supabase.from('branches').select('name,auto_absent_from')).data || [], [])
  const autoFrom = (br.data || []).find((b: any) => b.name === s?.branch)?.auto_absent_from as string | undefined
  const auto = !!autoFrom && autoFrom <= day
  const coachAuto = auto && me.role === 'coach'
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
        else if (reason === 'makeup_cert' || reason === 'makeup_nocert') toast('Записано. Директору поставлена задача разобрать этот пропуск')
      }
      reload()
    } catch (e: any) { toast(e.message) }
    setBusy(false)
  }
  async function unguest(c: R) {
    try { await rpc('remove_guest', { p_session: id, p_child: c.child_id }); toast(`${c.full_name} убран из занятия, занятие возвращено`); reload() } catch (e: any) { toast(e.message) }
  }
  async function allHere() {
    try { const r: any = await rpc('mark_all_present', { p_session: id }); toast(r.unpaid.length ? `Отмечено ${r.marked}. Без оплаты: ${r.unpaid.join(', ')}` : `Отмечено ${r.marked}. Исправьте отсутствующих`); reload() }
    catch (e: any) { toast(e.message) }
  }
  const all = data || []
  // без абонемента (остаток ≤ 0) и ещё не отмечен — в списке не показываем
  const noSub = (c: R) => c.kind === 'group' && c.plan_kind === 'count' && c.lessons_left <= 0 && !c.mark
  const hidden = all.filter(noSub)
  const rows = showNoSub ? all : all.filter((c) => !noSub(c))
  const unmarked = rows.filter((c) => c.kind === 'group' && !c.mark && !noSub(c) && !(c.frozen_until && c.frozen_until > day)).length
  return (
    <div className="col narrow">
      <button className="back" onClick={onBack}>← Назад</button>
      {s && <div><h2>{s.branch} · {gshort(s.title)}</h2><p className="sub" style={{ textTransform: 'capitalize' }}>{dateRu(day)} · {hm(s.start_time)} · {s.substitute_name ? `замена: ${s.substitute_name}` : s.coach_name}</p></div>}
      {me.role !== 'coach' && canMark && <div className="warnbox">Вы правите отметки тренера. Каждое изменение попадёт в журнал</div>}
      {!canMark && s && <div className="note">{day > todayISO() ? 'Отмечать можно в день занятия.' : 'Тренер отмечает в день занятия или на следующий день. Позже исправляет администратор.'}</div>}
      <Err e={error} />
      {coachAuto && canMark && <div className="okbox">Отмечайте только тех, кто пришёл. Остальных программа сама передаст администратору: перенос или отработку решает она.</div>}
      {!coachAuto && canMark && s?.ended && unmarked > 0 && rows.some((c) => c.mark) && <div className="warnbox">Не отмечено: {unmarked}. Отметьте каждого — «был» или «не был», иначе пропуск не учтётся.{me.role === 'coach' && day < todayISO() ? ' Сегодня последний день, когда можно отметить.' : ''}</div>}
      {canMark && <button className="btn ghost" onClick={() => setGuest(true)}>+ Пришёл ребёнок не из этой группы (отработка)</button>}
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
                  <span className="name">{c.full_name}</span>{c.kind !== 'group' && <> <span className="meta">{c.kind === 'trial' ? '· пробное' : c.kind === 'guest' ? '· из другой группы' : '· отработка'}</span></>}<br />
                  <span className="meta phone">{phonePretty(c.phone)}</span>
                  {c.notes && <><br /><span className="meta" style={{ color: 'var(--warn)' }}>Важно: {c.notes}</span></>}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {bday && <Pill c="p-acc">День рождения</Pill>}
                  {c.kind !== 'trial' && (!c.cert_until || c.cert_until < day ? <Pill c="p-bad">Нет справки</Pill>
                    : c.cert_until >= '2090' ? null : c.cert_until <= addDays(day, 14) ? <Pill c="p-warn">Справка до {dm(c.cert_until)}</Pill> : null)}
                  <Pill c={st.c}>{st.t}</Pill>
                  {!frozen && <button className="btn sm ghost" onClick={() => setPay(c.child_id)}>+ Оплата</button>}
                </div>
                {canMark && !frozen && <>
                  <div className="marks">
                    <button className="mk m-p" aria-pressed={pressed === 'present'} onClick={() => c.kind === 'guest' && pressed === 'present' ? unguest(c) : mark(c, pressed === 'present' ? null : 'present')}>{c.kind === 'trial' ? 'Пришёл' : 'Был'}</button>
                    {!((coachAuto && c.kind === 'group') || c.kind === 'guest') && <button className="mk m-a" aria-pressed={pressed === 'absent'} onClick={() => c.kind === 'trial' ? mark(c, pressed === 'absent' ? null : 'noshow') : mark(c, pressed === 'absent' ? null : 'absent', 'none')}>{c.kind === 'trial' ? 'Не пришёл' : 'Пропуск'}</button>}
                  </div>
                  {c.kind !== 'trial' && pressed === 'absent' && !(coachAuto && c.kind === 'group') && (
                    <div className="reasons">
                      {([['none', 'Без причины'], ['makeup_cert', 'Отработка по справке (перенос на след. месяц)'], ['makeup_nocert', 'Отработка без справки (доп. день)']] as const).map(([v, l]) => (
                        <button key={v} className="mk m-r" aria-pressed={c.absence_reason === v} onClick={() => mark(c, 'absent', v)}>{l}</button>
                      ))}
                    </div>
                  )}
                </>}
              </div>
            )
          })}
          {rows.length === 0 && <div className="row meta">{hidden.length ? 'Все дети группы без абонемента' : 'В группе пока никого'}</div>}
        </div>
      )}
      {hidden.length > 0 && <>
        <button className="btn sm ghost" onClick={() => setShowNoSub(!showNoSub)}>{showNoSub ? 'Скрыть детей без абонемента' : `Без абонемента: ${hidden.length} — показать`}</button>
        {!showNoSub && <p className="note">Эти дети не в списке. Если кто-то из них пришёл — нажмите «показать» и отметьте «Был». Тех, кого не отметили, программа в пропуски не запишет.</p>}
      </>}
      {canMark && rows.length > 6 && <button className="btn ghost" onClick={() => setGuest(true)}>+ Пришёл ребёнок не из этой группы (отработка)</button>}
      {guest && <GuestSheet session={id} onClose={(ok) => { setGuest(false); if (ok) reload() }} />}
      {auto ? <p className="note">«Был» списывает занятие. Кого не отметили — через день программа поставит «не был» и передаст администратору: она решит, перенос по справке или отработка в другой день. Бесплатная отработка не списывается.</p> :
      <p className="note">«Был» и «Пропуск» списывают занятие. «Болеет — будет справка» тоже списывает, но попадает администратору: когда принесут справку, он вернёт занятие или даст бесплатную отработку. Бесплатная отработка не списывается.</p>}
      {pay && <PaySheet childId={pay} me={me} plan={rows.find((r) => r.child_id === pay)?.kind === 'trial' ? 'trial' : undefined} onClose={(ok) => { setPay(null); if (ok) reload() }} />}
      {card && <ChildCard id={card} onClose={() => { setCard(null); reload() }} />}
    </div>
  )
}


/** Ребёнок из другой группы этого филиала пришёл на занятие — отметить «был» */
function GuestSheet({ session, onClose }: { session: string; onClose: (ok: boolean) => void }) {
  const [q, setQ] = useState('')
  const { data, error } = useLoad(() => rpc<{ child_id: string; full_name: string; groups: string | null; lessons_left: number; plan_kind: string; makeup_credits: number; other_branch: boolean }[]>('guest_candidates', { p_session: session, p_q: q }), [q])
  const [busy, setBusy] = useState<string | null>(null)
  async function add(cid: string, name: string) {
    setBusy(cid)
    try { const r: any = await rpc('add_guest', { p_session: session, p_child: cid }); toast(r?.debt ? `${name}: отмечен, занятие в долг` : `${name}: отмечен «был»`); onClose(true) }
    catch (e: any) { toast(e.message); setBusy(null) }
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <h2>Пришёл ребёнок не из этой группы</h2>
      <p className="sub">Сначала показаны дети этого филиала. Ребёнка с другого филиала найдите по фамилии (от 3 букв). Если у ребёнка есть бесплатная отработка — занятие не спишется, иначе спишется с абонемента как обычное.</p>
      <input autoFocus placeholder="Фамилия или имя" value={q} onChange={(e) => setQ(e.target.value)} />
      <Err e={error} />
      {!data ? <Loading /> : <div className="list">
        {data.length === 0 && <div className="row meta">Никого не нашли</div>}
        {data.map((k) => <button className="row" key={k.child_id} disabled={!!busy} onClick={() => add(k.child_id, k.full_name)}>
          <span className="grow"><span className="name">{k.full_name}</span><br /><span className="meta">{k.groups || 'без группы'}</span></span>
          {k.makeup_credits > 0 && <Pill c="p-acc">отработка · бесплатно</Pill>}
          <Pill c={k.lessons_left > 0 ? 'p-ok' : 'p-bad'}>{k.lessons_left > 0 ? `ост. ${k.lessons_left}` : k.lessons_left < 0 ? `долг ${-k.lessons_left}` : '0'}</Pill>
        </button>)}
      </div>}
      <button className="btn ghost" onClick={() => onClose(false)}>Отмена</button>
    </Sheet>
  )
}

const REASONS = ['Праздник', 'Санитарный день', 'Бассейн закрыт', 'Соревнования', 'Болезнь тренера']

/** Отменить все занятия дня — на одном филиале или на всех */
function CancelDay({ day, sessions, onClose }: { day: string; sessions: Sess[]; onClose: (ok: boolean) => void }) {
  const planned = sessions.filter((s) => s.status === 'planned')
  const branches = [...new Set(planned.map((s) => s.branch))]
  const [br, setBr] = useState<string>('all')
  const [why, setWhy] = useState('Праздник')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const list = planned.filter((s) => br === 'all' || s.branch === br)
  const n = list.filter((s) => !s.marked).length
  async function go() {
    if (!why.trim()) return setErr('Укажите причину')
    setBusy(true); setErr(null)
    try {
      let bid: string | null = null
      if (br !== 'all') bid = ((await supabase.from('branches').select('id').eq('name', br).limit(1)).data || [])[0]?.id ?? null
      const r = await rpc<{ cancelled: number; skipped: string[] }>('cancel_day', { p_date: day, p_branch: bid, p_reason: why.trim() })
      toast(`Отменено занятий: ${r.cancelled}` + (r.skipped.length ? `. Не отменены (есть отметки): ${r.skipped.join(', ')}` : ''))
      onClose(true)
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <h2>Отменить занятия {dm(day)}</h2>
      <p className="sub">Ни у кого не спишется, срок абонемента у детей продлится на неделю, родители получат сообщение. Занятия, где уже есть отметки, не отменятся.</p>
      <div><span className="lbl">Где</span><div className="chips">
        <button className="chip" aria-pressed={br === 'all'} onClick={() => setBr('all')}>Все филиалы</button>
        {branches.map((b) => <button key={b} className="chip" aria-pressed={br === b} onClick={() => setBr(b)}>{b}</button>)}</div></div>
      <div><span className="lbl">Причина</span><div className="chips">
        {REASONS.map((r) => <button key={r} className="chip" aria-pressed={why === r} onClick={() => setWhy(r)}>{r}</button>)}</div>
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Или своя причина" aria-label="Причина" style={{ marginTop: 8 }} /></div>
      <div className="list">{list.map((s) => <div className="row" key={s.session_id}><span className="time">{hm(s.start_time)}</span><span className="grow">{s.branch} · {gshort(s.title)}<br /><span className="meta">{s.coach_name}{s.marked ? ` · уже отмечено ${s.marked} — не отменится` : ''}</span></span></div>)}</div>
      <Err e={err} />
      <button className="btn bad" disabled={busy || !n} onClick={go}>{busy ? 'Отменяем…' : `Отменить ${n} ${n === 1 ? 'занятие' : n < 5 ? 'занятия' : 'занятий'}`}</button>
      <button className="btn ghost" onClick={() => onClose(false)}>Не отменять</button>
    </Sheet>
  )
}

/** Пропуски на разбор: фильтр по филиалу, группировка по занятию, решения пачкой */
function Absences({ items, reload, onCard }: { items: any[]; reload: () => void; onCard: (id: string) => void }) {
  const [br, setBr] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)
  const counts = new Map<string, number>()
  items.forEach((s) => counts.set(s.branch, (counts.get(s.branch) || 0) + 1))
  const list = items.filter((s) => br === 'all' || s.branch === br)
  const groups = new Map<string, any[]>()
  list.forEach((s) => { const k = s.session_id || s.date + s.group; groups.set(k, [...(groups.get(k) || []), s]) })
  async function bulk(ids: string[], mode: string, msg: string, key: string) {
    setBusy(key)
    try {
      const r = await rpc<{ ok: number; errors: string[] }>('compensate_absence_bulk', { p_ids: ids, p_mode: mode })
      toast(`${msg}: ${r.ok}` + (r.errors.length ? `. Не получилось: ${r.errors.join('; ')}` : ''))
      reload()
    } catch (e: any) { toast(e.message) } finally { setBusy(null) }
  }
  const one = (id: string, mode: string, msg: string) => bulk([id], mode, msg, id)
  return <>
    <h2>Пропуски · разобрать {items.length}</h2>
    <p className="sub">Ребёнок не пришёл, занятие списано. Справка — перенос на следующий месяц (не сгорит); без справки — отработка в другой день. Ходит раз в неделю — «Не ходит в этот день», и дни запомнятся.</p>
    {counts.size > 1 && <div className="chips">
      <button className="chip" aria-pressed={br === 'all'} onClick={() => setBr('all')}>Все · {items.length}</button>
      {[...counts.entries()].sort((x, y) => y[1] - x[1]).map(([b, n]) => <button key={b} className="chip" aria-pressed={br === b} onClick={() => setBr(b)}>{b} · {n}</button>)}
    </div>}
    {[...groups.entries()].map(([k, arr]) => {
      const ids = arr.map((s) => s.attendance_id)
      return <div className="list" key={k}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="grow"><span className="name">{dm(arr[0].date)} · {arr[0].group}</span><br /><span className="meta">не пришли: {arr.length}</span></span>
          {arr.length > 1 && <div className="acts" style={{ width: '100%' }}>
            {!arr[0].one_day && <button className="btn sm ghost" disabled={busy === k} onClick={() => bulk(ids, 'notday', 'Сняты пропуски, дни запомнены', k)}>Всем: не ходят в этот день</button>}
            <button className="btn sm ghost" disabled={busy === k} onClick={() => bulk(ids, 'kept', 'Оставлено списанным', k)}>Всем: без возврата</button>
          </div>}
        </div>
        {arr.map((s) => <div className="miss" key={s.attendance_id}>
          <button className="kidname" onClick={() => onCard(s.child_id)}><span className="name">{s.full_name}</span><br /><span className="meta">{s.phone ? phonePretty(s.phone) : ''}{s.auto ? '' : ' · отметил тренер'}</span></button>
          <div className="acts">
            <button className="btn sm okb" disabled={busy === s.attendance_id} onClick={() => one(s.attendance_id, 'transfer', 'Перенесено на следующий месяц')}>Справка → перенос</button>
            <button className="btn sm okb" disabled={busy === s.attendance_id} onClick={() => one(s.attendance_id, 'credit', 'Отработка начислена')}>Отработка</button>
            {!s.one_day && <button className="btn sm ghost" disabled={busy === s.attendance_id} onClick={() => one(s.attendance_id, 'notday', 'Пропуск снят, дни исправлены')}>Не ходит в этот день</button>}
            <button className="btn sm ghost" disabled={busy === s.attendance_id} onClick={() => one(s.attendance_id, 'kept', 'Оставлено списанным')}>Без возврата</button>
          </div>
        </div>)}
      </div>
    })}
  </>
}
