import { dismissToast, useToasts } from '../lib/toast'

/** Floating messages for things that went wrong in the background (a save that didn't go through). */
export function Toaster() {
  const toasts = useToasts()
  if (!toasts.length) return null
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className={`toast-in pointer-events-auto max-w-sm w-full text-left rounded-2xl px-4 py-3 text-[14px] font-medium shadow-lg border ${
            t.tone === 'error' ? 'bg-surface-2 border-danger/50 text-text' : 'bg-surface-2 border-border text-text'
          }`}
        >
          {t.tone === 'error' && <span className="text-danger font-semibold">Not saved. </span>}
          {t.message}
        </button>
      ))}
    </div>
  )
}
