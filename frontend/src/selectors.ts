import type { AgentEvent, MatchOutcome, ParsedSms, RunSummary, TransactionDto } from './api'

/** Parsed SMS fields, taken from the parse_sms reasoning event once the agent has extracted them. */
export function runParsed(run: RunSummary): ParsedSms | null {
  if (run.review) return run.review.parsed
  const evt = run.events.find((e) => e.node === 'parse_sms' && e.type === 'thought')
  return (evt?.data as { parsed?: ParsedSms } | undefined)?.parsed ?? null
}

export function runThoughts(run: RunSummary): AgentEvent[] {
  return run.events.filter((e) => e.type === 'thought')
}

export function runFinalMessage(run: RunSummary): string | null {
  const last = [...run.events].reverse().find((e) => e.type === 'run_completed' || e.type === 'run_failed')
  return last?.message ?? null
}

export interface ReconSummary {
  received: number
  verified: number
  unreconciled: number
  receivedCount: number
  verifiedCount: number
}

/** Received − Verified = Unreconciled, over every recorded MoMo transaction. */
export function reconSummary(transactions: TransactionDto[]): ReconSummary {
  let received = 0
  let verified = 0
  let verifiedCount = 0
  for (const t of transactions) {
    received += t.amountPaid
    if (t.order?.status === 'VERIFIED') {
      verified += t.amountPaid
      verifiedCount++
    }
  }
  // Round to pesewas so floating point noise never shows as "GHS 0.00 unreconciled".
  const unreconciled = Math.round((received - verified) * 100) / 100
  return { received, verified, unreconciled, receivedCount: transactions.length, verifiedCount }
}

/** Maps a MoMo transaction ID to the run that processed it, so table rows can open the agent trace. */
export function runsByTxId(runs: RunSummary[]): Map<string, string> {
  const map = new Map<string, string>()
  // Oldest first so the original (non-duplicate) run wins.
  for (const r of [...runs].reverse()) {
    const id = runParsed(r)?.momoTxId
    if (id && !map.has(id) && r.outcome !== 'DUPLICATE') map.set(id, r.runId)
  }
  return map
}

export const OUTCOME_DOT: Record<MatchOutcome, string> = {
  EXACT_MATCH: 'bg-emerald-500',
  UNDERPAYMENT: 'bg-amber-500',
  OVERPAYMENT: 'bg-sky-500',
  UNMATCHED: 'bg-rose-500',
  DUPLICATE: 'bg-violet-500',
}
