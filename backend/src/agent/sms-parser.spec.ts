import { describe, expect, it } from 'vitest'
import { isGroundedInSms, normalizeGhanaPhone, parseMomoSms } from './sms-parser.js'

export const SAMPLE_SMS = {
  mtn: 'Payment received for GHS 150.00 from KWAME MENSAH 233241234567. Current Balance: GHS 1,250.00. Available Balance: GHS 1,250.00. Reference: Order 1001. Transaction ID: 51234567890. TRANSACTION FEE: 0.00',
  telecel:
    '0000012345678 Confirmed. You have received GHS95.50 from 0201234567 - AMA SERWAA on 2026-05-01 at 10:15:22. Your Telecel Cash balance is GHS300.00.',
  at: 'AT Money: You have received GHS 20.00 from 0271234567 KOFI BOATENG. Trans ID: ATX7781234. Date: 01/05/2026 10:15. New balance: GHS 45.00',
}

describe('parseMomoSms', () => {
  it('parses an MTN MoMo payment and ignores the balance amounts', () => {
    const r = parseMomoSms(SAMPLE_SMS.mtn)
    expect(r).toEqual({
      ok: true,
      value: {
        provider: 'MTN',
        momoTxId: '51234567890',
        senderName: 'KWAME MENSAH',
        senderPhone: '0241234567',
        amount: 150,
        transactedAt: null,
      },
    })
  })

  it('parses a Telecel Cash payment with leading transaction ID and timestamp', () => {
    const r = parseMomoSms(SAMPLE_SMS.telecel)
    expect(r.ok && r.value).toEqual({
      provider: 'TELECEL',
      momoTxId: '0000012345678',
      senderName: 'AMA SERWAA',
      senderPhone: '0201234567',
      amount: 95.5,
      transactedAt: '2026-05-01T10:15:22.000Z',
    })
  })

  it('parses an AT Money payment with a day-first date', () => {
    const r = parseMomoSms(SAMPLE_SMS.at)
    expect(r.ok && r.value).toMatchObject({
      provider: 'AT',
      momoTxId: 'ATX7781234',
      senderName: 'KOFI BOATENG',
      senderPhone: '0271234567',
      amount: 20,
      transactedAt: '2026-05-01T10:15:00.000Z',
    })
  })

  it('reports missing fields instead of guessing', () => {
    const r = parseMomoSms('Your account balance is GHS 40.00. Thank you for using MoMo.')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toEqual(['amount', 'transaction ID', 'sender phone'])
  })
})

describe('normalizeGhanaPhone', () => {
  it.each([
    ['+233 24 123 4567', '0241234567'],
    ['233241234567', '0241234567'],
    ['0241234567', '0241234567'],
    ['241234567', '0241234567'],
    ['12345', null],
  ])('%s → %s', (input, expected) => expect(normalizeGhanaPhone(input)).toBe(expected))
})

describe('isGroundedInSms', () => {
  const parsed = { provider: 'MTN' as const, momoTxId: '51234567890', senderName: 'KWAME MENSAH', senderPhone: '0241234567', amount: 150, transactedAt: null }

  it('accepts values that appear in the SMS', () => {
    expect(isGroundedInSms(parsed, SAMPLE_SMS.mtn)).toBe(true)
  })

  it('rejects a hallucinated amount or transaction ID', () => {
    expect(isGroundedInSms({ ...parsed, amount: 15 }, SAMPLE_SMS.mtn)).toBe(false)
    expect(isGroundedInSms({ ...parsed, momoTxId: '99999999' }, SAMPLE_SMS.mtn)).toBe(false)
  })
})
