import { describe, expect, it } from 'vitest'
import type { ParsedSms } from '../contracts.js'
import { matchPayment, type CandidateOrder } from './reconciliation.js'

const payment = (over: Partial<ParsedSms> = {}): ParsedSms => ({
  provider: 'MTN',
  momoTxId: 'TX1',
  senderName: 'KWAME MENSAH',
  senderPhone: '0241234567',
  amount: 150,
  transactedAt: null,
  ...over,
})

const order = (id: string, over: Partial<CandidateOrder> = {}): CandidateOrder => ({
  id,
  customerName: 'Someone Else',
  customerPhone: '0559999999',
  expectedAmount: 999,
  createdAt: new Date(`2026-01-0${id.length}T00:00:00Z`),
  ...over,
})

describe('matchPayment', () => {
  it('classifies an exact match by phone', () => {
    const r = matchPayment(payment(), [order('a', { customerPhone: '+233241234567', expectedAmount: 150 })])
    expect(r).toMatchObject({ outcome: 'EXACT_MATCH', matchedBy: 'phone', difference: 0 })
  })

  it('flags underpayment with the shortfall, using exact pesewa arithmetic', () => {
    const r = matchPayment(payment({ amount: 149.01 }), [order('a', { customerPhone: '0241234567', expectedAmount: 150 })])
    expect(r).toMatchObject({ outcome: 'UNDERPAYMENT', difference: -0.99 })
  })

  it('flags overpayment with the excess', () => {
    const r = matchPayment(payment({ amount: 160 }), [order('a', { customerPhone: '0241234567', expectedAmount: 150 })])
    expect(r).toMatchObject({ outcome: 'OVERPAYMENT', difference: 10 })
  })

  it('prefers the exact-amount order when one customer has several pending', () => {
    const r = matchPayment(payment(), [
      order('a', { customerPhone: '0241234567', expectedAmount: 80 }),
      order('bb', { customerPhone: '0241234567', expectedAmount: 150 }),
    ])
    expect(r.order?.id).toBe('bb')
    expect(r.outcome).toBe('EXACT_MATCH')
  })

  it('falls back to the sender name when the phone differs', () => {
    const r = matchPayment(payment(), [order('a', { customerName: 'Kwame Mensah', expectedAmount: 150 })])
    expect(r).toMatchObject({ outcome: 'EXACT_MATCH', matchedBy: 'name' })
  })

  it('matches on amount alone only when exactly one order has that amount', () => {
    expect(matchPayment(payment(), [order('a', { expectedAmount: 150 })]).matchedBy).toBe('amount')
    expect(matchPayment(payment(), [order('a', { expectedAmount: 150 }), order('bb', { expectedAmount: 150 })]).outcome).toBe('UNMATCHED')
  })

  it('returns UNMATCHED when nothing fits', () => {
    expect(matchPayment(payment(), [order('a')])).toEqual({ order: null, matchedBy: null, outcome: 'UNMATCHED', difference: null })
  })
})
