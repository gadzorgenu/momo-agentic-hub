import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import type { ParsedSms } from '../contracts.js'
import { ParsedSmsSchema } from './schemas.js'
import { detectProvider, isGroundedInSms, normalizeGhanaPhone, parseMomoSms } from './sms-parser.js'

export type ExtractionResult =
  | { ok: true; parsed: ParsedSms; method: 'llm' | 'regex'; reasoning: string }
  | { ok: false; reason: string }

export interface SmsExtractor {
  extract(sms: string): Promise<ExtractionResult>
}

// Every field is required + nullable because OpenAI strict structured output disallows optional keys.
const LlmExtractionSchema = z.object({
  reasoning: z.string().describe('One or two sentences on how the fields were identified.'),
  isIncomingPayment: z.boolean().describe('True only if the SMS confirms money RECEIVED by the merchant.'),
  provider: z.enum(['MTN', 'TELECEL', 'AT', 'UNKNOWN']),
  momoTxId: z.string().nullable().describe('Transaction / Financial Transaction ID exactly as written.'),
  senderName: z.string().nullable(),
  senderPhone: z.string().nullable().describe('Sender phone number exactly as written.'),
  amount: z.number().nullable().describe('Amount received in GHS. Never a balance or fee.'),
  transactedAt: z.string().nullable().describe('ISO 8601 timestamp in UTC (Ghana is UTC+0), or null.'),
})

const SYSTEM_PROMPT = `You extract structured data from Ghanaian Mobile Money SMS notifications (MTN MoMo, Telecel Cash, AT Money).
Copy identifiers exactly as they appear. Do not invent values: use null for anything not present.
The amount is the money received, never an account balance, fee, or E-Levy.
Dates in Ghanaian SMS are day-first (DD/MM/YYYY).`

export class OpenAiSmsExtractor implements SmsExtractor {
  private readonly model

  constructor(apiKey: string, modelName = process.env.OPENAI_MODEL ?? 'gpt-4o-mini') {
    this.model = new ChatOpenAI({ apiKey, model: modelName, temperature: 0, timeout: 15_000, maxRetries: 1 }).withStructuredOutput(
      LlmExtractionSchema,
      { name: 'extract_momo_sms', strict: true },
    )
  }

  async extract(sms: string): Promise<ExtractionResult> {
    const fallback = parseMomoSms(sms)
    let llmNote: string
    try {
      const out = await this.model.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: sms },
      ])
      if (!out.isIncomingPayment) return { ok: false, reason: `Not an incoming payment SMS: ${out.reasoning}` }
      const detected = detectProvider(sms)
      const candidate = ParsedSmsSchema.safeParse({
        // Provider wording is a fixed template, so a deterministic match beats the model's guess.
        provider: detected !== 'UNKNOWN' ? detected : out.provider,
        momoTxId: out.momoTxId,
        senderName: out.senderName ?? 'UNKNOWN',
        senderPhone: out.senderPhone ? normalizeGhanaPhone(out.senderPhone) : null,
        amount: out.amount,
        transactedAt: out.transactedAt,
      })
      if (candidate.success && isGroundedInSms(candidate.data, sms)) {
        // Date formats are ambiguous to the model (01/05 vs 05/01); a deterministic parse wins when present.
        const transactedAt = (fallback.ok && fallback.value.transactedAt) || candidate.data.transactedAt
        return { ok: true, parsed: { ...candidate.data, transactedAt }, method: 'llm', reasoning: out.reasoning }
      }
      llmNote = candidate.success
        ? 'LLM output was not grounded in the SMS text'
        : `LLM output failed validation (${candidate.error.issues.map((i) => i.path.join('.')).join(', ')})`
    } catch (err) {
      llmNote = `LLM extraction failed (${err instanceof Error ? err.message : String(err)})`
    }
    if (fallback.ok) {
      return { ok: true, parsed: fallback.value, method: 'regex', reasoning: `${llmNote}; used deterministic parser.` }
    }
    return { ok: false, reason: `${llmNote}; deterministic parser could not find: ${fallback.missing.join(', ')}` }
  }
}

export class RegexSmsExtractor implements SmsExtractor {
  async extract(sms: string): Promise<ExtractionResult> {
    const result = parseMomoSms(sms)
    if (!result.ok) return { ok: false, reason: `Could not find: ${result.missing.join(', ')}` }
    return { ok: true, parsed: result.value, method: 'regex', reasoning: 'Parsed with deterministic provider patterns (no OPENAI_API_KEY set).' }
  }
}

export function createExtractor(): SmsExtractor {
  const key = process.env.OPENAI_API_KEY
  return key ? new OpenAiSmsExtractor(key) : new RegexSmsExtractor()
}
