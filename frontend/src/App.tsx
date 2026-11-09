import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  ChevronRight,
  CircleHelp,
  Command,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  Network,
  Pause,
  Play,
  Route as RouteIcon,
  Settings,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useApp } from './state'
import { cx } from './lib/cx'
import { Spinner } from './components/ui'
import { Dashboard } from './pages/Dashboard'
import { RoutePlanner } from './pages/RoutePlanner'
import { SimulationLab } from './pages/SimulationLab'
import { Benchmark } from './pages/Benchmark'
import { NetworkAnalysis } from './pages/NetworkAnalysis'
import { IncidentsPage } from './pages/IncidentsPage'
import { SettingsPage } from './pages/SettingsPage'
import type { PageKey } from './types'

const NAV_GROUPS: { title: string; items: { key: PageKey; label: string; icon: typeof Activity; hint?: string }[] }[] = [
  {
    title: 'Operate',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'planner', label: 'Route planner', icon: RouteIcon, hint: 'A*' },
      { key: 'simulation', label: 'Traffic simulation', icon: Activity },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { key: 'benchmark', label: 'Algorithm comparison', icon: GitCompareArrows },
      { key: 'network', label: 'Network analysis', icon: Network },
    ],
  },
  {
    title: 'Manage',
    items: [
      { key: 'incidents', label: 'Incidents', icon: TriangleAlert },
      { key: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

function LogoMark() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-signal-500/25 bg-signal-500/[0.08] shadow-[0_0_28px_-10px_rgba(67,224,176,0.65)]">
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M5 24V14l6-5 5 5 5-5 6 5v10"
          stroke="#43e0b0"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="5" cy="24" r="2.4" fill="#f5b942" />
        <circle cx="27" cy="24" r="2.4" fill="#f4796b" />
      </svg>
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { page, navigate, traffic, network } = useApp()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[68px] items-center gap-3 border-b border-white/[0.06] px-5">
        <LogoMark />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-semibold tracking-[-0.03em] text-ink-100">FlowGrid</span>
            <span className="rounded border border-white/[0.09] px-1 py-px text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              Lab
            </span>
          </div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-ink-500">Traffic route intelligence</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-5">
            <div className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-600">
              {group.title}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = page === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      navigate(item.key)
                      onNavigate?.()
                    }}
                    className={cx(
                      'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                      active
                        ? 'bg-white/[0.065] text-ink-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.055)]'
                        : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-200',
                    )}
                  >
                    <item.icon
                      size={15}
                      strokeWidth={1.8}
                      className={active ? 'text-signal-400' : 'text-ink-500 group-hover:text-ink-300'}
                    />
                    <span className="flex-1 font-medium">{item.label}</span>
                    {item.hint && (
                      <span className="mono rounded border border-white/[0.07] px-1 py-px text-[8px] text-ink-500">
                        {item.hint}
                      </span>
                    )}
                    {active && <span className="h-1 w-1 rounded-full bg-signal-400" />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="rounded-lg border border-white/[0.065] bg-ink-950/50 p-3">
          <div className="flex items-center justify-between">
            <span className="label">Engine</span>
            <span className={cx('flex items-center gap-1.5 text-[9px] font-semibold', traffic?.simulation.running ? 'text-signal-400' : 'text-ink-500')}>
              <span className={cx('h-1.5 w-1.5 rounded-full', traffic?.simulation.running ? 'bg-signal-400 live-dot' : 'bg-ink-600')} />
              {traffic?.simulation.running ? 'RUNNING' : 'PAUSED'}
            </span>
          </div>
          <div className="mono mt-2 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-ink-100">{traffic?.simulation.clock ?? '--:--'}</span>
            <span className="text-[9px] text-ink-500">SIM CLOCK</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[9px] text-ink-500">
            <span>{network?.mode_label ?? 'Synthetic network'}</span>
            <span className="mono">seed {traffic?.simulation.seed ?? 42}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 px-1 text-[9px] text-ink-600">
          <ShieldCheck size={11} />
          <span>Simulation data · not live traffic</span>
        </div>
      </div>
    </div>
  )
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { page, traffic, simulateAction, busy } = useApp()
  const current = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === page)
  const running = traffic?.simulation.running ?? false
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
      <div className="flex h-[68px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button className="btn h-9 w-9 p-0 lg:hidden" onClick={onMenu} aria-label="Open navigation">
          <Menu size={16} />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <span className="hidden text-ink-500 sm:inline">FlowGrid</span>
          <ChevronRight size={12} className="hidden text-ink-600 sm:inline" />
          <span className="truncate font-medium text-ink-200">{current?.label ?? 'Dashboard'}</span>
        </div>
        <div className="flex-1" />
        <div className="hidden items-center gap-2 md:flex">
          <span className="chip border-white/[0.08] bg-white/[0.03] text-ink-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Synthetic network
          </span>
          <div className="mono flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-ink-300">
            <span className={cx('h-1.5 w-1.5 rounded-full', running ? 'bg-signal-400 live-dot' : 'bg-ink-600')} />
            {traffic?.simulation.clock ?? '--:--'}
            <span className="text-ink-600">·</span>
            <span className="text-ink-500">tick {traffic?.simulation.tick ?? 0}</span>
          </div>
        </div>
        <button
          className={cx('btn h-9 px-3', running ? 'btn-amber' : 'btn-primary')}
          onClick={() => simulateAction(running ? 'pause' : 'start')}
          disabled={busy === 'sim-start' || busy === 'sim-pause'}
        >
          {busy === 'sim-start' || busy === 'sim-pause' ? <Spinner /> : running ? <Pause size={13} /> : <Play size={13} />}
          <span className="hidden sm:inline">{running ? 'Pause' : 'Start'} simulation</span>
          <span className="sm:hidden">{running ? 'Pause' : 'Start'}</span>
        </button>
        <button className="btn hidden h-9 w-9 p-0 xl:inline-flex" aria-label="Help" title="All figures are simulation estimates.">
          <CircleHelp size={15} />
        </button>
      </div>
    </header>
  )
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={cx('fixed inset-0 z-50 lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={cx('absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <aside
        className={cx(
          'absolute inset-y-0 left-0 w-[270px] border-r border-white/[0.08] bg-ink-900 transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button className="btn absolute right-3 top-4 h-8 w-8 p-0" onClick={onClose} aria-label="Close navigation">
          <X size={14} />
        </button>
        <Sidebar onNavigate={onClose} />
      </aside>
    </div>
  )
}

function ToastView() {
  const { toast, dismissToast } = useApp()
  if (!toast) return null
  return (
    <div className="toast-in fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0">
      <div
        className={cx(
          'flex items-start gap-3 rounded-xl border bg-ink-850/95 p-3.5 shadow-2xl backdrop-blur-xl',
          toast.kind === 'error'
            ? 'border-coral-500/30'
            : toast.kind === 'success'
              ? 'border-signal-500/30'
              : 'border-white/[0.12]',
        )}
      >
        <span
          className={cx(
            'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border',
            toast.kind === 'error'
              ? 'border-coral-500/30 bg-coral-500/10 text-coral-400'
              : toast.kind === 'success'
                ? 'border-signal-500/30 bg-signal-500/10 text-signal-400'
                : 'border-white/[0.1] bg-white/[0.04] text-ink-300',
          )}
        >
          {toast.kind === 'error' ? <TriangleAlert size={13} /> : toast.kind === 'success' ? <ShieldCheck size={13} /> : <Command size={13} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            {toast.kind === 'error' ? 'Action failed' : toast.kind === 'success' ? 'Complete' : 'Notice'}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-ink-200">{toast.message}</div>
        </div>
        <button className="text-ink-500 hover:text-ink-200" onClick={dismissToast} aria-label="Dismiss">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="relative">
        <div className="absolute inset-0 -z-10 blur-2xl" style={{ background: 'radial-gradient(circle, rgba(67,224,176,0.18), transparent 70%)' }} />
        <div className="grid h-16 w-16 place-items-center rounded-2xl border border-signal-500/20 bg-ink-850">
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M5 24V14l6-5 5 5 5-5 6 5v10" stroke="#43e0b0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="5" cy="24" r="2.2" fill="#f5b942" />
            <circle cx="27" cy="24" r="2.2" fill="#f4796b" />
          </svg>
        </div>
      </div>
      <div className="mt-5 text-sm font-semibold tracking-[-0.02em]">FlowGrid</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-ink-500">Building traffic graph</div>
      <div className="mt-5 flex items-center gap-2 text-[11px] text-ink-400">
        <Spinner size={13} />
        Loading synthetic network and route engine…
      </div>
    </div>
  )
}

const PAGES: Record<PageKey, () => ReactNode> = {
  dashboard: () => <Dashboard />,
  planner: () => <RoutePlanner />,
  simulation: () => <SimulationLab />,
  benchmark: () => <Benchmark />,
  network: () => <NetworkAnalysis />,
  incidents: () => <IncidentsPage />,
  settings: () => <SettingsPage />,
}

export default function App() {
  const { page, loading, network } = useApp()
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    if (document.documentElement.clientWidth < 1024) setDrawer(false)
  }, [page])
  if (loading && !network) return <BootScreen />
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/[0.07] bg-ink-900/95 lg:block">
        <Sidebar />
      </aside>
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />
      <div className="lg:pl-[248px]">
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="mx-auto w-full max-w-[1620px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {PAGES[page]()}
          <footer className="mt-10 flex flex-col gap-2 border-t border-white/[0.055] py-5 text-[10px] text-ink-600 sm:flex-row sm:items-center sm:justify-between">
            <span>FlowGrid 1.0 · Graph theory traffic lab · synthetic network</span>
            <span className="mono">Dijkstra / A* / Yen K-shortest / Ant colony</span>
          </footer>
        </main>
      </div>
      <ToastView />
    </div>
  )
}
