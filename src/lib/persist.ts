import { createSignal } from 'solid-js'

export function createPersistedSignal<T>(key: string, defaultValue: T) {
  const stored = localStorage.getItem(key)
  const initial = stored !== null ? JSON.parse(stored) : defaultValue
  const [value, setValue] = createSignal<T>(initial)

  const setAndPersist = (v: T | ((prev: T) => T)) => {
    const next = typeof v === 'function' ? (v as (prev: T) => T)(value()) : v
    setValue(() => next)
    localStorage.setItem(key, JSON.stringify(next))
    return next
  }

  return [value, setAndPersist] as const
}
