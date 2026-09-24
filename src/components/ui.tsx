import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { tap } from '../lib/haptics'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variantClass: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink font-semibold active:brightness-90',
  secondary: 'bg-surface-2 text-text font-medium active:bg-surface-3',
  ghost: 'bg-transparent text-muted font-medium active:bg-surface-2',
  danger: 'bg-transparent text-danger font-medium active:bg-surface-2',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-14 px-6 text-[17px] rounded-2xl' : size === 'sm' ? 'h-9 px-3 text-[14px] rounded-xl' : 'h-12 px-5 text-[15px] rounded-2xl'
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 select-none transition disabled:opacity-40 ${sizeClass} ${variantClass[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface rounded-[18px] border border-border/60 ${className}`}>{children}</div>
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full h-12 px-4 rounded-xl bg-surface-2 border border-border/60 placeholder:text-faint outline-none focus:border-accent/60 ${className}`}
      {...props}
    />
  )
}

export function Chip({ active, children, onClick, className = '' }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-4 rounded-full text-[14px] font-medium whitespace-nowrap transition ${
        active ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-text active:bg-surface-3'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-surface-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-9 px-4 rounded-lg text-[14px] font-medium transition ${value === o.value ? 'bg-surface-3 text-text' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-auto bg-surface rounded-t-[24px] border-t border-border/60 max-h-[88dvh] flex flex-col pb-safe">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3" />
        {title && <div className="px-5 pt-4 pb-2 text-[17px] font-semibold">{title}</div>}
        <div
          className="overflow-y-auto px-5 pb-6"
          onTouchMove={() => {
            // Dragging the list puts the keyboard away, like a native scroll view.
            const a = document.activeElement as HTMLElement | null
            if (a && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)) a.blur()
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export interface MenuItem {
  label: string
  sub?: string
  icon?: ReactNode
  danger?: boolean
  right?: ReactNode
  keepOpen?: boolean
  onClick: () => void
}

/** iOS-style action list inside a bottom sheet. */
export function MenuSheet({ open, onClose, title, subtitle, items, footer }: { open: boolean; onClose: () => void; title?: string; subtitle?: string; items: MenuItem[]; footer?: ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose}>
      {(title || subtitle) && (
        <div className="pt-3 pb-2">
          {title && <div className="text-[17px] font-semibold">{title}</div>}
          {subtitle && <div className="text-[13px] text-muted">{subtitle}</div>}
        </div>
      )}
      <div className="mt-2 rounded-2xl bg-surface-2 divide-y divide-border/60 overflow-hidden">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={() => {
              tap()
              it.onClick()
              if (!it.keepOpen) onClose()
            }}
            className={`w-full flex items-center gap-3 px-4 min-h-[54px] text-left active:bg-surface-3 ${it.danger ? 'text-danger' : 'text-text'}`}
          >
            {it.icon && <span className={`shrink-0 ${it.danger ? 'text-danger' : 'text-muted'}`}>{it.icon}</span>}
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-medium truncate">{it.label}</span>
              {it.sub && <span className="block text-[12px] text-muted">{it.sub}</span>}
            </span>
            {it.right}
          </button>
        ))}
      </div>
      {footer}
      <Button variant="secondary" size="lg" className="w-full mt-3" onClick={onClose}>Cancel</Button>
    </Sheet>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); tap(); onChange(!checked) }}
      className={`relative h-8 w-[52px] rounded-full transition ${checked ? 'bg-accent' : 'bg-surface-3'}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[24px]' : 'left-1'}`} />
    </button>
  )
}

export function Stepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="inline-flex items-center rounded-xl bg-surface-2">
      <button type="button" aria-label="Decrease" className="h-11 w-11 text-[22px] text-muted disabled:opacity-30" disabled={value <= min} onClick={() => { tap(); onChange(value - 1) }}>−</button>
      <span className="min-w-10 text-center font-semibold tabular">{value}{suffix}</span>
      <button type="button" aria-label="Increase" className="h-11 w-11 text-[22px] text-muted disabled:opacity-30" disabled={value >= max} onClick={() => { tap(); onChange(value + 1) }}>+</button>
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      {icon && <div className="mb-4 text-faint">{icon}</div>}
      <div className="text-[17px] font-semibold">{title}</div>
      {body && <div className="mt-1 text-[14px] text-muted max-w-xs">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex justify-center py-10 ${className}`}>
      <div className="h-6 w-6 rounded-full border-2 border-surface-3 border-t-accent animate-spin" />
    </div>
  )
}

export function PageTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between pt-3 pb-5">
      <div>
        {eyebrow && <div className="text-[13px] font-medium text-muted uppercase tracking-wide">{eyebrow}</div>}
        <h1 className="page-title text-[30px] leading-tight">{title}</h1>
      </div>
      {right}
    </div>
  )
}

export function PrBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md bg-pr-dim text-pr text-[11px] font-bold tracking-wide ${className}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 16 3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" />
      </svg>
      PR
    </span>
  )
}

/* Icons (24px, stroke) */
const ico = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
export const Icon = {
  Home: () => <svg {...ico} aria-hidden="true"><path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" /></svg>,
  Calendar: () => <svg {...ico} aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  Chart: () => <svg {...ico} aria-hidden="true"><path d="M4 19V5M4 19h16" /><path d="m7 14 4-4 3 3 5-6" /></svg>,
  Settings: () => <svg {...ico} aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  Plus: () => <svg {...ico} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  Back: () => <svg {...ico} aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>,
  ChevronLeft: () => <svg {...ico} aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>,
  ChevronRight: () => <svg {...ico} aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>,
  ChevronDown: () => <svg {...ico} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>,
  X: () => <svg {...ico} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  Trash: () => <svg {...ico} aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  Search: () => <svg {...ico} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  Repeat: () => <svg {...ico} aria-hidden="true"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>,
  Flame: () => <svg {...ico} aria-hidden="true"><path d="M12 22c4.4 0 7-2.9 7-7 0-3-2-5.5-3.5-7-.5 2-1.5 3-2.5 3.5C13 9 12.5 5 9.5 2 9 6 5 8.5 5 14.5 5 19 7.6 22 12 22z" /></svg>,
  Dumbbell: () => <svg {...ico} aria-hidden="true"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg>,
  Note: () => <svg {...ico} aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>,
  Copy: () => <svg {...ico} aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>,
  Check: () => <svg {...ico} aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>,
  More: () => <svg {...ico} aria-hidden="true"><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></svg>,
  Clock: () => <svg {...ico} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  Bell: () => <svg {...ico} aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>,
  BellOff: () => <svg {...ico} aria-hidden="true"><path d="M8.7 3A6 6 0 0 1 18 8c0 4.5 1.3 7 2.2 8M17 17H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0M2 2l20 20" /></svg>,
  Flag: () => <svg {...ico} aria-hidden="true"><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>,
  Run: () => <svg {...ico} aria-hidden="true"><circle cx="15" cy="4" r="2" /><path d="m9 20 2-6-3-3 4-4 3 3h4" /><path d="m6 12 3-3M13 14l3 6" /></svg>,
  Rows: () => <svg {...ico} aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1.5" /><rect x="3" y="15" width="18" height="5" rx="1.5" /></svg>,
  Sparkle: () => <svg {...ico} aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>,
  Play: () => <svg {...ico} aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>,
  Pause: () => <svg {...ico} aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>,
  CalendarPlus: () => <svg {...ico} aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></svg>,
  Share: () => <svg {...ico} aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>,
}
