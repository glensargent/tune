import { createSignal, type Accessor } from 'solid-js'

type PersistedSignal<T> = readonly [Accessor<T>, (v: T | ((prev: T) => T)) => T]

export const createPersistedSignal = <T>(key: string, defaultValue: T): PersistedSignal<T> => {
  const stored = localStorage.getItem(key)
  let initial = defaultValue
  if (stored !== null) {
    try { initial = JSON.parse(stored) as T } catch { /* corrupted value, use default */ }
  }
  const [value, setValue] = createSignal<T>(initial)

  const setAndPersist = (v: T | ((prev: T) => T)): T => {
    const next = typeof v === 'function' ? (v as (prev: T) => T)(value()) : v
    setValue(() => next)
    if (next === undefined) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(next))
    }
    return next
  }

  return [value, setAndPersist] as const
}
