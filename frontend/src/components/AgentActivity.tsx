import { Activity, ArrowRight } from 'lucide-react'
import type { RunSummary } from '../api'
import { cx, ghs, time } from '../format'
import { OUTCOME_DOT, runParsed } from '../selectors'
import { Avatar, Panel } from './ui'

const STAGES = ['Parse', 'Check', 'Match', 'Resolve'] as const

// Graph nodes mapped onto the four stages shown in the progress bar.
const NODE_STAGE: Record<string, number> = {
  parse_sms: 0,
  check_duplicate: 1,
  match_order: 2,
  settle_payment: 3,
  flag_discrepancy: 3,
  human_review: 3,
  apply_decision: 3,
}

/** Furthest stage the run has reached, from the nodes it has started. */
function runStage(run: RunSummary): number {
  return run.events.reduce((max, e) => (e.node && e.type === 'node_started' ? Math.max(max, NODE_STAGE[e.node] ?? 0) : max), 0)
}

function segmentClass(run: RunSummary, i: number, stage: number): string {
  if (run.status === 'COMPLETED') {
    // Duplicates stop after "Check"; the skipped stages stay empty.
    if (run.outcome === 'DUPLICATE' && i > stage) return 'bg-slate-200'
    return run.outcome ? OUTCOME_DOT[run.outcome] : 'bg-emerald-500'
  }
  if (i < stage) return 'bg-emerald-500'
  if (i > stage) return 'bg-slate-200'
  if (run.status === 'AWAITING_REVIEW') return 'bg-amber-500'
  if (run.status === 'FAILED') return 'bg-rose-500'
  return 'animate-pulse bg-sky-400'
}

/** The agent's most recent human-readable status line for the run. */
function latestMessage(run: RunSummary): string {
  for (let i = run.events.length - 1; i >= 0; i--) {
    const e = run.events[i]
    if (e.type === 'run_completed' || e.type === 'run_failed' || e.type === 'review_required' || e.type === 'node_started') return e.message
  }
  return 'Starting…'
}

const STATUS_LABEL: Record<RunSummary['status'], { text: string; className: string }> = {
  RUNNING: { text: 'Working', className: 'text-sky-600' },
  AWAITING_REVIEW: { text: 'Needs you', className: 'text-amber-600' },
  COMPLETED: { text: 'Done', className: 'text-emerald-600' },
  FAILED: { text: 'Failed', className: 'text-rose-600' },
}

function RunRow({ run, onOpen }: { run: RunSummary; onOpen: () => void }) {
  const parsed = runParsed(run)
  const stage = runStage(run)
  const status = STATUS_LABEL[run.status]
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
        <Avatar name={parsed?.senderName ?? '?'} size={30} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-slate-900">
              {parsed?.senderName ?? 'Reading SMS…'}
              {parsed && <span className="ml-1.5 font-normal text-slate-500 tabular-nums">{ghs(parsed.amount)}</span>}
            </span>
            <span className={cx('shrink-0 text-[11px] font-medium', status.className)}>{status.text}</span>
          </span>
          <span className="mt-1.5 flex gap-1" aria-label={`Stage ${stage + 1} of ${STAGES.length}: ${STAGES[stage]}`}>
            {STAGES.map((s, i) => (
              <span key={s} title={s} className={cx('h-1 flex-1 rounded-full', segmentClass(run, i, stage))} />
            ))}
          </span>
          <span className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] text-slate-500">
            <span className="truncate">{latestMessage(run)}</span>
            <span className="shrink-0 tabular-nums">{time(run.createdAt)}</span>
          </span>
        </span>
      </button>
    </li>
  )
}

// Priority order: what needs a human first, then live work, then failures, then history.
const GROUPS: { status: RunSummary['status']; label: string; dot: string; oldestFirst: boolean }[] = [
  { status: 'AWAITING_REVIEW', label: 'Needs you', dot: 'bg-amber-500', oldestFirst: true },
  { status: 'RUNNING', label: 'Working', dot: 'animate-pulse bg-sky-500', oldestFirst: false },
  { status: 'FAILED', label: 'Failed', dot: 'bg-rose-500', oldestFirst: false },
  { status: 'COMPLETED', label: 'Done', dot: 'bg-emerald-500', oldestFirst: false },
]

/** One compact row per run, ranked by priority, in a scrollable list; full reasoning lives in the run drawer. */
export function AgentActivity({ runs, onOpen, onViewAll }: { runs: RunSummary[]; onOpen: (runId: string) => void; onViewAll: () => void }) {
  const working = runs.filter((r) => r.status === 'RUNNING').length
  const groups = GROUPS.map((g) => {
    const items = runs.filter((r) => r.status === g.status)
    // Runs arrive newest first; the review queue is served longest-waiting first.
    return { ...g, items: g.oldestFirst ? [...items].reverse() : items }
  }).filter((g) => g.items.length > 0)

  return (
    <Panel
      title="Live agent activity"
      subtitle={working ? `${working} run${working === 1 ? '' : 's'} in progress` : 'Ranked by priority'}
      icon={<Activity className={cx('size-4 text-violet-500', working > 0 && 'animate-pulse')} />}
      actions={
        runs.length > 0 && (
          <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
            All runs <ArrowRight className="size-3.5" />
          </button>
        )
      }
    >
      {runs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Runs will appear here as payments arrive.</p>
      ) : (
        <div className="max-h-[22rem] overflow-y-auto overscroll-contain">
          {groups.map((g) => (
            <section key={g.status} aria-label={g.label}>
              <h3 className="sticky top-0 z-10 flex items-center gap-1.5 border-y border-slate-100 bg-slate-50/95 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase backdrop-blur first:border-t-0">
                <span className={cx('size-1.5 rounded-full', g.dot)} />
                {g.label}
                <span className="font-normal tabular-nums text-slate-400">· {g.items.length}</span>
              </h3>
              <ul className="divide-y divide-slate-100">
                {g.items.map((r) => (
                  <RunRow key={r.runId} run={r} onOpen={() => onOpen(r.runId)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  )
}
