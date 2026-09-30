import { Injectable, Logger } from '@nestjs/common'
import { Subject } from 'rxjs'
import { randomUUID } from 'crypto'
import { verifyMomoReceipt, fetchOrderDetails, updateOrderStatus } from './tools.js'
import { planRun } from './orchestrator.js'
import prisma from '../prisma/client.js'

export type AgentEventKind = 'thought' | 'tool_call' | 'tool_result' | 'approval_required' | 'final_status' | 'error'

export interface AgentEvent {
  id: string
  kind: AgentEventKind
  payload: Record<string, any>
  timestamp: string
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)
  private runs = new Map<string, Subject<AgentEvent>>()

  startRun(rawText: string, source = 'manual') {
    const runId = randomUUID()
    const subject = new Subject<AgentEvent>()
    this.runs.set(runId, subject)
    this.logger.log(`[${runId}] Run started`)
    // Run real, deterministic orchestration using Zod-validated tool adapters
    ;(async () => {
      try {
        subject.next({ id: runId, kind: 'thought', payload: { text: 'Parsing receipt' }, timestamp: new Date().toISOString() })

        // Ask orchestrator for a plan (LLM-driven or heuristic fallback)
        const plan = await planRun(rawText, source)
        this.logger.log(`[${runId}] Plan: ${plan.map((s) => s.tool).join(' → ')}`)

        // Persist a planning audit entry so we have an immutable record
        try {
          await prisma.reconciliationAttempt.create({
            data: {
              status: 'planned',
              note: JSON.stringify({ rawText: rawText.slice(0, 200) }),
              runId,
              plannerOutput: plan as any,
            },
          })
        } catch (e) {
          // ignore DB audit failures but continue
        }
        let context: Record<string, any> = {}

        for (const step of plan) {
          subject.next({ id: runId, kind: 'tool_call', payload: { tool: step.tool, input: step.input }, timestamp: new Date().toISOString() })
          this.logger.debug(`[${runId}] tool_call: ${step.tool}`)

          if (step.tool === 'verifyMomoReceipt') {
            const verified = await verifyMomoReceipt({ ...step.input, metadata: {} })
            subject.next({ id: runId, kind: 'tool_result', payload: { tool: 'verifyMomoReceipt', output: verified }, timestamp: new Date().toISOString() })
            context.verified = verified
          } else if (step.tool === 'fetchOrderDetails') {
            const fetched = await fetchOrderDetails(step.input)
            subject.next({ id: runId, kind: 'tool_result', payload: { tool: 'fetchOrderDetails', output: fetched }, timestamp: new Date().toISOString() })
            context.fetched = fetched
          }
        }

        // Decide post-plan action: update or request approval
        const verified = context.verified
        const fetched = context.fetched
        const orderMatch = fetched?.found ? fetched.order : null

        if (orderMatch && verified?.amount && Math.abs(orderMatch.amount - verified.amount) < 1) {
          this.logger.log(`[${runId}] Auto-reconciling order ${orderMatch.orderId}`)
          subject.next({ id: runId, kind: 'thought', payload: { text: `Amounts match, updating order ${orderMatch.orderId}` }, timestamp: new Date().toISOString() })
          subject.next({ id: runId, kind: 'tool_call', payload: { tool: 'updateOrderStatus', input: { orderId: orderMatch.orderId, status: 'paid', amountReceived: verified.amount, paymentReference: verified.reference } }, timestamp: new Date().toISOString() })
          const updated = await updateOrderStatus({ orderId: orderMatch.orderId, status: 'paid', amountReceived: verified.amount, paymentReference: verified.reference }, runId)
          subject.next({ id: runId, kind: 'tool_result', payload: { tool: 'updateOrderStatus', output: updated }, timestamp: new Date().toISOString() })
          subject.next({ id: runId, kind: 'final_status', payload: { status: 'paid', orderId: orderMatch.orderId, summary: 'Auto-reconciled' }, timestamp: new Date().toISOString() })
        } else {
          // log approval_required as an audit attempt
          try {
            await prisma.reconciliationAttempt.create({
              data: { status: 'approval_required', runId, note: 'No matching order or amount mismatch' },
            })
          } catch (_) {}
          this.logger.warn(`[${runId}] approval_required – no match or amount mismatch`)
          subject.next({ id: runId, kind: 'approval_required', payload: { reason: 'No matching order or amount mismatch', details: { verified, orderMatch } }, timestamp: new Date().toISOString() })
        }

        subject.complete()
      } catch (err: any) {
        this.logger.error(`[${runId}] Run failed: ${err?.message ?? err}`)
        subject.next({ id: runId, kind: 'error', payload: { message: String(err?.message || err), detail: err }, timestamp: new Date().toISOString() })
        subject.error(err)
      } finally {
        this.runs.delete(runId)
      }
    })()

    return runId
  }

  getRunStream(runId: string) {
    return this.runs.get(runId) ?? null
  }

  // Minimal approval hook for human-in-the-loop
  approve(runId: string, action: 'approve' | 'reject' | 'escalate', actorId?: string, note?: string) {
    const s = this.runs.get(runId)
    if (!s) return false
    // Audit the human decision
    prisma.reconciliationAttempt.create({
      data: { status: `human_${action}`, runId, note: note ? `${actorId ?? 'anon'}: ${note}` : actorId ?? 'anon' },
    }).catch(() => {})
    s.next({ id: runId, kind: 'thought', payload: { text: `Human action: ${action}`, actorId, note }, timestamp: new Date().toISOString() })
    s.next({ id: runId, kind: 'final_status', payload: { status: action === 'approve' ? 'paid' : 'pending', summary: `Human ${action}` }, timestamp: new Date().toISOString() })
    s.complete()
    this.runs.delete(runId)
    return true
  }
}
