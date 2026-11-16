import { useState } from 'react'
import { rpc } from '../lib'
import { Sheet, useLoad, Loading, Err, toast } from '../ui'

type Link = { linked: boolean; bot: string | null; code: string; url: string | null }

/** Подключение Telegram-напоминаний. staffId = null — для себя. */
export function TgBlock({ staffId, self }: { staffId: string | null; self?: boolean }) {
  const { data, error, reload } = useLoad(() => rpc<Link>('staff_tg_link', { p_staff: staffId }), [staffId])
  if (error) return <Err e={error} />
  if (!data) return <Loading />
  const copy = () => { if (!data.url) return; navigator.clipboard?.writeText(data.url).then(() => toast('Ссылка скопирована'), () => toast(data.url!)) }
  return (
    <div>
      <span className="lbl">Telegram-напоминания</span>
      {data.linked ? <div className="okbox">Подключено ✓ {self ? 'Напоминания приходят вам в Telegram.' : 'Напоминания приходят в Telegram.'}</div>
        : !data.url ? <p className="note">Бот ещё не настроен — скоро появится.</p>
        : <>
          <p className="sub">{self ? 'Нажмите кнопку, откроется Telegram — нажмите «Запустить» (Start).' : 'Отправьте сотруднику эту ссылку: он откроет её и нажмёт «Запустить» (Start).'}</p>
          <div className="acts" style={{ marginTop: 6 }}>
            {self && <a className="btn sm" href={data.url} target="_blank" rel="noreferrer">Подключить Telegram</a>}
            <button className="btn sm ghost" onClick={copy}>Скопировать ссылку</button>
            <button className="btn sm ghost" onClick={reload}>Проверить</button>
          </div>
          <div className="meta" style={{ userSelect: 'text', wordBreak: 'break-all', marginTop: 4 }}>{data.url}</div>
        </>}
      {data.linked && <div className="acts" style={{ marginTop: 6 }}><button className="btn sm ghost" onClick={async () => { try { await rpc('staff_tg_unlink', { p_staff: staffId }); toast('Отключено'); reload() } catch (e: any) { toast(e.message) } }}>Отключить</button></div>}
    </div>
  )
}

export function TgButton() {
  const [open, setOpen] = useState(false)
  return <>
    <button className="btn sm ghost" onClick={() => setOpen(true)}>Telegram</button>
    {open && <Sheet onClose={() => setOpen(false)}>
      <h2>Напоминания в Telegram</h2>
      <p className="sub">Вечером — если занятие не отмечено, утром — последний шанс отметить вчерашнее. Администратору — утренняя сводка.</p>
      <TgBlock staffId={null} self />
      <button className="btn ghost" onClick={() => setOpen(false)}>Закрыть</button>
    </Sheet>}
  </>
}
