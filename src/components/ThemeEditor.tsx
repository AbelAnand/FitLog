import { useRef, useState, type CSSProperties } from 'react'
import { tap } from '../lib/haptics'
import { toast } from '../lib/toast'
import { contrastWarnings, deriveTokens, normalizeHex, type CustomTheme } from '../lib/theme-color'
import { MAX_THEME_NAME, cleanThemeName, decodeThemeCode, findThemeCode } from '../lib/theme-code'
import { draftTheme, type ThemeMeta } from '../lib/theme'
import { Button, Icon, PrBadge, Segmented, Sheet, TextInput } from './ui'

/*
 * Making a theme. Four colours and a light/dark switch; everything else is derived (theme-color.ts)
 * and shown live in a preview that uses the app's real classes, so what you see is what you get.
 */

type Role = 'bg' | 'surface' | 'accent' | 'text'
const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: 'bg', label: 'Background', hint: 'Behind everything' },
  { key: 'surface', label: 'Cards', hint: 'Workouts, settings, sheets' },
  { key: 'accent', label: 'Accent', hint: 'Buttons and highlights' },
  { key: 'text', label: 'Text', hint: 'Titles and numbers' },
]

/** Sensible base colours for each mode, used when the person flips the switch before picking any. */
const BASE = {
  dark: { bg: '#0b0d10', surface: '#15181d', text: '#f2f4f7' },
  light: { bg: '#f6f7f9', surface: '#ffffff', text: '#111418' },
}

/** The theme as it would look: a card, a weight field with a record, a button, some text. */
export function ThemePreview({ theme, className = '' }: { theme: Omit<CustomTheme, 'id'>; className?: string }) {
  const style = deriveTokens({ id: 'c_preview', ...theme }) as CSSProperties
  return (
    <div className={`rounded-2xl bg-bg text-text p-3 border border-border/60 ${className}`} style={style} aria-hidden="true">
      <div className="flex items-end justify-between mb-2.5">
        <div>
          <div className="text-[11px] font-medium text-muted uppercase tracking-wide">Today</div>
          <div className="page-title text-[20px] leading-tight">Push day</div>
        </div>
        <span className="h-8 px-3 inline-flex items-center rounded-full bg-accent-dim text-accent text-[12px] font-semibold">Streak 6</span>
      </div>
      <div className="bg-surface rounded-[18px] border border-border/60 p-3">
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-semibold">Bench Press</div>
          <div className="text-[12px] text-muted">Last time 3 × 185</div>
        </div>
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <div className="relative @container h-10 rounded-xl bg-surface-2 border border-border/60 flex items-center justify-center text-[16px] font-semibold tabular ring-1 ring-inset ring-pr/70">
            190
            <PrBadge className="absolute top-0 right-0 !animate-none" />
          </div>
          <div className="h-10 rounded-xl bg-surface-2 border border-border/60 flex items-center justify-center text-[16px] font-semibold tabular">5</div>
          <div className="text-[12px] text-faint">lb × reps</div>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <Button size="sm" className="flex-1 pointer-events-none" tabIndex={-1}>Log set</Button>
          <Button size="sm" variant="secondary" className="pointer-events-none" tabIndex={-1}>Rest 90 s</Button>
        </div>
      </div>
    </div>
  )
}

function HexField({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  // While the field is being typed in, it shows the keystrokes; otherwise the colour in force.
  const [typed, setTyped] = useState<string | null>(null)
  return (
    <input
      value={typed ?? value.toUpperCase()}
      onFocus={() => setTyped(value.toUpperCase())}
      onChange={(e) => {
        const v = e.target.value.slice(0, 7)
        setTyped(v.toUpperCase())
        const hex = normalizeHex(v)
        if (hex) onChange(hex)
      }}
      onBlur={() => setTyped(null)}
      inputMode="text"
      autoCapitalize="characters"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      maxLength={7}
      aria-label={`${label} colour as hex`}
      className="w-[96px] h-10 px-2 rounded-xl bg-surface-2 border border-border/60 text-center font-mono text-[14px] tracking-wide outline-none focus:border-accent/60"
    />
  )
}

function ColourRow({ role, value, flagged, onChange }: { role: (typeof ROLES)[number]; value: string; flagged: boolean; onChange: (hex: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[15px] font-medium">{role.label}</div>
        <div className={`text-[12px] ${flagged ? 'text-pr' : 'text-muted'}`}>{role.hint}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <HexField value={value} onChange={onChange} label={role.label} />
        <span className="relative h-10 w-10 rounded-xl border border-border/60 overflow-hidden press" style={{ background: value }}>
          <input
            type="color"
            value={value}
            onChange={(e) => { const hex = normalizeHex(e.target.value); if (hex) onChange(hex) }}
            aria-label={`Pick the ${role.label.toLowerCase()} colour`}
            className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
          />
        </span>
      </div>
    </div>
  )
}

function Warnings({ theme }: { theme: Omit<CustomTheme, 'id'> }) {
  const warnings = contrastWarnings({ id: 'c_preview', ...theme })
  if (!warnings.length) return null
  return (
    <ul className="mt-2 mb-1 text-[13px] text-pr leading-snug">
      {warnings.map((w) => <li key={w.message}>{w.message}</li>)}
    </ul>
  )
}

interface EditorProps {
  /** The theme being edited, or null to make a new one. */
  initial: CustomTheme | null
  /** Where a new theme starts from: the theme in use. */
  seed: ThemeMeta
  onClose: () => void
  onSave: (theme: CustomTheme) => void
  onShare?: (theme: CustomTheme) => void
  onDelete?: (theme: CustomTheme) => void
}

/** The sheet's body. Mounted afresh each time the sheet opens, so its state starts from the props. */
function EditorForm({ initial, seed, onClose, onSave, onShare, onDelete }: EditorProps) {
  const [draft, setDraft] = useState<CustomTheme>(() => initial ?? draftTheme(seed))
  const touched = useRef<Set<Role>>(new Set(initial ? (['bg', 'surface', 'accent', 'text'] as Role[]) : []))

  const setColour = (key: Role, hex: string) => {
    touched.current.add(key)
    setDraft((d) => ({ ...d, [key]: hex }))
  }
  const setMode = (light: boolean) => {
    tap()
    setDraft((d) => {
      // Colours the person has not chosen yet follow the switch, so "Light" does not mean black on black.
      const base = BASE[light ? 'light' : 'dark']
      const next = { ...d, light }
      for (const k of ['bg', 'surface', 'text'] as const) if (!touched.current.has(k)) next[k] = base[k]
      return next
    })
  }

  const flagged = new Set<string>(contrastWarnings(draft).map((w) => w.about))
  const editing = !!initial

  return (
    <>
      <ThemePreview theme={draft} className="mb-3" />
      <Warnings theme={draft} />

      <label className="block mt-2 mb-1">
        <span className="block text-[12px] font-medium text-muted mb-1">Name</span>
        <TextInput value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, MAX_THEME_NAME) }))} maxLength={MAX_THEME_NAME} placeholder="Sunset, Gym rat, Calm…" autoCapitalize="sentences" autoCorrect="off" aria-label="Theme name" />
      </label>

      <div className="flex items-center justify-between gap-3 py-2.5">
        <div>
          <div className="text-[15px] font-medium">Mode</div>
          <div className={`text-[12px] ${flagged.has('mode') ? 'text-pr' : 'text-muted'}`}>Status bar and keyboard follow this</div>
        </div>
        <Segmented<'dark' | 'light'> value={draft.light ? 'light' : 'dark'} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} onChange={(v) => setMode(v === 'light')} />
      </div>

      <div className="divide-y divide-border/50">
        {ROLES.map((r) => <ColourRow key={r.key} role={r} value={draft[r.key]} flagged={flagged.has(r.key)} onChange={(hex) => setColour(r.key, hex)} />)}
      </div>

      {editing && (
        <div className="flex gap-2 mt-3">
          {onShare && <Button variant="secondary" size="md" className="flex-1" onClick={() => onShare(draft)}><Icon.Share /> Share</Button>}
          {onDelete && <Button variant="danger" size="md" className="flex-1" onClick={() => onDelete(draft)}><Icon.Trash /> Delete</Button>}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button size="lg" className="flex-1" onClick={() => { tap(); onSave({ ...draft, name: cleanThemeName(draft.name) }) }}>
          {editing ? 'Save' : 'Save and use'}
        </Button>
      </div>
    </>
  )
}

export function ThemeEditorSheet({ open, ...props }: EditorProps & { open: boolean }) {
  return (
    <Sheet open={open} onClose={props.onClose} title={props.initial ? 'Edit theme' : 'Your own theme'}>
      <EditorForm {...props} />
    </Sheet>
  )
}

function ImportForm({ onClose, onImport }: { onClose: () => void; onImport: (theme: Omit<CustomTheme, 'id'>) => void }) {
  const [text, setText] = useState('')
  const code = findThemeCode(text)
  const decoded = code ? decodeThemeCode(code) : null
  const bad = text.trim().length > 0 && !decoded

  const paste = async () => {
    tap()
    try {
      const clip = await navigator.clipboard.readText()
      if (!clip) throw new Error('empty')
      setText(clip)
    } catch {
      toast('Paste the code into the box.', 'info')
    }
  }

  return (
    <>
      <p className="text-muted text-[14px] mb-3">Paste a theme code someone shared with you. It starts with <span className="font-mono text-text">splitlog-theme:</span></p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder="splitlog-theme:…"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Theme code"
        className={`w-full px-4 py-3 rounded-xl bg-surface-2 border outline-none focus:border-accent/60 placeholder:text-faint resize-none font-mono text-[13px] break-all ${bad ? 'border-danger/70' : 'border-border/60'}`}
      />
      <div className="flex items-center justify-between mt-2 min-h-[36px]">
        <span className={`text-[13px] ${bad ? 'text-danger' : 'text-muted'}`}>{bad ? "That isn't a SplitLog theme code." : decoded ? `“${decoded.name}”, ${decoded.light ? 'light' : 'dark'}` : ''}</span>
        <Button variant="secondary" size="sm" onClick={paste}>Paste</Button>
      </div>
      {decoded && (
        <>
          <ThemePreview theme={decoded} className="mt-2" />
          <Warnings theme={decoded} />
        </>
      )}
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button size="lg" className="flex-1" disabled={!decoded} onClick={() => { tap(); if (decoded) onImport(decoded) }}>Save and use</Button>
      </div>
    </>
  )
}

export function ThemeImportSheet({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (theme: Omit<CustomTheme, 'id'>) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Import a theme">
      <ImportForm onClose={onClose} onImport={onImport} />
    </Sheet>
  )
}
