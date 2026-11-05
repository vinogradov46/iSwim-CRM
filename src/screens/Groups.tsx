import { useState } from 'react'
import { rpc, supabase, hm, type Me } from '../lib'
import { useLoad, Loading, Err, Sheet, Pill, toast } from '../ui'

type G = { id: string; branch_id: string; branch: string; title: string | null; pool: 'big' | 'small'; weekdays: number[]; start_time: string; duration_min: number
  capacity: number; coach_id: string | null; coach_name: string | null; active_kids: number; reserve_kids: number; active: boolean }
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const days = (w: number[]) => w.map((d) => DAYS[d - 1]).join('/')

/** Группы: вместимость, расписание, новые группы. Офис. */
export default function Groups({ me, onBack }: { me: Me; onBack: () => void }) {
  const { data, error, reload } = useLoad(() => rpc<G[]>('groups_overview'), [])
  const [edit, setEdit] = useState<G | 'new' | null>(null)
  const [branch, setBranch] = useState<string>('all')
  const list = (data || []).filter((g) => branch === 'all' || g.branch_id === branch)
  const branches = [...new Map((data || []).map((g) => [g.branch_id, g.branch])).entries()]
  return (
    <>
      <button className="back" onClick={onBack}>← Назад</button>
      <h2>Группы и расписание</h2>
      <button className="btn" onClick={() => setEdit('new')}>+ Новая группа</button>
      {branches.length > 1 && <div className="chips">
        <button className="chip" aria-pressed={branch === 'all'} onClick={() => setBranch('all')}>Все</button>
        {branches.map(([id, n]) => <button key={id} className="chip" aria-pressed={branch === id} onClick={() => setBranch(id)}>{n}</button>)}
      </div>}
      <Err e={error} />
      {!data ? <Loading /> : <div className="list">
        {list.length === 0 && <div className="row meta">Групп нет</div>}
        {list.map((g) => {
          const full = g.active_kids >= g.capacity
          return (
            <button className="row" key={g.id} onClick={() => setEdit(g)} style={g.active ? {} : { opacity: 0.55 }}>
              <span className="time">{hm(g.start_time)}</span>
              <span className="grow"><span className="name">{g.branch} · {g.title || days(g.weekdays)}</span><br />
                <span className="meta">{days(g.weekdays)} · {g.duration_min} мин · {g.pool === 'big' ? 'большая вода' : 'малая вода'} · {g.coach_name || 'без тренера'}</span>
                {g.reserve_kids > 0 && <><br /><span className="meta">В резерве: {g.reserve_kids}</span></>}</span>
              {!g.active ? <Pill c="p-mut">закрыта</Pill> : <Pill c={full ? 'p-bad' : 'p-ok'}>{g.active_kids}/{g.capacity}</Pill>}
            </button>)
        })}
      </div>}
      <p className="note">Если группа заполнена (красная), нового ребёнка туда не записать — только в резерв. Чтобы добавить места, откройте группу и увеличьте вместимость.</p>
      {edit && <EditGroup g={edit === 'new' ? null : edit} me={me} onClose={(ok) => { setEdit(null); if (ok) reload() }} />}
    </>
  )
}

function EditGroup({ g, me, onClose }: { g: G | null; me: Me; onClose: (ok: boolean) => void }) {
  const branches = useLoad(async () => (await supabase.from('branches').select('id,name').eq('active', true).order('sort')).data || [], [])
  const coaches = useLoad(() => rpc<any[]>('staff_directory'), [])
  const [branch, setBranch] = useState(g?.branch_id ?? '')
  const [title, setTitle] = useState(g?.title ?? '')
  const [pool, setPool] = useState<'big' | 'small'>(g?.pool ?? 'big')
  const [wd, setWd] = useState<number[]>(g?.weekdays ?? [])
  const [start, setStart] = useState(g ? hm(g.start_time) : '18:00')
  const [dur, setDur] = useState(String(g?.duration_min ?? 45))
  const [cap, setCap] = useState(String(g?.capacity ?? 12))
  const [coach, setCoach] = useState<string | null>(g?.coach_id ?? null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const director = me.role === 'director'
  async function save() {
    setBusy(true); setErr(null)
    try {
      await rpc('group_save', { p_id: g?.id ?? null, p_branch: branch || null, p_title: title, p_pool: pool, p_weekdays: wd, p_start: start,
        p_duration: parseInt(dur, 10) || null, p_capacity: parseInt(cap, 10) || null, p_coach: coach })
      toast(g ? 'Группа сохранена' : 'Группа создана, занятия на 2 недели вперёд добавлены'); onClose(true)
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  async function setActive(v: boolean) {
    setBusy(true); setErr(null)
    try { await rpc('group_set_active', { p_group: g!.id, p_active: v }); toast(v ? 'Группа открыта' : 'Группа закрыта'); onClose(true) } catch (e: any) { setErr(e.message); setBusy(false); setSure(false) }
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <h2>{g ? 'Группа' : 'Новая группа'}</h2>
      {g && <p className="sub">Сейчас занимаются {g.active_kids}{g.reserve_kids ? `, в резерве ${g.reserve_kids}` : ''}</p>}
      <div><span className="lbl">Филиал</span><div className="chips">{(branches.data || []).map((b: any) => <button key={b.id} className="chip" aria-pressed={branch === b.id} onClick={() => setBranch(b.id)}>{b.name}</button>)}</div></div>
      <div><label htmlFor="gt">Название (как в журнале)</label><input id="gt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="БВ Пн/Чт 18:30" /></div>
      <div><span className="lbl">Бассейн</span><div className="chips">
        <button className="chip" aria-pressed={pool === 'big'} onClick={() => setPool('big')}>Большая вода</button>
        <button className="chip" aria-pressed={pool === 'small'} onClick={() => setPool('small')}>Малая вода</button></div></div>
      <div><span className="lbl">Дни</span><div className="chips">{DAYS.map((d, i) => <button key={d} className="chip" aria-pressed={wd.includes(i + 1)} onClick={() => setWd(wd.includes(i + 1) ? wd.filter((x) => x !== i + 1) : [...wd, i + 1].sort())}>{d}</button>)}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div><label htmlFor="gs">Начало</label><input id="gs" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label htmlFor="gd">Минут</label><input id="gd" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
        <div><label htmlFor="gc">Мест</label><input id="gc" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
      </div>
      {(director || !g) && <div><span className="lbl">Тренер</span><div className="chips">{(coaches.data || []).filter((x: any) => x.role === 'coach').map((x: any) =>
        <button key={x.id} className="chip" aria-pressed={coach === x.id} onClick={() => setCoach(x.id)}>{x.full_name}</button>)}</div></div>}
      {g && !director && <p className="sub">Тренер: {g.coach_name || '—'} (меняет директор)</p>}
      {g && <p className="note">Если убрать день недели, будущие занятия в этот день удалятся (если в них нет отметок и отработок).</p>}
      <Err e={err} />
      <button className="btn" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
      {g && (g.active
        ? (sure ? <button className="btn bad" disabled={busy} onClick={() => setActive(false)}>Да, закрыть группу</button>
                : <button className="btn ghost" onClick={() => setSure(true)}>Закрыть группу</button>)
        : <button className="btn ghost" disabled={busy} onClick={() => setActive(true)}>Открыть группу снова</button>)}
      {sure && <p className="note">Закрыть можно только пустую группу. Будущие занятия удалятся, история останется.</p>}
      <button className="btn ghost" onClick={() => onClose(false)}>Отмена</button>
    </Sheet>
  )
}
