import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Button, TextInput } from '../components/ui'

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Simulator/dev convenience only: a build with VITE_TEST_LOGIN_* set signs in automatically.
  useEffect(() => {
    const email = import.meta.env.VITE_TEST_LOGIN_EMAIL as string | undefined
    const password = import.meta.env.VITE_TEST_LOGIN_PASSWORD as string | undefined
    if (!email || !password) return
    setNotice(`Signing in as ${email}…`)
    supabase.auth
      .signInWithPassword({ email, password })
      .then(({ error }) => { if (error) setError(`Auto sign-in failed: ${error.message}`) })
      .catch((e: Error) => setError(`Auto sign-in threw: ${e.message}`))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setNotice('Check your email for a confirmation link, then sign in.')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-dvh mx-auto max-w-sm px-6 pt-safe flex flex-col justify-center">
      <div className="mb-10">
        <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center text-accent-ink mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg>
        </div>
        <h1 className="text-[34px] font-bold tracking-tight leading-none">FitLog</h1>
        <p className="mt-2 text-muted">Log every set. Watch the numbers climb.</p>
      </div>

      <div className="inline-flex p-1 rounded-xl bg-surface-2 mb-5 self-start">
        {(['signin', 'signup'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setError(null); setNotice(null) }} className={`h-9 px-4 rounded-lg text-[14px] font-medium ${mode === m ? 'bg-surface-3 text-text' : 'text-muted'}`}>
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextInput type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextInput type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {error && <div className="text-[14px] text-danger">{error}</div>}
        {notice && <div className="text-[14px] text-accent">{notice}</div>}
        <Button type="submit" size="lg" disabled={busy} className="mt-2">
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
    </main>
  )
}
