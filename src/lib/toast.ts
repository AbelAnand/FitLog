import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  message: string
  tone: 'error' | 'info'
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Show a short message at the top of the screen. Identical messages already on screen are not stacked. */
export function toast(message: string, tone: Toast['tone'] = 'error', ms = 4000): void {
  if (toasts.some((t) => t.message === message)) return
  const id = nextId++
  toasts = [...toasts.slice(-2), { id, message, tone }]
  emit()
  window.setTimeout(() => dismissToast(id), ms)
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
