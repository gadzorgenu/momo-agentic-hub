import { BellRing, Check, HandCoins, Loader2, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { api, type ReviewDecision, type RunSummary } from '../api'
import { cx, ghs, OUTCOME, time } from '../format'
import { Badge, Panel } from './ui'

const DECISION_UI: Record<ReviewDecision, { icon: typeof Check; className: string }> = {
  ACCEPT: { icon: Check, className: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  REQUEST_BALANCE: { icon: HandCoins, className: 'bg-amber-500 text-white hover:bg-amber-600' },
  REJECT: { icon: X, className: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50' },
}

function decisionLabel(decision: ReviewDecision, run: RunSummary) {
  if (decision === 'ACCEPT') return run.review?.outcome === 'OVERPAYMENT' ? 'Accept Overpayment' : 'Accept Underpayment'
  if (decision === 'REQUEST_BALANCE') return 'Request Balance'
  return 'Reject Transaction'
}

function ReviewCard({ run, onSelect }: { run: RunSummary; onSelect: () => void }) {
  const review = run.review!
  const [pending, setPending] = useState<ReviewDecision | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decide = async (decision: ReviewDecision) => {
    setPending(decision)
    setError(null)
    try {
      await api.decide(run.runId, { decision })
      // The run leaves the queue when the review_resolved event arrives over SSE.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPending(null)
    }
  }

  const p = review.parsed
  const rows: [string, React.ReactNode][] = [
    ['Sender', `${p.senderName} · ${p.senderPhone}`],
    ['Tx ID', <span className="font-mono">{p.momoTxId}</span>],
    ['Paid', ghs(p.amount)],
    ['Expected', review.order ? `${ghs(review.order.expectedAmount)} (${review.order.customerName})` : '—'],
  ]
  if (review.difference !== null) {
    rows.push([
      review.difference < 0 ? 'Shortfall' : 'Excess',
      <span className={cx('font-semibold', review.difference < 0 ? 'text-amber-700' : 'text-sky-700')}>{ghs(Math.abs(review.difference))}</span>,
    ])
  }

  return (
    <li className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge {...OUTCOME[review.outcome]} />
          <p className="mt-1.5 text-sm font-medium text-slate-800">{review.reason}</p>
        </div>
        <button type="button" onClick={onSelect} className="shrink-0 text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">
          {time(run.createdAt)} · trace
        </button>
      </div>
      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="min-w-0 truncate text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      {error && <p className="mb-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {review.allowedDecisions.map((d) => {
          const { icon: Icon, className } = DECISION_UI[d]
          return (
            <button
              key={d}
              type="button"
              disabled={pending !== null}
              onClick={() => void decide(d)}
              className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50', className)}
            >
              {pending === d ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
              {decisionLabel(d, run)}
            </button>
          )
        })}
      </div>
    </li>
  )
}

export function ReviewQueue({ runs, onSelect }: { runs: RunSummary[]; onSelect: (runId: string) => void }) {
  const awaiting = runs.filter((r) => r.status === 'AWAITING_REVIEW' && r.review)
  return (
    <Panel
      title="Needs your decision"
      icon={<BellRing className={cx('size-4', awaiting.length ? 'animate-pulse text-amber-500' : 'text-slate-400')} />}
      actions={awaiting.length > 0 && <Badge label={`${awaiting.length} paused`} tone="amber" />}
    >
      {awaiting.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
          <ShieldCheck className="size-4 text-emerald-500" />
          No paused runs. Anomalies will appear here.
        </p>
      ) : (
        <ul className="space-y-3 p-3">
          {awaiting.map((r) => (
            <ReviewCard key={r.runId} run={r} onSelect={() => onSelect(r.runId)} />
          ))}
        </ul>
      )}
    </Panel>
  )
}
