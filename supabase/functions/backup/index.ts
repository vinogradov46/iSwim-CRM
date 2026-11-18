// Ночная резервная копия iSwim CRM: все таблицы -> gzip -> Google Apps Script -> Google Диск.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } })

async function gzipB64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

Deno.serve(async (req) => {
  const key = req.headers.get('x-key') ?? ''
  const { data: ok } = await db.rpc('tg_check_key', { p_key: key })
  if (!ok) return json({ error: 'forbidden' }, 403)
  const { data: cfg, error: e1 } = await db.rpc('backup_config', { p_key: key })
  if (e1) return json({ error: e1.message }, 500)
  if (!cfg?.url) return json({ error: 'backup_url не задан' }, 500)
  const { data: dump, error: e2 } = await db.rpc('backup_dump', { p_key: key })
  if (e2) return json({ error: e2.message }, 500)
  const text = JSON.stringify(dump)
  const rows = Object.values((dump as any).tables as Record<string, unknown[]>).reduce((a, t) => a + t.length, 0)
  const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)
  const body = { key: cfg.key, name: `iswim-backup-${day}.json.gz`, rows, data: await gzipB64(text) }
  const r = await fetch(cfg.url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body), redirect: 'follow' })
  const out = await r.text()
  return json({ status: r.status, rows, bytes: text.length, drive: out.slice(0, 300) }, r.ok ? 200 : 502)
})
