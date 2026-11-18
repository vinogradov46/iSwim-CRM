// Telegram-бот iSwim CRM: привязка сотрудников (/start КОД) и рассылка напоминаний.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const api = (m: string, body: unknown) => fetch(`https://api.telegram.org/bot${TOKEN}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
async function hookSecret() {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('iswim:' + TOKEN))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48)
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (!TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN не задан' }, 500)
  const url = new URL(req.url)
  const job = url.searchParams.get('job')
  if (job) {
    const key = req.headers.get('x-key') ?? ''
    const { data: ok } = await db.rpc('tg_check_key', { p_key: key })
    if (!ok) return json({ error: 'forbidden' }, 403)
    if (job === 'setup') {
      const me = await api('getMe', {})
      const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/tg`
      const hook = await api('setWebhook', { url: base, secret_token: await hookSecret(), allowed_updates: ['message'] })
      if (me?.result?.username) await db.rpc('tg_set_bot', { p_key: key, p_bot: me.result.username })
      return json({ me: me?.result?.username, hook })
    }
    const { data, error } = await db.rpc('tg_job', { p_key: key, p_kind: job })
    if (error) return json({ error: error.message }, 500)
    let sent = 0
    for (const m of (data ?? []) as { chat: number; text: string }[]) {
      const r = await api('sendMessage', { chat_id: m.chat, text: m.text, disable_web_page_preview: true })
      if (r?.ok) sent++
    }
    return json({ sent, total: (data ?? []).length })
  }
  // вебхук Telegram
  if (req.headers.get('x-telegram-bot-api-secret-token') !== await hookSecret()) return json({ error: 'forbidden' }, 403)
  const upd = await req.json().catch(() => ({}))
  const msg = upd?.message
  if (!msg?.chat?.id || typeof msg.text !== 'string') return json({ ok: true })
  const chat = msg.chat.id
  const m = msg.text.trim().match(/^\/start\s+([a-f0-9]{8,32})$/i)
  if (m) {
    const { data: name } = await db.rpc('tg_link', { p_code: m[1].toLowerCase(), p_chat: chat })
    await api('sendMessage', { chat_id: chat, text: name
      ? `Готово, ${name}! Сюда будут приходить напоминания iSwim CRM: о неотмеченных занятиях и утренняя сводка.`
      : 'Код не подошёл. Откройте в CRM «Команда» → своё имя → «Подключить Telegram» и нажмите ссылку ещё раз.' })
  } else {
    await api('sendMessage', { chat_id: chat, text: 'Это бот уведомлений iSwim CRM. Чтобы подключиться, откройте ссылку «Подключить Telegram» в CRM.' })
  }
  return json({ ok: true })
})
