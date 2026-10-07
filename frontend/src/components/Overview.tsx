import { Activity, ArrowRight, CheckCircle2, Equal, Minus } from 'lucide-react'
import type { OrderStatus, RunSummary, TransactionDto } from '../api'
import { EVENT_UI } from '../eventUi'
import { cx, ghs, ORDER_STATUS, time } from '../format'
import { reconSummary, recentActivity, runsByTxId } from '../selectors'
import type { LedgerData } from '../useLedger'
import { ReviewTable, TransactionsTable } from './Tables'
import { Panel } from './ui'

function Figure({ label, value, sub, tone = 'text-slate-900' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cx('mt-0.5 truncate text-base font-semibold tracking-tight tabular-nums sm:text-2xl', tone)}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
    </div>
  )
}

const Operator = ({ icon: Icon }: { icon: typeof Minus }) => (
  <span className="hidden size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 sm:grid">
    <Icon className="size-3.5" />
  </span>
)

/** Received − Verified = Unreconciled: the one number an SME owner actually needs to see at a glance. */
function ReconStrip({ transactions, awaiting, onReview }: { transactions: TransactionDto[]; awaiting: number; onReview: () => void }) {
  const s = reconSummary(transactions)
  const balanced = s.unreconciled === 0
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="grid flex-1 grid-cols-3 items-center gap-3 sm:flex sm:gap-5">
          <Figure label="MoMo received" value={ghs(s.received)} sub={`${s.receivedCount} transaction${s.receivedCount === 1 ? '' : 's'}`} />
          <Operator icon={Minus} />
          <Figure label="Verified against orders" value={ghs(s.verified)} sub={`${s.verifiedCount} verified`} />
          <Operator icon={Equal} />
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Unreconciled</p>
            <p className={cx('mt-0.5 flex items-center gap-1.5 truncate text-base font-semibold tracking-tight tabular-nums sm:text-2xl', balanced ? 'text-emerald-600' : 'text-amber-600')}>
              {ghs(s.unreconciled)}
              {balanced && s.receivedCount > 0 && <CheckCircle2 className="size-5 shrink-0" />}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{s.receivedCount === 0 ? 'No payments yet' : balanced ? 'Everything matched' : 'Needs attention'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReview}
          disabled={!awaiting}
          className={cx(
            'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
            awaiting ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'cursor-default bg-slate-100 text-slate-400',
          )}
        >
          {awaiting ? `Review ${awaiting} payment${awaiting === 1 ? '' : 's'}` : 'Nothing to review'}
          {awaiting > 0 && <ArrowRight className="size-4" />}
        </button>
      </div>
    </section>
  )
}

const STAT_BAR: Record<OrderStatus, string> = {
  PENDING: 'bg-slate-300',
  VERIFIED: 'bg-emerald-500',
  DISCREPANCY_FLAGGED: 'bg-amber-500',
  REJECTED: 'bg-rose-500',
}

const STAT_HINT: Record<OrderStatus, string> = {
  PENDING: 'Awaiting payment',
  VERIFIED: 'Paid in full or accepted',
  DISCREPANCY_FLAGGED: 'Over / under paid',
  REJECTED: 'Payment rejected',
}

function OrderStats({ orders }: { orders: LedgerData['orders'] }) {
  const counts = orders.reduce<Partial<Record<OrderStatus, number>>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {})
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
        <div key={s} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className={cx('h-1', STAT_BAR[s])} />
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{ORDER_STATUS[s].label} orders</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{counts[s] ?? 0}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{STAT_HINT[s]}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ActivityFeed({ runs, onOpen }: { runs: RunSummary[]; onOpen: (runId: string) => void }) {
  const events = recentActivity(runs, 10)
  return (
    <Panel title="Live agent activity" icon={<Activity className="size-4 text-violet-500" />} className="h-full">
      {events.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Agent reasoning will stream here as payments arrive.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((e) => {
            const ui = EVENT_UI[e.type]
            const Icon = ui.icon
            return (
              <li key={`${e.runId}:${e.seq}`}>
                <button type="button" onClick={() => onOpen(e.runId)} className="flex w-full gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                  <Icon className={cx('mt-0.5 size-4 shrink-0', ui.color)} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] text-slate-700">{e.message}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400 tabular-nums">
                      {time(e.at)} · {ui.label}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function Overview({ runs, data, onOpen, onNavigate }: { runs: RunSummary[]; data: LedgerData; onOpen: (runId: string) => void; onNavigate: (v: 'review' | 'transactions') => void }) {
  const awaiting = runs.filter((r) => r.status === 'AWAITING_REVIEW' && r.review)
  const viewAll = (v: 'review' | 'transactions') => (
    <button type="button" onClick={() => onNavigate(v)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
      View all <ArrowRight className="size-3.5" />
    </button>
  )
  return (
    <div className="space-y-5">
      <ReconStrip transactions={data.transactions} awaiting={awaiting.length} onReview={() => onNavigate('review')} />
      <OrderStats orders={data.orders} />
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <Panel title="Needs your decision" subtitle="The agent paused these payments" icon={<span className="size-2 animate-pulse rounded-full bg-amber-500" />} actions={viewAll('review')}>
            <ReviewTable runs={awaiting.slice(0, 5)} onOpen={onOpen} />
          </Panel>
        </div>
        <div className="min-w-0 xl:col-span-4">
          <ActivityFeed runs={runs} onOpen={onOpen} />
        </div>
      </div>
      <Panel title="Recent transactions" icon={<span className="size-2 rounded-full bg-emerald-500" />} actions={viewAll('transactions')}>
        <TransactionsTable transactions={data.transactions.slice(0, 5)} runIdFor={runsByTxId(runs)} onOpen={onOpen} />
      </Panel>
    </div>
  )
}
