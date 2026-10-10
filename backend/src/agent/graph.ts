import { Annotation, END, interrupt, MemorySaver, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { ToolMessage } from '@langchain/core/messages'
import type { AgentEventType, MatchOutcome, ParsedSms, ReviewDecision, ReviewRequest } from '../contracts.js'
import type { SmsExtractor } from './extractor.js'
import { allowedDecisions, matchPayment, type CandidateOrder } from './reconciliation.js'
import type { ReconciliationTools } from './tools.js'

export interface GraphEmitter {
  emit(runId: string, type: AgentEventType, message: string, extra?: { node?: string; data?: unknown }): void
  audit(runId: string, event: string, message: string, extra?: { data?: unknown; orderId?: string | null; transactionId?: string | null }): Promise<void>
}

export interface GraphDeps {
  tools: ReconciliationTools
  extractor: SmsExtractor
  events: GraphEmitter
  checkpointer?: BaseCheckpointSaver
}

export interface ResumeValue {
  decision: ReviewDecision
  note?: string
}

export const ReconciliationState = Annotation.Root({
  rawSms: Annotation<string>,
  parsed: Annotation<ParsedSms | null>({ reducer: (_, v) => v, default: () => null }),
  order: Annotation<CandidateOrder | null>({ reducer: (_, v) => v, default: () => null }),
  outcome: Annotation<MatchOutcome | null>({ reducer: (_, v) => v, default: () => null }),
  difference: Annotation<number | null>({ reducer: (_, v) => v, default: () => null }),
  transactionId: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
  review: Annotation<ReviewRequest | null>({ reducer: (_, v) => v, default: () => null }),
  decision: Annotation<ReviewDecision | null>({ reducer: (_, v) => v, default: () => null }),
  summary: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
  error: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
})

export type ReconciliationStateT = typeof ReconciliationState.State

const ghs = (n: number) => `GHS ${n.toFixed(2)}`
const NETWORK: Record<string, string> = { MTN: 'MTN MoMo', TELECEL: 'Telecel Cash', AT: 'AT Money' }
const network = (provider: string) => NETWORK[provider] ?? 'MoMo'
// SMS names arrive in capitals ("AMA SERWAA"); write them the way people read them.
const nameCase = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
const MATCHED_BY = { phone: 'their phone number', name: 'their name', amount: 'the amount' } as const
// Ghana is UTC+0; show times the way a shop owner reads them.
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })

// Messages below are shown to shop owners in the dashboard, so they use plain language, not system terms.
const runIdOf = (config: LangGraphRunnableConfig) => String(config.configurable?.thread_id)

export function buildReconciliationGraph({ tools, extractor, events, checkpointer = new MemorySaver() }: GraphDeps) {
  /** Invokes a tool and streams the call and its result. */
  async function callTool<T>(
    runId: string,
    node: string,
    name: string,
    t: { invoke(input: any): Promise<T | ToolMessage> },
    input: object,
  ): Promise<T> {
    events.emit(runId, 'tool_call', `Looking up records (${name})`, { node, data: { tool: name, input } })
    const output = await t.invoke(input)
    // Called with plain args (not a ToolCall), so LangChain returns the raw result.
    if (output instanceof ToolMessage) throw new Error(`${name} returned an unexpected ToolMessage`)
    events.emit(runId, 'tool_result', `Got the records (${name})`, { node, data: { tool: name, output } })
    return output
  }

  async function parseSms(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    events.emit(runId, 'node_started', 'Reading the payment message', { node: 'parse_sms' })
    const result = await extractor.extract(state.rawSms)
    if (!result.ok) {
      const message = "We couldn't find a MoMo payment in this message. Check that it is a 'payment received' SMS and try again."
      events.emit(runId, 'thought', message, { node: 'parse_sms', data: { reason: result.reason } })
      await events.audit(runId, 'PARSE_FAILED', message, { data: { reason: result.reason } })
      return { error: message }
    }
    const p = result.parsed
    events.emit(runId, 'thought', `${nameCase(p.senderName)} (${p.senderPhone}) sent ${ghs(p.amount)} by ${network(p.provider)}. Transaction ID: ${p.momoTxId}.`, {
      node: 'parse_sms',
      // The model's own explanation is kept for technical details only.
      data: { parsed: p, method: result.method, reasoning: result.reasoning },
    })
    await events.audit(runId, 'SMS_PARSED', `Read a payment of ${ghs(p.amount)} from ${nameCase(p.senderName)} (${network(p.provider)})`, { data: { ...p, method: result.method } })
    return { parsed: p }
  }

  async function checkDuplicate(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const parsed = state.parsed!
    events.emit(runId, 'node_started', 'Checking this payment has not been recorded before', { node: 'check_duplicate' })
    const found = await callTool(runId, 'check_duplicate', 'find_transaction', tools.findTransaction, { momoTxId: parsed.momoTxId })
    if (!found.exists) {
      events.emit(runId, 'thought', 'This is a new payment, not a repeat of an earlier SMS.', { node: 'check_duplicate' })
      return {}
    }
    const summary = `This payment was already recorded on ${when(found.processedAt)}. We ignored it so it is not counted twice.`
    events.emit(runId, 'thought', summary, { node: 'check_duplicate' })
    await events.audit(runId, 'DUPLICATE_REJECTED', summary, { transactionId: found.transactionId, orderId: found.orderId })
    return { outcome: 'DUPLICATE' as const, summary }
  }

  async function matchOrder(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const parsed = state.parsed!
    events.emit(runId, 'node_started', 'Looking for the order this payment is for', { node: 'match_order' })
    const pending = await callTool(runId, 'match_order', 'list_pending_orders', tools.listPendingOrders, {})
    const match = matchPayment(parsed, pending)

    let reasoning: string
    if (!match.order) {
      reasoning = `We checked ${pending.length} unpaid order${pending.length === 1 ? '' : 's'} but none match ${nameCase(parsed.senderName)}, the number ${parsed.senderPhone}, or the amount ${ghs(parsed.amount)}.`
    } else {
      const o = match.order
      const base = `Found ${o.customerName}'s order using ${MATCHED_BY[match.matchedBy!]}. They owe ${ghs(o.expectedAmount)} and paid ${ghs(parsed.amount)}.`
      reasoning =
        match.outcome === 'EXACT_MATCH'
          ? `${base} That is the full amount.`
          : match.outcome === 'UNDERPAYMENT'
            ? `${base} That is ${ghs(-match.difference!)} short. MoMo charges may have been taken off.`
            : `${base} That is ${ghs(match.difference!)} more than they owe.`
    }
    events.emit(runId, 'thought', reasoning, { node: 'match_order', data: { outcome: match.outcome, matchedBy: match.matchedBy, orderId: match.order?.id ?? null } })
    return { order: match.order, outcome: match.outcome, difference: match.difference }
  }

  async function settlePayment(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const { parsed, order } = state
    events.emit(runId, 'node_started', 'Marking the order as paid', { node: 'settle_payment' })
    const res = await callTool(runId, 'settle_payment', 'settle_exact_match', tools.settleExactMatch, { parsed, rawSms: state.rawSms, orderId: order!.id })
    if (res.duplicate) {
      const summary = 'This payment was recorded a moment ago from another copy of the same SMS, so we ignored this one.'
      await events.audit(runId, 'DUPLICATE_REJECTED', summary)
      return { outcome: 'DUPLICATE' as const, summary }
    }
    const summary = `${order!.customerName}'s order is paid. ${ghs(parsed!.amount)} received.`
    await events.audit(runId, 'ORDER_VERIFIED', summary, { orderId: order!.id, transactionId: res.transactionId })
    return { transactionId: res.transactionId, summary }
  }

  async function flagDiscrepancy(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const { parsed, order, outcome, difference } = state
    events.emit(runId, 'node_started', 'Asking you to decide', { node: 'flag_discrepancy' })
    const res = await callTool(runId, 'flag_discrepancy', 'flag_discrepancy', tools.flagDiscrepancy, {
      parsed,
      rawSms: state.rawSms,
      orderId: order?.id ?? null,
    })
    if (res.duplicate) {
      const summary = 'This payment was recorded a moment ago from another copy of the same SMS, so we ignored this one.'
      await events.audit(runId, 'DUPLICATE_REJECTED', summary)
      return { outcome: 'DUPLICATE' as const, summary }
    }

    const reviewOutcome = outcome as ReviewRequest['outcome']
    const reason =
      reviewOutcome === 'UNMATCHED'
        ? `${nameCase(parsed!.senderName)} paid ${ghs(parsed!.amount)}, but we couldn't find an unpaid order for them.`
        : reviewOutcome === 'UNDERPAYMENT'
          ? `${order!.customerName} paid ${ghs(-difference!)} less than they owe.`
          : `${order!.customerName} paid ${ghs(difference!)} more than they owe.`
    const review: ReviewRequest = {
      outcome: reviewOutcome,
      reason,
      parsed: parsed!,
      order: order ? { id: order.id, customerName: order.customerName, customerPhone: order.customerPhone, expectedAmount: order.expectedAmount } : null,
      difference,
      allowedDecisions: allowedDecisions(reviewOutcome),
    }
    await events.audit(runId, `${reviewOutcome}_FLAGGED`, reason, { orderId: order?.id ?? null, transactionId: res.transactionId, data: { difference } })
    return { transactionId: res.transactionId, review }
  }

  /**
   * Pauses the graph until an operator decides. On resume LangGraph re-runs this
   * node and interrupt() returns the decision, so it must have no side effects.
   */
  function humanReview(state: ReconciliationStateT) {
    const { decision } = interrupt<ReviewRequest, ResumeValue>(state.review!)
    return { decision }
  }

  async function applyDecision(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const { decision, order, transactionId, parsed, difference } = state
    events.emit(runId, 'node_started', 'Saving your decision', { node: 'apply_decision' })
    const res = await callTool(runId, 'apply_decision', 'apply_review_decision', tools.applyReviewDecision, {
      transactionId,
      orderId: order?.id ?? null,
      decision,
    })
    const summary =
      decision === 'ACCEPT'
        ? `Accepted ${ghs(parsed!.amount)} for ${order!.customerName}'s order. The order is now marked paid${difference ? ` (${ghs(Math.abs(difference))} ${difference < 0 ? 'short' : 'extra'})` : ''}.`
        : decision === 'REQUEST_BALANCE'
          ? `Asked ${order!.customerName} to pay the remaining ${ghs(-difference!)}. The order stays open until then.`
          : order
            ? `Declined the payment for ${order.customerName}'s order. The order is marked declined.`
            : `Declined the payment from ${nameCase(parsed!.senderName)}. It is kept on record but not linked to any order.`
    events.emit(runId, 'thought', summary, { node: 'apply_decision' })
    await events.audit(runId, `DECISION_${decision}`, summary, { orderId: order?.id ?? null, transactionId, data: { orderStatus: res.orderStatus } })
    return { summary }
  }

  return new StateGraph(ReconciliationState)
    .addNode('parse_sms', parseSms)
    .addNode('check_duplicate', checkDuplicate)
    .addNode('match_order', matchOrder)
    .addNode('settle_payment', settlePayment)
    .addNode('flag_discrepancy', flagDiscrepancy)
    .addNode('human_review', humanReview)
    .addNode('apply_decision', applyDecision)
    .addEdge(START, 'parse_sms')
    .addConditionalEdges('parse_sms', (s) => (s.error ? END : 'check_duplicate'), ['check_duplicate', END])
    .addConditionalEdges('check_duplicate', (s) => (s.outcome === 'DUPLICATE' ? END : 'match_order'), ['match_order', END])
    .addConditionalEdges('match_order', (s) => (s.outcome === 'EXACT_MATCH' ? 'settle_payment' : 'flag_discrepancy'), [
      'settle_payment',
      'flag_discrepancy',
    ])
    .addEdge('settle_payment', END)
    .addConditionalEdges('flag_discrepancy', (s) => (s.outcome === 'DUPLICATE' ? END : 'human_review'), ['human_review', END])
    .addEdge('human_review', 'apply_decision')
    .addEdge('apply_decision', END)
    .compile({ checkpointer })
}

export type ReconciliationGraph = ReturnType<typeof buildReconciliationGraph>
