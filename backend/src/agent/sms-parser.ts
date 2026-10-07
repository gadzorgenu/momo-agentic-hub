import type { MomoProvider, ParsedSms } from '../contracts.js'
import { ParsedSmsSchema } from './schemas.js'

/** Normalises Ghana numbers (+233241234567, 233241234567, 241234567) to 0241234567. */
export function normalizeGhanaPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('233')) return `0${digits.slice(3)}`
  if (digits.length === 10 && digits.startsWith('0')) return digits
  if (digits.length === 9) return `0${digits}`
  return null
}

/** Converts a GHS amount to integer pesewas so comparisons are exact. */
export function toPesewas(amount: number): number {
  return Math.round(amount * 100)
}

export function detectProvider(sms: string): MomoProvider {
  if (/telecel|vodafone/i.test(sms)) return 'TELECEL'
  if (/\bAT\s*Money\b|airteltigo|\bATMoney\b/i.test(sms)) return 'AT'
  if (/\bMTN\b|MoMo|Financial Transaction Id|Payment received for/i.test(sms)) return 'MTN'
  return 'UNKNOWN'
}

const AMOUNT = String.raw`(?:GHS|GH₵|GHC|GH¢|¢)\s?([\d,]+(?:\.\d{1,2})?)`
const PHONE = String.raw`(?:\+?233|0)\s?\d{2}\s?\d{3}\s?\d{4}`

function extractAmount(sms: string): number | null {
  // Every GHS amount in the message; skip balances and fees, take the first remaining.
  for (const m of sms.matchAll(new RegExp(AMOUNT, 'gi'))) {
    const before = sms.slice(Math.max(0, m.index - 30), m.index).toLowerCase()
    if (/balance|fee|charge|levy|e-levy|tax/.test(before)) continue
    const value = Number(m[1].replace(/,/g, ''))
    if (Number.isFinite(value) && value > 0) return value
  }
  return null
}

function extractTxId(sms: string): string | null {
  const labelled =
    /(?:Financial\s+Transaction\s+Id|Transaction\s+ID|Trans(?:action)?\.?\s*ID|Txn\s*ID|TxID|Ref(?:erence)?\s*(?:No|ID))\s*[:.#]?\s*([A-Za-z0-9][A-Za-z0-9.-]{3,})/i.exec(
      sms,
    )
  if (labelled) return labelled[1].replace(/\.$/, '')
  // Telecel Cash puts the id first: "0000012345678 Confirmed. You have received ..."
  const leading = /^\s*([A-Za-z0-9]{6,})\s+Confirmed/i.exec(sms)
  return leading ? leading[1] : null
}

function extractSender(sms: string): { name: string | null; phone: string | null } {
  const fromClause = /\bfrom\s+(.+?)(?=\s+on\s+\d|\.\s|\s+Current\b|\s+Trans|\s+Reference\b|\s+Ref\b|\s+Your\b|\s+New\b|$)/i.exec(sms)
  const scope = fromClause ? fromClause[1] : sms
  const phoneMatch = new RegExp(PHONE).exec(scope) ?? new RegExp(PHONE).exec(sms)
  const phone = phoneMatch ? normalizeGhanaPhone(phoneMatch[0]) : null

  let name: string | null = null
  if (fromClause) {
    name = fromClause[1]
      .replace(new RegExp(PHONE, 'g'), ' ')
      .replace(/[-–,.:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!/[a-z]/i.test(name)) name = null
  }
  return { name, phone }
}

function extractTimestamp(sms: string): string | null {
  // ISO-ish: "on 2026-05-01 at 10:15:22"
  const iso = /(\d{4})-(\d{2})-(\d{2})\s+(?:at\s+)?(\d{2}):(\d{2})(?::(\d{2}))?/.exec(sms)
  // Day-first: "Date: 01/05/2026 10:15" or "on 01-05-2026 at 10:15"
  const dmy = /(\d{2})[/-](\d{2})[/-](\d{4})\s+(?:at\s+)?(\d{2}):(\d{2})(?::(\d{2}))?/.exec(sms)
  let parts: string[] | null = null
  if (iso) parts = [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6] ?? '00']
  else if (dmy) parts = [dmy[3], dmy[2], dmy[1], dmy[4], dmy[5], dmy[6] ?? '00']
  if (!parts) return null
  const [y, mo, d, h, mi, s] = parts
  // Ghana is UTC+0 year-round.
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export type ParseResult = { ok: true; value: ParsedSms } | { ok: false; missing: string[] }

/** Deterministic parser for MTN MoMo, Telecel Cash and AT Money "money received" SMS. */
export function parseMomoSms(sms: string): ParseResult {
  const amount = extractAmount(sms)
  const momoTxId = extractTxId(sms)
  const { name, phone } = extractSender(sms)

  const missing = [
    !amount && 'amount',
    !momoTxId && 'transaction ID',
    !phone && 'sender phone',
  ].filter(Boolean) as string[]
  if (missing.length) return { ok: false, missing }

  const result = ParsedSmsSchema.safeParse({
    provider: detectProvider(sms),
    momoTxId,
    senderName: name ?? 'UNKNOWN',
    senderPhone: phone,
    amount,
    transactedAt: extractTimestamp(sms),
  })
  if (!result.success) return { ok: false, missing: result.error.issues.map((i) => i.path.join('.')) }
  return { ok: true, value: result.data }
}

/**
 * Checks that values claimed by the LLM actually appear in the SMS, so a
 * hallucinated transaction ID or amount can never be written to the ledger.
 */
export function isGroundedInSms(parsed: ParsedSms, sms: string): boolean {
  if (!sms.includes(parsed.momoTxId)) return false
  const smsDigits = sms.replace(/\D/g, '')
  if (!smsDigits.includes(parsed.senderPhone.slice(1))) return false
  const amounts = [...sms.matchAll(/([\d,]+(?:\.\d{1,2})?)/g)].map((m) => toPesewas(Number(m[1].replace(/,/g, ''))))
  return amounts.includes(toPesewas(parsed.amount))
}
