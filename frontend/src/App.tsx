import { Plus, RefreshCw, Search, UserPlus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { RunSummary } from './api'
import { IngestDialog, NewOrderDialog } from './components/Dialogs'
import { Overview } from './components/Overview'
import { ReviewDrawer } from './components/ReviewDrawer'
import { MobileNav, Sidebar } from './components/Sidebar'
import { AuditTable, OrdersTable, ReviewTable, RunsTable, TransactionsTable } from './components/Tables'
import { ToastProvider } from './components/Toast'
import { Button, IconButton, Input, Panel } from './components/ui'
import { NAV, type View } from './nav'
import { runParsed, runsByTxId } from './selectors'
import { useAgentHub } from './useAgentHub'
import { useLedger } from './useLedger'

const PAGE: Record<View, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'MoMo payments received, verified and waiting on you' },
  review: { title: 'Review queue', subtitle: 'Anomalies the agent paused for a human decision' },
  runs: { title: 'Agent runs', subtitle: 'Every reconciliation run, step by step' },
  transactions: { title: 'Transactions', subtitle: 'Every MoMo payment recorded from SMS' },
  orders: { title: 'Orders', subtitle: 'Orders that incoming payments are matched against' },
  audit: { title: 'Audit log', subtitle: 'Append-only record of agent actions and human decisions' },
}

const matches = (q: string, ...fields: (string | number | null | undefined)[]) => !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q))

export default function App() {
  const { runs, connected, ledgerVersion, refreshLedger } = useAgentHub()
  const { data, error } = useLedger(ledgerVersion)
  const [view, setView] = useState<View>('overview')
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [ingestOpen, setIngestOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [query, setQuery] = useState('')

  const awaiting = runs.filter((r) => r.status === 'AWAITING_REVIEW' && r.review)
  const openRun: RunSummary | null = runs.find((r) => r.runId === openRunId) ?? null
  const txRunIds = useMemo(() => runsByTxId(runs), [runs])
  const closeDrawer = useCallback(() => setOpenRunId(null), [])
  const q = query.trim().toLowerCase()

  const navigate = (v: View) => {
    setView(v)
    setQuery('')
    window.scrollTo({ top: 0 })
  }

  const searchable = view === 'transactions' || view === 'orders' || view === 'audit' || view === 'runs'

  let content: React.ReactNode
  switch (view) {
    case 'overview':
      content = <Overview runs={runs} data={data} onOpen={setOpenRunId} onNavigate={navigate} />
      break
    case 'review':
      content = (
        <Panel title={`${awaiting.length} paused payment${awaiting.length === 1 ? '' : 's'}`} icon={<span className="size-2 animate-pulse rounded-full bg-amber-500" />}>
          <ReviewTable runs={awaiting} onOpen={setOpenRunId} />
        </Panel>
      )
      break
    case 'runs': {
      const rows = runs.filter((r) => {
        const p = runParsed(r)
        return matches(q, r.runId, p?.senderName, p?.momoTxId, r.status, r.outcome)
      })
      content = (
        <Panel title={`${rows.length} runs`} subtitle="Held in memory since the backend started" icon={null}>
          <RunsTable runs={rows} onOpen={setOpenRunId} />
        </Panel>
      )
      break
    }
    case 'transactions': {
      const rows = data.transactions.filter((t) => matches(q, t.momoTxId, t.senderName, t.senderPhone, t.provider, t.order?.customerName))
      content = (
        <Panel title={`${rows.length} transactions`} icon={null}>
          <TransactionsTable transactions={rows} runIdFor={txRunIds} onOpen={setOpenRunId} />
        </Panel>
      )
      break
    }
    case 'orders': {
      const rows = data.orders.filter((o) => matches(q, o.customerName, o.customerPhone, o.status, o.expectedAmount))
      content = (
        <Panel title={`${rows.length} orders`} icon={null}>
          <OrdersTable orders={rows} />
        </Panel>
      )
      break
    }
    case 'audit': {
      const rows = data.audit.filter((a) => matches(q, a.event, a.message, a.runId))
      content = (
        <Panel title={`${rows.length} entries`} subtitle="Most recent 200" icon={null}>
          <AuditTable audit={rows} onOpen={setOpenRunId} knownRuns={new Set(runs.map((r) => r.runId))} />
        </Panel>
      )
      break
    }
  }

  return (
    <ToastProvider>
      <div className="min-h-screen text-slate-900">
        <Sidebar view={view} onView={navigate} reviewCount={awaiting.length} connected={connected} />
        <MobileNav view={view} onView={navigate} reviewCount={awaiting.length} connected={connected} />

        <div className="lg:pl-60">
          <main className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="hidden text-xs text-slate-400 lg:block">MoMo Hub / {NAV.find((n) => n.id === view)?.label}</p>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">{PAGE[view].title}</h1>
                <p className="mt-0.5 text-sm text-slate-500">{PAGE[view].subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {searchable && (
                  <div className="w-full sm:w-56">
                    <Input icon={Search} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
                  </div>
                )}
                <IconButton icon={RefreshCw} label="Refresh" onClick={refreshLedger} />
                {view === 'orders' && (
                  <Button variant="secondary" icon={UserPlus} onClick={() => setOrderOpen(true)}>
                    New order
                  </Button>
                )}
                <Button icon={Plus} onClick={() => setIngestOpen(true)}>
                  Ingest SMS
                </Button>
              </div>
            </header>

            {error && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">Could not load ledger: {error}</p>}
            {content}
          </main>
        </div>

        <ReviewDrawer run={openRun} onClose={closeDrawer} />
        <IngestDialog
          open={ingestOpen}
          onClose={() => setIngestOpen(false)}
          onStarted={(runId) => {
            setIngestOpen(false)
            setOpenRunId(runId)
          }}
        />
        <NewOrderDialog open={orderOpen} onClose={() => setOrderOpen(false)} onCreated={refreshLedger} />
      </div>
    </ToastProvider>
  )
}
