import type { MatchOutcome, ParsedSms, ReviewDecision } from '../contracts.js'
import { normalizeGhanaPhone, toPesewas } from './sms-parser.js'

export interface CandidateOrder {
  id: string
  customerName: string
  customerPhone: string
  expectedAmount: number
  createdAt: Date
}

export interface MatchResult {
  order: CandidateOrder | null
  matchedBy: 'phone' | 'name' | 'amount' | null
  outcome: Exclude<MatchOutcome, 'DUPLICATE'>
  /** amountPaid - expectedAmount in GHS, null when unmatched. */
  difference: number | null
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Picks the pending order a payment belongs to, then classifies it.
 * Priority: sender phone, then sender name, then a unique exact-amount match.
 * Within a group, an exact-amount order wins, otherwise the oldest.
 */
export function matchPayment(parsed: ParsedSms, pending: CandidateOrder[]): MatchResult {
  const paid = toPesewas(parsed.amount)
  const byAge = [...pending].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const pick = (group: CandidateOrder[]) => group.find((o) => toPesewas(o.expectedAmount) === paid) ?? group[0]

  const byPhone = byAge.filter((o) => normalizeGhanaPhone(o.customerPhone) === parsed.senderPhone)
  const byName = parsed.senderName === 'UNKNOWN' ? [] : byAge.filter((o) => normName(o.customerName) === normName(parsed.senderName))
  const byAmount = byAge.filter((o) => toPesewas(o.expectedAmount) === paid)

  let order: CandidateOrder | null = null
  let matchedBy: MatchResult['matchedBy'] = null
  if (byPhone.length) [order, matchedBy] = [pick(byPhone), 'phone']
  else if (byName.length) [order, matchedBy] = [pick(byName), 'name']
  // An amount alone is weak evidence: only trust it when exactly one order fits.
  else if (byAmount.length === 1) [order, matchedBy] = [byAmount[0], 'amount']

  if (!order) return { order: null, matchedBy: null, outcome: 'UNMATCHED', difference: null }

  const diff = paid - toPesewas(order.expectedAmount)
  const outcome = diff === 0 ? 'EXACT_MATCH' : diff < 0 ? 'UNDERPAYMENT' : 'OVERPAYMENT'
  return { order, matchedBy, outcome, difference: diff / 100 }
}

export function allowedDecisions(outcome: MatchOutcome): ReviewDecision[] {
  switch (outcome) {
    case 'UNDERPAYMENT':
      return ['ACCEPT', 'REQUEST_BALANCE', 'REJECT']
    case 'OVERPAYMENT':
      return ['ACCEPT', 'REJECT']
    case 'UNMATCHED':
      return ['REJECT']
    default:
      return []
  }
}
