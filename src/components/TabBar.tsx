import { NavLink } from 'react-router'
import { Icon } from './ui'

const tabs = [
  { to: '/', label: 'Home', icon: Icon.Home },
  { to: '/history', label: 'History', icon: Icon.Calendar },
  { to: '/progress', label: 'Progress', icon: Icon.Chart },
  { to: '/settings', label: 'Settings', icon: Icon.Settings },
]

export function TabBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-bg/85 backdrop-blur-xl border-t border-border/60 pb-safe">
      <div className="mx-auto max-w-lg grid grid-cols-4 h-[64px]">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${isActive ? 'text-accent' : 'text-faint'}`}
          >
            <t.icon />
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
