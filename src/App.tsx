import { lazy, Suspense, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router'
import { AuthProvider, useAuth } from './lib/auth'
import { TabBar } from './components/TabBar'
import { Spinner } from './components/ui'
import { isNative } from './lib/native'
import { onNotificationTap } from './lib/notifications'
import { AuthPage } from './pages/Auth'
import { HomePage } from './pages/Home'
import { HistoryPage } from './pages/History'
import { SettingsPage } from './pages/Settings'
import { WorkoutPage } from './pages/Workout'

// Recharts is heavy; load it only when Progress is opened.
const ProgressPage = lazy(() => import('./pages/Progress').then((m) => ({ default: m.ProgressPage })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

/** Deep links from the widget (fitlog://start) and notification taps. */
function NativeRouting() {
  const nav = useNavigate()
  useEffect(() => {
    if (!isNative) return
    let removeTap: (() => void) | undefined
    let removeUrl: { remove: () => void } | undefined
    onNotificationTap(({ workoutId }) => nav(workoutId ? `/workout/${workoutId}` : '/')).then((r) => { removeTap = r })
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appUrlOpen', ({ url }) => {
        const path = url.replace(/^fitlog:\/\//, '')
        if (path.startsWith('start')) nav('/?start=1')
        else nav(`/${path.replace(/^\/+/, '')}`)
      }).then((h) => { removeUrl = h })
    })
    return () => {
      removeTap?.()
      removeUrl?.remove()
    }
  }, [nav])
  return null
}

function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner className="pt-32" />
  if (!user) return <Navigate to="/auth" replace />
  return <Outlet />
}

function TabLayout() {
  return (
    <>
      <main className="mx-auto max-w-lg px-4 pt-safe pb-tabbar">
        <Outlet />
      </main>
      <TabBar />
    </>
  )
}

function PublicOnly() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner className="pt-32" />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <NativeRouting />
          <Routes>
            <Route element={<PublicOnly />}>
              <Route path="/auth" element={<AuthPage />} />
            </Route>
            <Route element={<Protected />}>
              <Route element={<TabLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/progress" element={<Suspense fallback={<Spinner className="pt-32" />}><ProgressPage /></Suspense>} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="/workout/:id" element={<WorkoutPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
