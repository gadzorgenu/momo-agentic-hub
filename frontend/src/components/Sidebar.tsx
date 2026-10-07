import { Smartphone } from 'lucide-react'
import { cx } from '../format'
import { NAV, type View } from '../nav'

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-amber-400 text-slate-900">
        <Smartphone className="size-4" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">MoMo Hub</p>
        <p className="text-[11px] text-slate-500">Payment verification</p>
      </div>
    </div>
  )
}

function CountBadge({ count, active }: { count: number; active: boolean }) {
  if (!count) return null
  return (
    <span className={cx('ml-auto rounded-full px-1.5 text-[11px] font-semibold tabular-nums', active ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800')}>
      {count}
    </span>
  )
}

export function Sidebar({ view, onView, reviewCount, connected }: { view: View; onView: (v: View) => void; reviewCount: number; connected: boolean }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="border-b border-slate-100 px-4 py-4">
        <Logo />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {(['Reconcile', 'Records'] as const).map((group) => (
          <div key={group}>
            <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{group}</p>
            <ul className="space-y-0.5">
              {NAV.filter((n) => n.group === group).map(({ id, label, icon: Icon }) => {
                const active = view === id
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onView(id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
                        active ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      <Icon className={cx('size-4', active ? 'text-amber-500' : 'text-slate-400')} />
                      {label}
                      {id === 'review' && <CountBadge count={reviewCount} active={active} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-xs">
        <p className="flex items-center gap-2 text-slate-600">
          <span className={cx('size-2 rounded-full', connected ? 'animate-pulse bg-emerald-500' : 'bg-slate-300')} />
          {connected ? 'Agent stream live' : 'Reconnecting…'}
        </p>
        <p className="text-slate-400">MTN MoMo · Telecel Cash · AT Money</p>
      </div>
    </aside>
  )
}

/** Compact top bar + scrollable tabs used below the lg breakpoint, where the sidebar is hidden. */
export function MobileNav({ view, onView, reviewCount, connected }: { view: View; onView: (v: View) => void; reviewCount: number; connected: boolean }) {
  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Logo />
        <span className={cx('size-2 rounded-full', connected ? 'animate-pulse bg-emerald-500' : 'bg-slate-300')} aria-label={connected ? 'Live' : 'Reconnecting'} />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onView(id)}
            className={cx(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
              view === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {id === 'review' && reviewCount > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-900">{reviewCount}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
