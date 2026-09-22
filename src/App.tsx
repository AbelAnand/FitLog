import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './lib/auth'
import { TabBar } from './components/TabBar'
import { Spinner } from './components/ui'
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
