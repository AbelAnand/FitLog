import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from 'react-router'
import { db } from './db'
import { TabBar } from './components/TabBar'
import { Button, Spinner } from './components/ui'
import { Toaster } from './components/Toaster'
import { toast } from './lib/toast'
import { explainSaveError } from './data/limits'
import { isNative } from './lib/native'
import { onNotificationTap } from './lib/notifications'
import { isFileUrl, readOpenedFile } from './lib/open-file'
import { UnreadableFile } from './db/backup'
import { RestoreSheet, type PendingFile } from './components/RestoreSheet'
import { HomePage } from './pages/Home'
import { HistoryPage } from './pages/History'
import { SettingsPage } from './pages/Settings'
import { WorkoutPage } from './pages/Workout'

// Recharts is heavy; load it only when Progress is opened.
const ProgressPage = lazy(() => import('./pages/Progress').then((m) => ({ default: m.ProgressPage })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false, networkMode: 'always' } },
  // A save that fails is never silent.
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      toast(`${mutation.meta?.error ?? "That didn't go through."} ${explainSaveError(err)}`, 'error', 6000)
      console.error('SplitLog: write failed', err)
    },
  }),
})

// Handles for development and simulator tests. Release builds do not include them.
if (import.meta.env.DEV || import.meta.env.MODE === 'simtest') import('./db/devtools').then((m) => m.installDevtools(db, queryClient))

/** Deep links from the widget (fitlog://start), notification taps, and files opened with "Open in SplitLog". */
function NativeRouting() {
  const nav = useNavigate()
  const [incoming, setIncoming] = useState<PendingFile | null>(null)
  useEffect(() => {
    if (!isNative) return
    let removeTap: (() => void) | undefined
    let removeUrl: { remove: () => void } | undefined
    const seen = new Set<string>()
    const openFile = async (url: string) => {
      // The launch URL and the appUrlOpen event can both report the same file.
      if (seen.has(url)) return
      seen.add(url)
      try {
        setIncoming(await readOpenedFile(url))
      } catch (e) {
        toast(e instanceof UnreadableFile ? e.message : "That file couldn't be read.", 'error', 6000)
      }
    }
    const route = (url: string) => {
      if (isFileUrl(url)) return openFile(url)
      const path = url.replace(/^fitlog:\/\//, '')
      if (path.startsWith('start')) nav('/?start=1')
      else nav(`/${path.replace(/^\/+/, '')}`)
    }
    onNotificationTap(({ workoutId }) => nav(workoutId ? `/workout/${workoutId}` : '/')).then((r) => { removeTap = r })
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appUrlOpen', ({ url }) => { route(url) }).then((h) => { removeUrl = h })
      // A file tapped while the app was closed arrives as the launch URL, before any listener exists.
      CapApp.getLaunchUrl().then((launch) => { if (launch?.url && isFileUrl(launch.url)) openFile(launch.url) }).catch(() => {})
    })
    // Simulator tests hand a file in directly (src/db/devtools.ts); release builds never fire this.
    const testOpen = (e: Event) => { if (import.meta.env.DEV || import.meta.env.MODE === 'simtest') setIncoming((e as CustomEvent<PendingFile>).detail) }
    window.addEventListener('fitlog:open-file', testOpen)
    return () => {
      removeTap?.()
      removeUrl?.remove()
      window.removeEventListener('fitlog:open-file', testOpen)
    }
  }, [nav])
  return <RestoreSheet file={incoming} onClose={() => setIncoming(null)} onImported={(_summary, workoutId) => { if (workoutId) nav(`/workout/${workoutId}`) }} />
}

/** Remount the editor per workout so its local title/notes state never carries over. */
function WorkoutRoute() {
  const { id } = useParams()
  return <WorkoutPage key={id} />
}

/** Nothing is shown until the log has been read from the device. */
function DataGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'opening' | 'ready' | 'failed'>('opening')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    db.open().then(
      () => alive && setState('ready'),
      (e) => {
        console.error('SplitLog: could not open the log', e)
        if (alive) setState('failed')
      },
    )
    return () => {
      alive = false
    }
  }, [attempt])
  if (state === 'ready') return <>{children}</>
  if (state === 'opening') return <Spinner className="pt-32" />
  return (
    <main className="min-h-dvh mx-auto max-w-sm px-6 pt-safe pb-safe flex flex-col justify-center text-center">
      <h1 className="text-[22px] font-bold">SplitLog couldn't open your log</h1>
      <p className="mt-2 text-muted text-[15px]">Your workouts are still on this iPhone. Close SplitLog completely and open it again. If this keeps happening, free up some storage space.</p>
      <Button size="lg" className="mt-6" onClick={() => { setState('opening'); setAttempt((n) => n + 1) }}>Try again</Button>
    </main>
  )
}

function TabLayout() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  return (
    <>
      {/* Content scrolls underneath the clock and battery; this keeps them readable. */}
      <div className="fixed top-0 inset-x-0 z-40 bg-bg/90 backdrop-blur-xl pointer-events-none" style={{ height: 'env(safe-area-inset-top)' }} aria-hidden="true" />
      {/* Keyed by screen so each one eases in. Coming back (also by swiping) only fades. */}
      <main key={pathname} className={`mx-auto max-w-lg px-4 pt-safe pb-tabbar ${navType === 'POP' ? 'page-back' : 'page-fade'}`}>
        <Outlet />
      </main>
      <TabBar />
    </>
  )
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

function Screens() {
  return (
    <>
      <NativeRouting />
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/progress" element={<Suspense fallback={<Spinner className="pt-32" />}><ProgressPage /></Suspense>} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/workout/:id" element={<WorkoutRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <Toaster />
        <DataGate>
          <Screens />
        </DataGate>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
