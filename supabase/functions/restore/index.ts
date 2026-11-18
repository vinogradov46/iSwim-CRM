// Восстановление iSwim CRM из ночной копии в ЭТОТ проект Supabase.
// Вызов: POST с телом {"key": RESTORE_KEY, "data": "<base64 gzip копии>"} либо сырой gzip-файл с заголовком x-key.
// Ставится в НОВЫЙ пустой проект. Секрет RESTORE_KEY задаётся в Supabase -> Edge Functions -> Secrets.
import postgres from 'npm:postgres@3.4.4'

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { 'content-type': 'application/json' } })

async function gunzip(buf: Uint8Array): Promise<string> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

Deno.serve(async (req) => {
  const RKEY = Deno.env.get('RESTORE_KEY') ?? ''
  if (!RKEY) return json({ error: 'RESTORE_KEY не задан' }, 500)
  let raw: Uint8Array, key = req.headers.get('x-key') ?? ''
  const ctype = req.headers.get('content-type') ?? ''
  if (ctype.includes('json') || ctype.includes('text')) {
    const body = JSON.parse(await req.text())
    key = body.key ?? key
    raw = b64(body.data)
  } else raw = new Uint8Array(await req.arrayBuffer())
  if (key !== RKEY) return json({ error: 'forbidden' }, 403)

  const skipSchema = new URL(req.url).searchParams.get('skip_schema') === '1' // повторить только загрузку данных, если структура уже создана
  const dump = JSON.parse(await gunzip(raw))
  const tables: Record<string, any[]> = dump.tables
  const system = dump.system ?? {}
  const migs: { version: string; name: string; statements: string[] }[] = system.migrations ?? []
  if (!migs.length) return json({ error: 'в копии нет миграций (нужна копия от 18.11.2026 или новее)' }, 400)

  const newRef = new URL(Deno.env.get('SUPABASE_URL')!).hostname.split('.')[0]
  const oldRef: string = (JSON.stringify(system.cron ?? []).match(/([a-z0-9]{20})\.supabase\.co/) ?? [])[1] ?? ''
  const fix = (s: string) => (oldRef ? s.replaceAll(oldRef, newRef) : s)

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
  const report: any = { oldRef, newRef, migration_errors: [] as string[], tables: {}, notes: [] }
  try {
    for (const ext of ['pg_cron', 'pg_net', 'pgcrypto']) {
      try { await sql.unsafe(`create extension if not exists ${ext}`) } catch (e) { report.notes.push(`extension ${ext}: ${(e as Error).message}`) }
    }
    // 1. миграции: несколько проходов (часть изменений когда-то делалась вне миграций, порядок может не сойтись с первого раза)
    const runnable = migs.filter((m) => !m.name.startsWith('import_')) // импорты данных не нужны: данные приедут из копии
    let pending: { id: string; st: string }[] = skipSchema ? [] : runnable.flatMap((m) => m.statements.map((st) => ({ id: `${m.version} ${m.name}`, st })))
    let lastErr: Record<string, string> = {}
    for (let pass = 1; pass <= 3 && pending.length; pass++) {
      const failed: typeof pending = []
      lastErr = {}
      for (const p of pending) {
        try { await sql.unsafe(fix(p.st)) } catch (e) { failed.push(p); lastErr[p.id] = (e as Error).message.split('\n')[0] }
      }
      if (pass === 1) {
        // колонки, которых нет в миграциях (добавлялись напрямую в базе): создаём по описанию из копии
        const have = new Set((await sql.unsafe(`select table_name||'.'||column_name k from information_schema.columns where table_schema='public'`)).map((r: any) => r.k))
        const tabs = new Set((await sql.unsafe(`select table_name from information_schema.tables where table_schema='public'`)).map((r: any) => r.table_name))
        for (const c of system.columns ?? []) {
          if (!tabs.has(c.t) || have.has(`${c.t}.${c.c}`)) continue
          try {
            await sql.unsafe(`alter table public."${c.t}" add column if not exists "${c.c}" ${c.type}${c.def ? ' default ' + c.def : ''}${c.notnull && c.def ? ' not null' : ''}`)
            report.notes.push(`добавлена колонка ${c.t}.${c.c} (её не было в миграциях)`)
          } catch (e) { report.notes.push(`колонка ${c.t}.${c.c}: ${(e as Error).message}`) }
        }
      }
      pending = failed
    }
    report.migration_errors = pending.map((p) => `${p.id}: ${lastErr[p.id]}`)
    // 2-3. логины и данные (триггеры и внешние ключи отключены на время загрузки)
    const insertRows = async (tx: any, tbl: string, schema: string, name: string, rows: any[]) => {
      const cols = (await tx.unsafe(`select column_name from information_schema.columns where table_schema=$1 and table_name=$2 and is_generated='NEVER' order by ordinal_position`, [schema, name])).map((r: any) => `"${r.column_name}"`).join(',')
      await tx.unsafe(`insert into ${tbl} (${cols}) overriding system value select ${cols} from jsonb_populate_recordset(null::${tbl}, $1::text::jsonb) on conflict do nothing`, [JSON.stringify(rows)])
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local session_replication_role = replica`)
      for (const [name, k] of [['users', 'auth_users'], ['identities', 'auth_identities']] as const) {
        const rows = system[k] ?? []
        if (rows.length) { await insertRows(tx, `auth.${name}`, 'auth', name, rows); report.tables[`auth.${name}`] = rows.length }
      }
      const have = new Set((await tx.unsafe(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).map((r: any) => r.table_name))
      // сначала очищаем ВСЕ таблицы одним запросом: поштучный truncate ... cascade стирал бы уже загруженные таблицы, которые ссылаются на очищаемую
      const present = Object.keys(tables).filter((t) => have.has(t))
      if (present.length) await tx.unsafe(`truncate ${present.map((t) => `public."${t}"`).join(', ')} cascade`)
      for (const [t, rows] of Object.entries(tables)) {
        if (!have.has(t)) { report.notes.push(`таблицы ${t} нет в новой базе`); continue }
        if (rows.length) await insertRows(tx, `public."${t}"`, 'public', t, rows)
        report.tables[t] = rows.length
      }
      // счётчики автонумерации (id) продолжаем с максимального значения
      for (const r of await tx.unsafe(`select table_name t, column_name c from information_schema.columns where table_schema='public' and (is_identity='YES' or column_default like 'nextval%')`)) {
        await tx.unsafe(`select setval(pg_get_serial_sequence('public."${r.t}"', '${r.c}'), coalesce((select max("${r.c}") from public."${r.t}"), 0) + 1, false)`)
      }
      report.notes.push('ключи приложения (значения в копию не входят) нужно задать заново: ' + (system.private_app_keys ?? []).join(', '))
      await tx.unsafe(`insert into private.app_keys(k, v) select 'cron_key', encode(extensions.gen_random_bytes(24), 'hex') where not exists (select 1 from private.app_keys where k = 'cron_key')`)
    })
    // 4. ночные задачи
    for (const j of system.cron ?? []) {
      try { await sql.unsafe(`select cron.schedule($1, $2, $3)`, [j.jobname, j.schedule, fix(j.command)]); report.tables['cron:' + j.jobname] = j.schedule }
      catch (e) { report.notes.push(`cron ${j.jobname}: ${(e as Error).message}`) }
    }
    return json({ ok: report.migration_errors.length === 0, taken_at: dump.taken_at, ...report })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message, ...report }, 500)
  } finally {
    await sql.end()
  }
})
