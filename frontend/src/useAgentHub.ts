import { useCallback, useEffect, useState } from 'react'
import { api, type AgentEvent, type ReviewRequest, type RunSummary } from './api'

type Runs = Record<string, RunSummary>

/** Folds one streamed event into the run it belongs to. Events are idempotent by (runId, seq). */
function applyEvent(runs: Runs, evt: AgentEvent): Runs {
  const run: RunSummary = runs[evt.runId] ?? { runId: evt.runId, status: 'RUNNING', createdAt: evt.at, outcome: null, review: null, events: [] }
  if (run.events.some((e) => e.seq === evt.seq)) return runs

  const next: RunSummary = { ...run, events: [...run.events, evt].sort((a, b) => a.seq - b.seq) }
  switch (evt.type) {
    case 'review_required':
      next.status = 'AWAITING_REVIEW'
      next.review = evt.data as ReviewRequest
      next.outcome = next.review.outcome
      break
    case 'review_resolved':
      next.status = 'RUNNING'
      next.review = null
      break
    case 'run_completed':
      next.status = 'COMPLETED'
      next.outcome = (evt.data as { outcome: RunSummary['outcome'] }).outcome
      break
    case 'run_failed':
      next.status = 'FAILED'
      break
  }
  return { ...runs, [evt.runId]: next }
}

/** Merges a server snapshot: the server is authoritative for status, events are unioned by seq. */
function mergeSnapshot(runs: Runs, snapshot: RunSummary[]): Runs {
  const merged = { ...runs }
  for (const s of snapshot) {
    const local = merged[s.runId]
    const events = [...(local?.events ?? []), ...s.events.filter((e) => !local?.events.some((l) => l.seq === e.seq))].sort((a, b) => a.seq - b.seq)
    merged[s.runId] = { ...s, events }
  }
  return merged
}

const LEDGER_EVENTS = new Set<AgentEvent['type']>(['review_required', 'run_completed', 'run_failed'])

/**
 * Subscribes to the backend's global SSE stream of agent events.
 * The stream is opened before the run snapshot is fetched so nothing is missed in between.
 */
export function useAgentHub() {
  const [runs, setRuns] = useState<Runs>({})
  const [connected, setConnected] = useState(false)
  // Bumped whenever a run changes the ledger, so tables can refetch.
  const [ledgerVersion, setLedgerVersion] = useState(0)

  useEffect(() => {
    const es = new EventSource(api.eventsUrl)
    es.onopen = () => {
      setConnected(true)
      // Also resyncs after EventSource auto-reconnects.
      api.runs().then((snapshot) => setRuns((r) => mergeSnapshot(r, snapshot))).catch(() => {})
      setLedgerVersion((v) => v + 1)
    }
    es.onerror = () => setConnected(false)
    es.addEventListener('agent', (msg) => {
      const evt = JSON.parse((msg as MessageEvent<string>).data) as AgentEvent
      setRuns((r) => applyEvent(r, evt))
      if (LEDGER_EVENTS.has(evt.type)) setLedgerVersion((v) => v + 1)
    })
    return () => es.close()
  }, [])

  const refreshLedger = useCallback(() => setLedgerVersion((v) => v + 1), [])

  const ordered = Object.values(runs).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { runs: ordered, connected, ledgerVersion, refreshLedger }
}
