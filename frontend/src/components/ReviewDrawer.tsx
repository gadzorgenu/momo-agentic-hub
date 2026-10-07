import { ArrowRight, Check, ChevronDown, CircleAlert, HandCoins, Loader2, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type ReviewDecision, type ReviewRequest, type RunSummary } from '../api'
import { cx, dateTime, ghs, OUTCOME, RUN_STATUS, time } from '../format'
import { runFinalMessage, runParsed, runThoughts } from '../selectors'
import { RunTimeline } from './RunTimeline'
import { useToast } from '../toast-context'
import { Badge, Button, IconButton } from './ui'

const DECISION_LABEL = (d: ReviewDecision, outcome: ReviewRequest['outcome']) =>
  d === 'ACCEPT' ? (outcome === 'OVERPAYMENT' ? 'Accept Overpayment' : 'Accept Underpayment') : d === 'REQUEST_BALANCE' ? 'Request Balance' : 'Reject Transaction'

/** One "expected → received" row, in the style of a field-by-field reconciliation diff. */
function CompareRow({ label, expected, actual, ok }: { label: string; expected: string; actual: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm">
          <span className={cx('truncate', ok ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300')}>{expected}</span>
          {!ok && (
            <>
              <ArrowRight className="size-3.5 shrink-0 text-slate-400" />
              <span className="truncate font-medium text-slate-900">{actual}</span>
            </>
          )}
        </p>
      </div>
      <span className={cx('grid size-6 shrink-0 place-items-center rounded-md', ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
        {ok ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}
      </span>
    </div>
  )
}

function Comparison({ review }: { review: ReviewRequest }) {
  const p = review.parsed
  const o = review.order
  if (!o) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2.5 text-sm text-rose-800">
        No pending order matches this sender, phone number or amount.
      </div>
    )
  }
  const samePhone = o.customerPhone.replace(/\D/g, '').endsWith(p.senderPhone.slice(1))
  const sameName = o.customerName.toLowerCase() === p.senderName.toLowerCase()
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      <CompareRow label="Customer" expected={o.customerName} actual={p.senderName} ok={sameName} />
      <CompareRow label="Phone" expected={o.customerPhone} actual={p.senderPhone} ok={samePhone} />
      <CompareRow label="Amount" expected={ghs(o.expectedAmount)} actual={ghs(p.amount)} ok={review.difference === 0} />
      {review.difference !== null && review.difference !== 0 && (
        <div className="flex items-center justify-between bg-slate-50 px-3 py-2.5 text-sm">
          <span className="text-slate-600">{review.difference < 0 ? 'Shortfall' : 'Excess'}</span>
          <span className={cx('font-semibold tabular-nums', review.difference < 0 ? 'text-amber-700' : 'text-sky-700')}>
            {review.difference < 0 ? '−' : '+'}
            {ghs(Math.abs(review.difference))}
          </span>
        </div>
      )}
    </div>
  )
}

function DecisionFooter({ run, review }: { run: RunSummary; review: ReviewRequest }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<ReviewDecision | null>(null)

  const decide = async (decision: ReviewDecision) => {
    setPending(decision)
    try {
      await api.decide(run.runId, { decision, note: note.trim() || undefined })
      toast({ variant: 'success', title: 'Decision recorded', description: `${DECISION_LABEL(decision, review.outcome)} · the agent is resuming` })
    } catch (err) {
      toast({ variant: 'error', title: 'Could not record decision', description: err instanceof Error ? err.message : String(err) })
      setPending(null)
    }
  }

  const has = (d: ReviewDecision) => review.allowedDecisions.includes(d)
  return (
    <footer className="space-y-3 border-t border-slate-200 bg-white px-5 py-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Note for the audit log (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Customer confirmed MoMo cash-out fee"
          className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
      </label>
      {has('ACCEPT') && (
        <Button className="w-full" size="lg" icon={Check} loading={pending === 'ACCEPT'} disabled={pending !== null} onClick={() => void decide('ACCEPT')}>
          {DECISION_LABEL('ACCEPT', review.outcome)}
        </Button>
      )}
      <div className="flex gap-2">
        {has('REQUEST_BALANCE') && (
          <Button className="flex-1" variant="warning" icon={HandCoins} loading={pending === 'REQUEST_BALANCE'} disabled={pending !== null} onClick={() => void decide('REQUEST_BALANCE')}>
            Request Balance
          </Button>
        )}
        {has('REJECT') && (
          <Button className="flex-1" variant="danger" icon={X} loading={pending === 'REJECT'} disabled={pending !== null} onClick={() => void decide('REJECT')}>
            Reject Transaction
          </Button>
        )}
      </div>
    </footer>
  )
}

/** Right-hand slide-over showing one run: the payment, the comparison, the agent's reasoning and, if paused, the decision. */
export function ReviewDrawer({ run, onClose }: { run: RunSummary | null; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [traceOpen, setTraceOpen] = useState(false)

  useEffect(() => {
    if (!run) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [run, onClose])

  if (!run) return null
  const parsed = runParsed(run)
  const review = run.status === 'AWAITING_REVIEW' ? run.review : null
  const thoughts = runThoughts(run)
  const running = run.status === 'RUNNING'
  const final = runFinalMessage(run)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" style={{ animation: 'fade-in 150ms ease-out' }} onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl outline-none"
        style={{ animation: 'drawer-in 200ms ease-out' }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="drawer-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {review ? <CircleAlert className="size-4 text-amber-500" /> : null}
              {review ? 'Review payment' : 'Run details'}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge {...RUN_STATUS[run.status]} />
              {run.outcome && <Badge {...OUTCOME[run.outcome]} />}
            </div>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {parsed ? (
            <section>
              <p className="text-xs text-slate-500">Amount received</p>
              <p className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{ghs(parsed.amount)}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-slate-500">From</dt>
                  <dd className="truncate font-medium text-slate-800">{parsed.senderName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="font-mono text-slate-800">{parsed.senderPhone}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">MoMo Tx ID</dt>
                  <dd className="truncate font-mono text-slate-800">{parsed.momoTxId}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Network</dt>
                  <dd className="text-slate-800">
                    {parsed.provider} · {dateTime(parsed.transactedAt ?? run.createdAt)}
                  </dd>
                </div>
              </dl>
            </section>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              {running && <Loader2 className="size-4 animate-spin" />}
              {running ? 'Reading the SMS…' : 'No payment details were extracted.'}
            </p>
          )}

          {review && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Order vs. payment</h3>
              <Comparison review={review} />
            </section>
          )}

          {!review && final && (
            <p className={cx('rounded-lg px-3 py-2.5 text-sm', run.status === 'FAILED' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800')}>{final}</p>
          )}

          <section className="rounded-xl border border-violet-100 bg-gradient-to-b from-violet-50/70 to-white p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
              <Sparkles className="size-3.5" /> Agent copilot
              {running && <Loader2 className="ml-auto size-3.5 animate-spin text-violet-400" />}
            </h3>
            {thoughts.length ? (
              <ul className="space-y-2 text-[13px] leading-relaxed text-slate-700">
                {thoughts.map((t) => (
                  <li key={t.seq} className="flex gap-2">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-violet-300" />
                    <span>{t.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-slate-500">The agent is starting…</p>
            )}
          </section>

          <section>
            <button
              type="button"
              onClick={() => setTraceOpen((o) => !o)}
              className="flex w-full items-center justify-between text-xs font-semibold tracking-wide text-slate-500 uppercase hover:text-slate-800"
              aria-expanded={traceOpen || running}
            >
              Execution trace · {run.events.length} events
              <ChevronDown className={cx('size-4 transition', (traceOpen || running) && 'rotate-180')} />
            </button>
            {(traceOpen || running) && (
              <div className="mt-3">
                <RunTimeline events={run.events} />
              </div>
            )}
          </section>

          <p className="font-mono text-[11px] text-slate-400">
            run {run.runId} · started {time(run.createdAt)}
          </p>
        </div>

        {review && <DecisionFooter key={run.runId} run={run} review={review} />}
      </div>
    </div>
  )
}
