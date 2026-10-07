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
    events.emit(runId, 'tool_call', `Calling ${name}`, { node, data: { tool: name, input } })
    const output = await t.invoke(input)
    // Called with plain args (not a ToolCall), so LangChain returns the raw result.
    if (output instanceof ToolMessage) throw new Error(`${name} returned an unexpected ToolMessage`)
    events.emit(runId, 'tool_result', `${name} returned`, { node, data: { tool: name, output } })
    return output
  }

  async function parseSms(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    events.emit(runId, 'node_started', 'Extracting payment details from SMS', { node: 'parse_sms' })
    const result = await extractor.extract(state.rawSms)
    if (!result.ok) {
      events.emit(runId, 'thought', `Could not extract a payment: ${result.reason}`, { node: 'parse_sms' })
      await events.audit(runId, 'PARSE_FAILED', result.reason)
      return { error: `Unparseable SMS: ${result.reason}` }
    }
    const p = result.parsed
    events.emit(runId, 'thought', `${result.reasoning} Found ${ghs(p.amount)} from ${p.senderName} (${p.senderPhone}), ${p.provider} tx ${p.momoTxId}.`, {
      node: 'parse_sms',
      data: { parsed: p, method: result.method },
    })
    await events.audit(runId, 'SMS_PARSED', `Parsed ${p.provider} tx ${p.momoTxId} via ${result.method}`, { data: p })
    return { parsed: p }
  }

  async function checkDuplicate(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const parsed = state.parsed!
    events.emit(runId, 'node_started', 'Checking for duplicate transaction', { node: 'check_duplicate' })
    const found = await callTool(runId, 'check_duplicate', 'find_transaction', tools.findTransaction, { momoTxId: parsed.momoTxId })
    if (!found.exists) {
      events.emit(runId, 'thought', `Transaction ${parsed.momoTxId} has not been seen before.`, { node: 'check_duplicate' })
      return {}
    }
    const summary = `Duplicate: transaction ${parsed.momoTxId} was already processed at ${found.processedAt}. Ignored to prevent double-crediting.`
    events.emit(runId, 'thought', summary, { node: 'check_duplicate' })
    await events.audit(runId, 'DUPLICATE_REJECTED', summary, { transactionId: found.transactionId, orderId: found.orderId })
    return { outcome: 'DUPLICATE' as const, summary }
  }

  async function matchOrder(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const parsed = state.parsed!
    events.emit(runId, 'node_started', 'Matching payment against pending orders', { node: 'match_order' })
    const pending = await callTool(runId, 'match_order', 'list_pending_orders', tools.listPendingOrders, {})
    const match = matchPayment(parsed, pending)

    let reasoning: string
    if (!match.order) {
      reasoning = `No pending order matches sender phone ${parsed.senderPhone}, name "${parsed.senderName}", or a unique amount of ${ghs(parsed.amount)} (${pending.length} pending orders checked).`
    } else {
      const o = match.order
      const base = `Matched order for ${o.customerName} by ${match.matchedBy}; expected ${ghs(o.expectedAmount)}, received ${ghs(parsed.amount)}.`
      reasoning =
        match.outcome === 'EXACT_MATCH'
          ? `${base} Amounts are equal.`
          : match.outcome === 'UNDERPAYMENT'
            ? `${base} Underpaid by ${ghs(-match.difference!)} (possibly cash-out fees deducted).`
            : `${base} Overpaid by ${ghs(match.difference!)}.`
    }
    events.emit(runId, 'thought', reasoning, { node: 'match_order', data: { outcome: match.outcome, matchedBy: match.matchedBy, orderId: match.order?.id ?? null } })
    return { order: match.order, outcome: match.outcome, difference: match.difference }
  }

  async function settlePayment(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const { parsed, order } = state
    events.emit(runId, 'node_started', 'Verifying order', { node: 'settle_payment' })
    const res = await callTool(runId, 'settle_payment', 'settle_exact_match', tools.settleExactMatch, { parsed, rawSms: state.rawSms, orderId: order!.id })
    if (res.duplicate) {
      const summary = `Duplicate: transaction ${parsed!.momoTxId} was recorded by a concurrent run.`
      await events.audit(runId, 'DUPLICATE_REJECTED', summary)
      return { outcome: 'DUPLICATE' as const, summary }
    }
    const summary = `Order for ${order!.customerName} VERIFIED with ${ghs(parsed!.amount)} (tx ${parsed!.momoTxId}).`
    await events.audit(runId, 'ORDER_VERIFIED', summary, { orderId: order!.id, transactionId: res.transactionId })
    return { transactionId: res.transactionId, summary }
  }

  async function flagDiscrepancy(state: ReconciliationStateT, config: LangGraphRunnableConfig) {
    const runId = runIdOf(config)
    const { parsed, order, outcome, difference } = state
    events.emit(runId, 'node_started', 'Flagging anomaly for human review', { node: 'flag_discrepancy' })
    const res = await callTool(runId, 'flag_discrepancy', 'flag_discrepancy', tools.flagDiscrepancy, {
      parsed,
      rawSms: state.rawSms,
      orderId: order?.id ?? null,
    })
    if (res.duplicate) {
      const summary = `Duplicate: transaction ${parsed!.momoTxId} was recorded by a concurrent run.`
      await events.audit(runId, 'DUPLICATE_REJECTED', summary)
      return { outcome: 'DUPLICATE' as const, summary }
    }

    const reviewOutcome = outcome as ReviewRequest['outcome']
    const reason =
      reviewOutcome === 'UNMATCHED'
        ? `Payment of ${ghs(parsed!.amount)} from ${parsed!.senderName} does not match any pending order.`
        : reviewOutcome === 'UNDERPAYMENT'
          ? `Underpayment of ${ghs(-difference!)} on order for ${order!.customerName}.`
          : `Overpayment of ${ghs(difference!)} on order for ${order!.customerName}.`
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
    events.emit(runId, 'node_started', `Applying operator decision: ${decision}`, { node: 'apply_decision' })
    const res = await callTool(runId, 'apply_decision', 'apply_review_decision', tools.applyReviewDecision, {
      transactionId,
      orderId: order?.id ?? null,
      decision,
    })
    const summary =
      decision === 'ACCEPT'
        ? `Operator accepted ${ghs(parsed!.amount)} for ${order!.customerName}'s order; order VERIFIED${difference ? ` with ${difference < 0 ? 'shortfall' : 'excess'} of ${ghs(Math.abs(difference))} noted` : ''}.`
        : decision === 'REQUEST_BALANCE'
          ? `Balance of ${ghs(-difference!)} requested from ${order!.customerName}; order remains DISCREPANCY_FLAGGED.`
          : order
            ? `Operator rejected the payment for ${order.customerName}'s order; order REJECTED.`
            : `Operator rejected unmatched payment ${parsed!.momoTxId}; recorded without an order.`
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
