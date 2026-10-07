import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Command } from '@langchain/langgraph'
import type { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { Observable, ReplaySubject, Subject } from 'rxjs'
import type { AgentEvent, AgentEventType, MatchOutcome, ReviewDecision, ReviewRequest, RunStatus, RunSummary } from '../contracts.js'
import prisma from '../prisma/client.js'
import { createExtractor, type SmsExtractor } from './extractor.js'
import { buildReconciliationGraph, type GraphEmitter, type ReconciliationGraph, type ResumeValue } from './graph.js'
import { createTools, type ReconciliationTools } from './tools.js'

export const AGENT_DEPS = Symbol('AGENT_DEPS')

export interface AgentDeps {
  db: PrismaClient
  extractor: SmsExtractor
  tools: ReconciliationTools
}

interface RunRecord {
  runId: string
  status: RunStatus
  createdAt: string
  outcome: MatchOutcome | null
  review: ReviewRequest | null
  events: AgentEvent[]
  stream: ReplaySubject<AgentEvent>
}

export class RunNotFoundError extends Error {}
export class InvalidDecisionError extends Error {}

const MAX_RUNS_IN_MEMORY = 200

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)
  private readonly runs = new Map<string, RunRecord>()
  private readonly allEvents = new Subject<AgentEvent>()
  private readonly db: PrismaClient
  private readonly graph: ReconciliationGraph

  constructor(@Optional() @Inject(AGENT_DEPS) deps?: Partial<AgentDeps>) {
    this.db = deps?.db ?? prisma
    const emitter: GraphEmitter = {
      emit: (runId, type, message, extra) => this.emit(runId, type, message, extra),
      audit: (runId, event, message, extra) => this.audit(runId, event, message, extra),
    }
    this.graph = buildReconciliationGraph({
      tools: deps?.tools ?? createTools(this.db),
      extractor: deps?.extractor ?? createExtractor(),
      events: emitter,
    })
  }

  startRun(rawSms: string): string {
    const runId = randomUUID()
    this.runs.set(runId, {
      runId,
      status: 'RUNNING',
      createdAt: new Date().toISOString(),
      outcome: null,
      review: null,
      events: [],
      stream: new ReplaySubject<AgentEvent>(),
    })
    this.pruneRuns()
    this.emit(runId, 'run_started', 'Reconciliation run started', { data: { rawSms } })
    void this.execute(runId, { rawSms })
    return runId
  }

  /** Resumes a paused graph with the operator's decision. */
  decide(runId: string, decision: ReviewDecision, note?: string) {
    const run = this.runs.get(runId)
    if (!run) throw new RunNotFoundError(`Run ${runId} not found`)
    if (run.status !== 'AWAITING_REVIEW' || !run.review) throw new InvalidDecisionError(`Run ${runId} is not awaiting review`)
    if (!run.review.allowedDecisions.includes(decision)) {
      throw new InvalidDecisionError(`${decision} is not allowed for ${run.review.outcome}; allowed: ${run.review.allowedDecisions.join(', ')}`)
    }
    // Flip status synchronously so a double-click cannot resume the graph twice.
    run.status = 'RUNNING'
    run.review = null
    this.emit(runId, 'review_resolved', `Operator chose ${decision}`, { data: { decision, note } })
    void this.audit(runId, 'HUMAN_DECISION', `Operator chose ${decision}${note ? `: ${note}` : ''}`, { data: { decision, note } })
    const resume: ResumeValue = { decision, note }
    void this.execute(runId, new Command<ResumeValue>({ resume }) as Parameters<ReconciliationGraph['invoke']>[0])
  }

  /** Replays the run's events so far, then streams live ones until it finishes. */
  streamRun(runId: string): Observable<AgentEvent> | null {
    return this.runs.get(runId)?.stream.asObservable() ?? null
  }

  /** Live events from every run (no replay); pair with listRuns() for history. */
  streamAll(): Observable<AgentEvent> {
    return this.allEvents.asObservable()
  }

  listRuns(): RunSummary[] {
    return [...this.runs.values()].reverse().map(({ stream: _stream, ...summary }) => summary)
  }

  private async execute(runId: string, input: Parameters<ReconciliationGraph['invoke']>[0]) {
    const config = { configurable: { thread_id: runId } }
    const run = this.runs.get(runId)!
    try {
      await this.graph.invoke(input, config)
      const snapshot = await this.graph.getState(config)
      const pending = snapshot.tasks.flatMap((t) => t.interrupts)
      if (pending.length) {
        const review = pending[0].value as ReviewRequest
        run.status = 'AWAITING_REVIEW'
        run.outcome = review.outcome
        run.review = review
        this.emit(runId, 'review_required', review.reason, { node: 'human_review', data: review })
        this.logger.log(`[${runId}] paused for review: ${review.outcome}`)
        return
      }
      const values = snapshot.values as { outcome: MatchOutcome | null; summary: string | null; error: string | null }
      run.outcome = values.outcome
      if (values.error) {
        run.status = 'FAILED'
        this.emit(runId, 'run_failed', values.error)
      } else {
        run.status = 'COMPLETED'
        this.emit(runId, 'run_completed', values.summary ?? 'Run completed', { data: { outcome: values.outcome } })
      }
      run.stream.complete()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[${runId}] run failed: ${message}`)
      run.status = 'FAILED'
      this.emit(runId, 'run_failed', `Run failed: ${message}`)
      void this.audit(runId, 'RUN_FAILED', message)
      run.stream.complete()
    }
  }

  private emit(runId: string, type: AgentEventType, message: string, extra?: { node?: string; data?: unknown }) {
    const run = this.runs.get(runId)
    if (!run) return
    const event: AgentEvent = { runId, seq: run.events.length, at: new Date().toISOString(), type, message, ...extra }
    run.events.push(event)
    run.stream.next(event)
    this.allEvents.next(event)
  }

  private async audit(runId: string, event: string, message: string, extra?: { data?: unknown; orderId?: string | null; transactionId?: string | null }) {
    try {
      await this.db.auditLog.create({
        data: {
          runId,
          event,
          message,
          data: extra?.data === undefined ? undefined : (JSON.parse(JSON.stringify(extra.data)) as object),
          orderId: extra?.orderId ?? null,
          transactionId: extra?.transactionId ?? null,
        },
      })
    } catch (err) {
      // The audit log must never break reconciliation, but a gap in it should be visible.
      this.logger.error(`[${runId}] failed to write audit log ${event}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private pruneRuns() {
    for (const [id, run] of this.runs) {
      if (this.runs.size <= MAX_RUNS_IN_MEMORY) break
      if (run.status === 'AWAITING_REVIEW' || run.status === 'RUNNING') continue
      this.runs.delete(id)
    }
  }
}
