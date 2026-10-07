import { Prisma, type PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentEvent, RunStatus } from '../contracts.js'
import { AgentService, InvalidDecisionError } from './agent.service.js'
import { RegexSmsExtractor } from './extractor.js'
import { SAMPLE_SMS } from './sms-parser.spec.js'
import { createTools } from './tools.js'

/** Minimal in-memory stand-in for the Prisma calls the reconciliation tools make. */
function createFakeDb() {
  const orders: any[] = []
  const transactions: any[] = []
  const auditLogs: any[] = []
  const db: any = {
    orders,
    transactions,
    auditLogs,
    $transaction: (fn: (trx: any) => Promise<unknown>) => fn(db),
    order: {
      findMany: async ({ where }: any) => orders.filter((o) => o.status === where.status),
      updateMany: async ({ where, data }: any) => {
        const hits = orders.filter((o) => o.id === where.id && o.status === where.status)
        hits.forEach((o) => Object.assign(o, data))
        return { count: hits.length }
      },
    },
    transaction: {
      findUnique: async ({ where }: any) => transactions.find((t) => t.momoTxId === where.momoTxId) ?? null,
      create: async ({ data }: any) => {
        if (transactions.some((t) => t.momoTxId === data.momoTxId)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
        }
        const row = { id: randomUUID(), createdAt: new Date(), ...data }
        transactions.push(row)
        return row
      },
      update: async ({ where, data }: any) => Object.assign(transactions.find((t) => t.id === where.id), data),
    },
    auditLog: { create: async ({ data }: any) => auditLogs.push(data) },
  }
  return db as typeof db & PrismaClient
}

function addOrder(db: ReturnType<typeof createFakeDb>, over: Record<string, unknown> = {}) {
  const order = {
    id: randomUUID(),
    customerName: 'Kwame Mensah',
    customerPhone: '0241234567',
    expectedAmount: 150,
    status: 'PENDING',
    createdAt: new Date(),
    ...over,
  }
  db.orders.push(order)
  return order
}

async function waitForStatus(svc: AgentService, runId: string, statuses: RunStatus[]) {
  for (let i = 0; i < 200; i++) {
    const run = svc.listRuns().find((r) => r.runId === runId)!
    if (statuses.includes(run.status)) return run
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`run ${runId} never reached ${statuses.join('/')}`)
}

describe('AgentService reconciliation graph', () => {
  let db: ReturnType<typeof createFakeDb>
  let svc: AgentService

  beforeEach(() => {
    db = createFakeDb()
    svc = new AgentService({ db, extractor: new RegexSmsExtractor(), tools: createTools(db) })
  })

  it('verifies an exact match without pausing', async () => {
    const order = addOrder(db)
    const runId = svc.startRun(SAMPLE_SMS.mtn)
    const run = await waitForStatus(svc, runId, ['COMPLETED', 'FAILED'])

    expect(run).toMatchObject({ status: 'COMPLETED', outcome: 'EXACT_MATCH' })
    expect(order.status).toBe('VERIFIED')
    expect(db.transactions).toHaveLength(1)
    expect(db.transactions[0]).toMatchObject({ momoTxId: '51234567890', orderId: order.id, amountPaid: 150 })
    expect(db.auditLogs.map((a: any) => a.event)).toEqual(['SMS_PARSED', 'ORDER_VERIFIED'])
  })

  it('streams reasoning, tool calls and results in order, replayable after completion', async () => {
    addOrder(db)
    const runId = svc.startRun(SAMPLE_SMS.mtn)
    await waitForStatus(svc, runId, ['COMPLETED'])

    // Subscribing after the run finished still receives every event (no SSE race).
    const events: AgentEvent[] = []
    await new Promise<void>((resolve) => svc.streamRun(runId)!.subscribe({ next: (e) => events.push(e), complete: resolve }))
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i))
    expect(events[0].type).toBe('run_started')
    expect(events.at(-1)!.type).toBe('run_completed')
    expect(events.filter((e) => e.type === 'tool_call').map((e) => (e.data as any).tool)).toEqual([
      'find_transaction',
      'list_pending_orders',
      'settle_exact_match',
    ])
    expect(events.some((e) => e.type === 'thought')).toBe(true)
  })

  it('pauses on underpayment and resumes with ACCEPT', async () => {
    const order = addOrder(db, { expectedAmount: 152.5 })
    const runId = svc.startRun(SAMPLE_SMS.mtn)
    const paused = await waitForStatus(svc, runId, ['AWAITING_REVIEW', 'FAILED'])

    expect(paused.review).toMatchObject({ outcome: 'UNDERPAYMENT', difference: -2.5, allowedDecisions: ['ACCEPT', 'REQUEST_BALANCE', 'REJECT'] })
    expect(order.status).toBe('DISCREPANCY_FLAGGED')

    svc.decide(runId, 'ACCEPT')
    const done = await waitForStatus(svc, runId, ['COMPLETED', 'FAILED'])
    expect(done.status).toBe('COMPLETED')
    expect(order.status).toBe('VERIFIED')
    expect(db.transactions[0].orderId).toBe(order.id)
  })

  it('keeps the order flagged on REQUEST_BALANCE', async () => {
    const order = addOrder(db, { expectedAmount: 160 })
    const runId = svc.startRun(SAMPLE_SMS.mtn)
    await waitForStatus(svc, runId, ['AWAITING_REVIEW'])
    svc.decide(runId, 'REQUEST_BALANCE')
    await waitForStatus(svc, runId, ['COMPLETED'])
    expect(order.status).toBe('DISCREPANCY_FLAGGED')
    expect(db.auditLogs.at(-1).message).toContain('Balance of GHS 10.00 requested')
  })

  it('rejects an overpayment and unlinks the transaction', async () => {
    const order = addOrder(db, { expectedAmount: 100 })
    const runId = svc.startRun(SAMPLE_SMS.mtn)
    const paused = await waitForStatus(svc, runId, ['AWAITING_REVIEW'])
    expect(paused.review).toMatchObject({ outcome: 'OVERPAYMENT', difference: 50, allowedDecisions: ['ACCEPT', 'REJECT'] })

    expect(() => svc.decide(runId, 'REQUEST_BALANCE')).toThrow(InvalidDecisionError)
    svc.decide(runId, 'REJECT')
    await waitForStatus(svc, runId, ['COMPLETED'])
    expect(order.status).toBe('REJECTED')
    expect(db.transactions[0].orderId).toBeNull()
  })

  it('pauses unmatched payments and records them without an order', async () => {
    const runId = svc.startRun(SAMPLE_SMS.mtn)
    const paused = await waitForStatus(svc, runId, ['AWAITING_REVIEW'])
    expect(paused.review).toMatchObject({ outcome: 'UNMATCHED', order: null, allowedDecisions: ['REJECT'] })
    svc.decide(runId, 'REJECT')
    await waitForStatus(svc, runId, ['COMPLETED'])
    expect(db.transactions[0].orderId).toBeNull()
  })

  it('ignores a replayed SMS so the order is never credited twice', async () => {
    addOrder(db)
    const first = svc.startRun(SAMPLE_SMS.mtn)
    await waitForStatus(svc, first, ['COMPLETED'])
    addOrder(db) // a second pending order the replay could otherwise match

    const replay = svc.startRun(SAMPLE_SMS.mtn)
    const run = await waitForStatus(svc, replay, ['COMPLETED', 'FAILED'])
    expect(run).toMatchObject({ status: 'COMPLETED', outcome: 'DUPLICATE' })
    expect(db.transactions).toHaveLength(1)
    expect(db.orders.filter((o: any) => o.status === 'VERIFIED')).toHaveLength(1)
  })

  it('rejects a decision when the run is not paused', async () => {
    addOrder(db)
    const runId = svc.startRun(SAMPLE_SMS.mtn)
    await waitForStatus(svc, runId, ['COMPLETED'])
    expect(() => svc.decide(runId, 'ACCEPT')).toThrow(InvalidDecisionError)
  })

  it('fails the run cleanly when the SMS cannot be parsed', async () => {
    const runId = svc.startRun('Hello, your bundle has been activated.')
    const run = await waitForStatus(svc, runId, ['COMPLETED', 'FAILED'])
    expect(run.status).toBe('FAILED')
    expect(db.transactions).toHaveLength(0)
  })
})
