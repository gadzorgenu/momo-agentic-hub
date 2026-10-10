import type { MatchOutcome, OrderStatus, RunStatus } from './api'

export const ghs = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

type Tone = 'slate' | 'emerald' | 'amber' | 'sky' | 'rose' | 'violet'

export const TONE_CLASSES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Waiting for payment', tone: 'slate' },
  VERIFIED: { label: 'Paid', tone: 'emerald' },
  DISCREPANCY_FLAGGED: { label: 'Wrong amount', tone: 'amber' },
  REJECTED: { label: 'Declined', tone: 'rose' },
}

export const OUTCOME: Record<MatchOutcome, { label: string; tone: Tone }> = {
  EXACT_MATCH: { label: 'Paid in full', tone: 'emerald' },
  UNDERPAYMENT: { label: 'Paid too little', tone: 'amber' },
  OVERPAYMENT: { label: 'Paid too much', tone: 'sky' },
  UNMATCHED: { label: 'No matching order', tone: 'rose' },
  DUPLICATE: { label: 'Already recorded', tone: 'violet' },
}

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone }> = {
  RUNNING: { label: 'Checking', tone: 'sky' },
  AWAITING_REVIEW: { label: 'Needs your decision', tone: 'amber' },
  COMPLETED: { label: 'Done', tone: 'emerald' },
  FAILED: { label: "Couldn't finish", tone: 'rose' },
}
