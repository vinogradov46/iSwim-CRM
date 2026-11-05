import { useEffect, useState, type ReactNode } from 'react'

/** Нижняя шторка */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">{children}</div>
    </div>
  )
}

let toastSet: ((t: string | null) => void) | null = null
export function toast(t: string) {
  toastSet?.(t)
  window.clearTimeout((toast as any).tm)
  ;(toast as any).tm = window.setTimeout(() => toastSet?.(null), 2600)
}
export function Toaster() {
  const [t, set] = useState<string | null>(null)
  toastSet = set
  return t ? <div className="toast" role="status">{t}</div> : null
}

export function Pill({ c, children }: { c: string; children: ReactNode }) {
  return <span className={`pill ${c}`}>{children}</span>
}

export function Loading() {
  return <div className="spin">Загрузка…</div>
}

export function Err({ e }: { e: string | null }) {
  return e ? <div className="err">{e}</div> : null
}

/** Выбор из вариантов (кнопки-чипсы) */
export function Chips<T extends string | number>({ options, value, onChange }: { options: [T, string][]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map(([v, l]) => (
        <button key={String(v)} className="chip" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

/** Хук загрузки данных с перезапуском */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    setError(null)
    fn().then((d) => alive && setData(d)).catch((e) => alive && setError(e.message))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return { data, error, reload: () => setN((x) => x + 1) }
}
