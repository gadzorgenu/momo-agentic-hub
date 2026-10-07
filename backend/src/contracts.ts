/**
 * API contract shared by the backend and the React dashboard.
 *
 * This file must stay type-only with no imports: the frontend imports it
 * directly (`import type`) so both sides compile against the same shapes.
 */

export type OrderStatus = 'PENDING' | 'VERIFIED' | 'DISCREPANCY_FLAGGED' | 'REJECTED'

export type MomoProvider = 'MTN' | 'TELECEL' | 'AT' | 'UNKNOWN'

export interface ParsedSms {
  provider: MomoProvider
  momoTxId: string
  senderName: string
  senderPhone: string
  amount: number
  /** ISO timestamp from the SMS, or null when the message carries none. */
  transactedAt: string | null
}

export type MatchOutcome = 'EXACT_MATCH' | 'UNDERPAYMENT' | 'OVERPAYMENT' | 'UNMATCHED' | 'DUPLICATE'

export type ReviewDecision = 'ACCEPT' | 'REQUEST_BALANCE' | 'REJECT'

export interface OrderDto {
  id: string
  customerName: string
  customerPhone: string
  expectedAmount: number
  status: OrderStatus
  createdAt: string
  updatedAt: string
}

export interface TransactionDto {
  id: string
  momoTxId: string
  senderName: string
  senderPhone: string
  amountPaid: number
  rawSms: string
  provider: string | null
  transactedAt: string | null
  orderId: string | null
  createdAt: string
  order: Pick<OrderDto, 'id' | 'customerName' | 'expectedAmount' | 'status'> | null
}

export interface AuditLogDto {
  id: string
  runId: string
  event: string
  message: string
  data: unknown
  orderId: string | null
  transactionId: string | null
  createdAt: string
}

/** Payload of the LangGraph interrupt, shown to the operator. */
export interface ReviewRequest {
  outcome: Exclude<MatchOutcome, 'EXACT_MATCH' | 'DUPLICATE'>
  reason: string
  parsed: ParsedSms
  order: Pick<OrderDto, 'id' | 'customerName' | 'customerPhone' | 'expectedAmount'> | null
  /** amountPaid - expectedAmount in GHS; negative = underpaid. Null when unmatched. */
  difference: number | null
  allowedDecisions: ReviewDecision[]
}

export type RunStatus = 'RUNNING' | 'AWAITING_REVIEW' | 'COMPLETED' | 'FAILED'

export type AgentEventType =
  | 'run_started'
  | 'node_started'
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'review_required'
  | 'review_resolved'
  | 'run_completed'
  | 'run_failed'

export interface AgentEvent {
  runId: string
  seq: number
  at: string
  type: AgentEventType
  node?: string
  message: string
  data?: unknown
}

export interface RunSummary {
  runId: string
  status: RunStatus
  createdAt: string
  outcome: MatchOutcome | null
  review: ReviewRequest | null
  events: AgentEvent[]
}

export interface IngestRequest {
  rawSms: string
}

export interface IngestResponse {
  runId: string
}

export interface DecisionRequest {
  decision: ReviewDecision
  note?: string
}

export interface CreateOrderRequest {
  customerName: string
  customerPhone: string
  expectedAmount: number
}
