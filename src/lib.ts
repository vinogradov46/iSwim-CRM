import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://rpvzjqlhihphspaxocqx.supabase.co',
  'sb_publishable_e8DIJER-PQXio6ps13dzIQ_xIk889dx',
  { auth: { persistSession: true, autoRefreshToken: true } }
)

export type Role = 'director' | 'admin' | 'coach'
export type Me = { id: string; full_name: string; role: Role; must_change_password: boolean }

/** Вызов функции базы; ошибку превращаем в понятный текст */
export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(cleanError(error.message))
  return data as T
}
export function cleanError(m: string) {
  if (/Invalid login credentials/i.test(m)) return 'Неверный телефон или пароль'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Нет связи с сервером. Проверьте интернет'
  if (/JWT expired/i.test(m)) return 'Сессия устарела, войдите снова'
  return m
}

/** +375 29 123-45-67 → +375291234567 */
export function phoneE164(p: string) {
  let d = p.replace(/\D/g, '')
  if (d.startsWith('80') && d.length === 11) d = '375' + d.slice(2)
  if (d.length === 9) d = '375' + d
  return d.length === 12 && d.startsWith('375') ? '+' + d : null
}
export function phonePretty(p?: string | null) {
  const e = p ? phoneE164(p) : null
  if (!e) return p || ''
  const d = e.slice(1)
  return `+375 ${d.slice(3, 5)} ${d.slice(5, 8)}-${d.slice(8, 10)}-${d.slice(10, 12)}`
}

export const money = (x: number | string | null | undefined) =>
  Number(x || 0).toLocaleString('ru-RU', { minimumFractionDigits: Number(x) % 1 ? 2 : 0, maximumFractionDigits: 2 })

export const todayISO = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Minsk' }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const dm = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '—')
export const hm = (t?: string | null) => (t ? t.slice(0, 5) : '')
export const dateRu = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

export function plural(n: number, a: string, b: string, c: string) {
  const x = Math.abs(n) % 10, y = Math.abs(n) % 100
  if (x === 1 && y !== 11) return a
  if (x >= 2 && x <= 4 && (y < 12 || y > 14)) return b
  return c
}
export const lw = (n: number) => plural(n, 'занятие', 'занятия', 'занятий')

/** Цены: 1 занятие 45, 2–7 по 37,50, от 8 по 33,75 */
export const PRICE = { trial: 25, single: 45, p2: 37.5, p8: 33.75, discount: 10, annual: 121 }
export const perLesson = (n: number) => (n >= 8 ? PRICE.p8 : n >= 2 ? PRICE.p2 : PRICE.single)
export const priceFor = (n: number, fam = false) => {
  const b = Math.round(n * perLesson(n) * 100) / 100
  return fam ? Math.round(b * (100 - PRICE.discount)) / 100 : b
}

/** Статус ребёнка в виде плашки */
export function balanceState(c: { plan_kind: string; lessons_left: number; sub_end?: string | null; frozen_until?: string | null; paid_month?: string | null }) {
  const t = todayISO()
  if (c.frozen_until && c.frozen_until > t) return { t: `Заморожен до ${dm(c.frozen_until)}`, c: 'p-mut' }
  if (c.plan_kind === 'month') return c.paid_month && c.paid_month.slice(0, 7) === t.slice(0, 7) ? { t: 'Месяц оплачен', c: 'p-ok' } : { t: 'Месяц не оплачен', c: 'p-bad' }
  if (c.plan_kind === 'count' && c.sub_end && c.sub_end < t && c.lessons_left > 0) return { t: `Истёк ${dm(c.sub_end)}`, c: 'p-bad' }
  if (c.lessons_left < 0) return { t: `Долг ${-c.lessons_left}`, c: 'p-bad' }
  if (c.lessons_left === 0) return { t: '0 занятий', c: 'p-bad' }
  if (c.lessons_left === 1) return { t: 'Осталось 1', c: 'p-warn' }
  return { t: `Осталось ${c.lessons_left}`, c: c.plan_kind === 'annual' ? 'p-acc' : 'p-ok' }
}
