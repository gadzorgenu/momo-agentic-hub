import { Smartphone } from 'lucide-react'
import { useState } from 'react'
import type { OrderStatus } from './api'
import { AgentStream } from './components/AgentStream'
import { IngestPanel } from './components/IngestPanel'
import { Ledger } from './components/Ledger'
import { ReviewQueue } from './components/ReviewQueue'
import { cx, ORDER_STATUS } from './format'
import { useAgentHub } from './useAgentHub'
import { useLedger } from './useLedger'

const STAT_ACCENT: Record<OrderStatus, string> = {
  PENDING: 'border-t-slate-300',
  VERIFIED: 'border-t-emerald-500',
  DISCREPANCY_FLAGGED: 'border-t-amber-500',
  REJECTED: 'border-t-rose-500',
}

export default function App() {
  const { runs, connected, ledgerVersion, refreshLedger } = useAgentHub()
  const { data, error } = useLedger(ledgerVersion)
  const [selectedRun, setSelectedRun] = useState<string | null>(null)

  const counts = data.orders.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {})

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="grid size-9 place-items-center rounded-lg bg-amber-400 text-slate-900">
            <Smartphone className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight">MoMo Verification Hub</h1>
            <p className="text-xs text-slate-500">Agentic payment reconciliation · MTN MoMo · Telecel Cash · AT Money</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
            <div key={s} className={cx('rounded-xl border border-t-4 border-slate-200 bg-white px-4 py-3 shadow-sm', STAT_ACCENT[s])}>
              <p className="text-xs font-medium text-slate-500">{ORDER_STATUS[s].label} orders</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{counts[s] ?? 0}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <IngestPanel onStarted={setSelectedRun} />
            <ReviewQueue runs={runs} onSelect={setSelectedRun} />
          </div>
          <div className="lg:col-span-7">
            <AgentStream runs={runs} selectedId={selectedRun} onSelect={setSelectedRun} connected={connected} />
          </div>
        </div>

        <Ledger data={data} error={error} onRefresh={refreshLedger} />
      </main>
    </div>
  )
}
