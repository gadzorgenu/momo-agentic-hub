import { ChevronRight, Inbox, type LucideIcon } from 'lucide-react'
import type { AuditLogDto, OrderDto, RunSummary, TransactionDto } from '../api'
import { cx, dateTime, ghs, ORDER_STATUS, OUTCOME, RUN_STATUS, time } from '../format'
import { OUTCOME_DOT, runParsed } from '../selectors'
import { Avatar, EmptyState } from './ui'

const ORDER_DOT = { PENDING: 'bg-slate-400', VERIFIED: 'bg-emerald-500', DISCREPANCY_FLAGGED: 'bg-amber-500', REJECTED: 'bg-rose-500' } as const

export function StatusDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-slate-700">
      <span className={cx('size-2 rounded-full', className)} />
      {label}
    </span>
  )
}

const PROVIDER_PILL: Record<string, string> = {
  MTN: 'bg-amber-100 text-amber-900',
  TELECEL: 'bg-rose-100 text-rose-800',
  AT: 'bg-sky-100 text-sky-800',
}

export function ProviderPill({ provider }: { provider: string | null }) {
  return (
    <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold', PROVIDER_PILL[provider ?? ''] ?? 'bg-slate-100 text-slate-600')}>{provider ?? '—'}</span>
  )
}

const th = 'px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap'
const td = 'px-4 py-3 text-sm text-slate-700 whitespace-nowrap'

function DataTable({
  head,
  children,
  empty,
  emptyIcon = Inbox,
  emptyTitle = 'Nothing here yet',
  emptyText,
  minWidth = '44rem',
}: {
  head: string[]
  children: React.ReactNode
  empty: boolean
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyText?: string
  minWidth?: string
}) {
  if (empty) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyText} />
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ minWidth }}>
        <thead className="border-b border-slate-100 bg-slate-50/70">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}

const clickableRow = 'cursor-pointer transition hover:bg-amber-50/40 focus-visible:bg-amber-50/60 focus-visible:outline-none'

function rowProps(onOpen?: () => void) {
  if (!onOpen) return {}
  return {
    className: clickableRow,
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && onOpen(),
  }
}

export function ReviewTable({ runs, onOpen }: { runs: RunSummary[]; onOpen: (runId: string) => void }) {
  return (
    <DataTable
      head={['Anomaly', 'Sender', 'MoMo Tx ID', 'Paid', 'Expected', 'Difference', 'Flagged', '']}
      empty={runs.length === 0}
      emptyIcon={Inbox}
      emptyTitle="No payments waiting for review"
      emptyText="Underpayments, overpayments and unmatched payments pause here for your decision."
    >
      {runs.map((r) => {
        const review = r.review!
        const p = review.parsed
        return (
          <tr key={r.runId} {...rowProps(() => onOpen(r.runId))}>
            <td className={td}>
              <StatusDot className={OUTCOME_DOT[review.outcome]} label={OUTCOME[review.outcome].label} />
            </td>
            <td className={td}>
              <span className="flex items-center gap-2">
                <Avatar name={p.senderName} size={26} />
                <span className="font-medium text-slate-900">{p.senderName}</span>
              </span>
            </td>
            <td className={cx(td, 'font-mono text-xs')}>{p.momoTxId}</td>
            <td className={cx(td, 'tabular-nums')}>{ghs(p.amount)}</td>
            <td className={cx(td, 'tabular-nums text-slate-500')}>{review.order ? ghs(review.order.expectedAmount) : '—'}</td>
            <td className={cx(td, 'font-medium tabular-nums', review.difference === null ? 'text-slate-400' : review.difference < 0 ? 'text-amber-700' : 'text-sky-700')}>
              {review.difference === null ? '—' : `${review.difference < 0 ? '−' : '+'}${ghs(Math.abs(review.difference))}`}
            </td>
            <td className={cx(td, 'text-slate-500 tabular-nums')}>{time(r.createdAt)}</td>
            <td className={cx(td, 'w-8 text-slate-400')}>
              <ChevronRight className="size-4" />
            </td>
          </tr>
        )
      })}
    </DataTable>
  )
}

export function TransactionsTable({ transactions, runIdFor, onOpen }: { transactions: TransactionDto[]; runIdFor: Map<string, string>; onOpen: (runId: string) => void }) {
  return (
    <DataTable
      head={['MoMo Tx ID', 'Network', 'Sender', 'Paid', 'Order', 'Received']}
      empty={transactions.length === 0}
      emptyTitle="No transactions yet"
      emptyText="Ingest a MoMo SMS to record the first payment."
    >
      {transactions.map((t) => {
        const runId = runIdFor.get(t.momoTxId)
        const diff = t.order ? t.amountPaid - t.order.expectedAmount : null
        return (
          <tr key={t.id} {...rowProps(runId ? () => onOpen(runId) : undefined)} title={t.rawSms}>
            <td className={cx(td, 'font-mono text-xs')}>{t.momoTxId}</td>
            <td className={td}>
              <ProviderPill provider={t.provider} />
            </td>
            <td className={td}>
              <span className="flex items-center gap-2">
                <Avatar name={t.senderName} size={26} />
                <span>
                  <span className="block font-medium text-slate-900">{t.senderName}</span>
                  <span className="block font-mono text-[11px] text-slate-400">{t.senderPhone}</span>
                </span>
              </span>
            </td>
            <td className={cx(td, 'tabular-nums')}>
              {ghs(t.amountPaid)}
              {diff !== null && Math.abs(diff) >= 0.005 && (
                <span className={cx('ml-1.5 text-xs', diff < 0 ? 'text-amber-700' : 'text-sky-700')}>
                  {diff > 0 ? '+' : '−'}
                  {Math.abs(diff).toFixed(2)}
                </span>
              )}
            </td>
            <td className={td}>
              {t.order ? (
                <span className="flex flex-col gap-0.5">
                  <span className="text-slate-900">{t.order.customerName}</span>
                  <StatusDot className={ORDER_DOT[t.order.status]} label={ORDER_STATUS[t.order.status].label} />
                </span>
              ) : (
                <StatusDot className="bg-slate-300" label="No order" />
              )}
            </td>
            <td className={cx(td, 'text-slate-500')}>{dateTime(t.transactedAt ?? t.createdAt)}</td>
          </tr>
        )
      })}
    </DataTable>
  )
}

export function OrdersTable({ orders }: { orders: OrderDto[] }) {
  return (
    <DataTable head={['Customer', 'Phone', 'Expected', 'Status', 'Created', 'Updated']} empty={orders.length === 0} emptyTitle="No orders yet" emptyText="Create an order so incoming payments have something to match.">
      {orders.map((o) => (
        <tr key={o.id}>
          <td className={td}>
            <span className="flex items-center gap-2">
              <Avatar name={o.customerName} size={26} />
              <span className="font-medium text-slate-900">{o.customerName}</span>
            </span>
          </td>
          <td className={cx(td, 'font-mono text-xs')}>{o.customerPhone}</td>
          <td className={cx(td, 'tabular-nums')}>{ghs(o.expectedAmount)}</td>
          <td className={td}>
            <StatusDot className={ORDER_DOT[o.status]} label={ORDER_STATUS[o.status].label} />
          </td>
          <td className={cx(td, 'text-slate-500')}>{dateTime(o.createdAt)}</td>
          <td className={cx(td, 'text-slate-500')}>{dateTime(o.updatedAt)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

export function RunsTable({ runs, onOpen }: { runs: RunSummary[]; onOpen: (runId: string) => void }) {
  return (
    <DataTable head={['Run', 'Sender', 'Amount', 'Status', 'Outcome', 'Steps', 'Started', '']} empty={runs.length === 0} emptyTitle="No agent runs yet" emptyText="Each ingested SMS starts a run you can trace step by step.">
      {runs.map((r) => {
        const p = runParsed(r)
        return (
          <tr key={r.runId} {...rowProps(() => onOpen(r.runId))}>
            <td className={cx(td, 'font-mono text-[11px] text-slate-400')}>{r.runId.slice(0, 8)}</td>
            <td className={cx(td, 'font-medium text-slate-900')}>{p?.senderName ?? '…'}</td>
            <td className={cx(td, 'tabular-nums')}>{p ? ghs(p.amount) : '—'}</td>
            <td className={td}>
              <StatusDot
                className={{ RUNNING: 'animate-pulse bg-sky-500', AWAITING_REVIEW: 'bg-amber-500', COMPLETED: 'bg-emerald-500', FAILED: 'bg-rose-500' }[r.status]}
                label={RUN_STATUS[r.status].label}
              />
            </td>
            <td className={td}>{r.outcome ? <StatusDot className={OUTCOME_DOT[r.outcome]} label={OUTCOME[r.outcome].label} /> : <span className="text-slate-400">—</span>}</td>
            <td className={cx(td, 'tabular-nums text-slate-500')}>{r.events.length}</td>
            <td className={cx(td, 'tabular-nums text-slate-500')}>{time(r.createdAt)}</td>
            <td className={cx(td, 'w-8 text-slate-400')}>
              <ChevronRight className="size-4" />
            </td>
          </tr>
        )
      })}
    </DataTable>
  )
}

export function AuditTable({ audit, onOpen, knownRuns }: { audit: AuditLogDto[]; onOpen: (runId: string) => void; knownRuns: Set<string> }) {
  return (
    <DataTable head={['Time', 'Event', 'Detail', 'Run']} empty={audit.length === 0} emptyTitle="Audit log is empty" minWidth="48rem">
      {audit.map((a) => (
        <tr key={a.id} {...rowProps(knownRuns.has(a.runId) ? () => onOpen(a.runId) : undefined)}>
          <td className={cx(td, 'text-slate-500 tabular-nums')}>{dateTime(a.createdAt)}</td>
          <td className={td}>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{a.event}</code>
          </td>
          <td className={cx(td, 'max-w-lg truncate')} title={a.message}>
            {a.message}
          </td>
          <td className={cx(td, 'font-mono text-[11px] text-slate-400')}>{a.runId.slice(0, 8)}</td>
        </tr>
      ))}
    </DataTable>
  )
}
