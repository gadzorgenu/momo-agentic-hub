import { z } from 'zod'
import type { CreateOrderRequest, DecisionRequest, IngestRequest, ParsedSms } from '../contracts.js'

export const ParsedSmsSchema = z.object({
  provider: z.enum(['MTN', 'TELECEL', 'AT', 'UNKNOWN']),
  momoTxId: z.string().trim().min(4).max(64),
  senderName: z.string().trim().min(1).max(120),
  senderPhone: z.string().regex(/^0\d{9}$/, 'Ghana phone number in local 0XXXXXXXXX format'),
  amount: z.number().positive().max(1_000_000),
  transactedAt: z.iso.datetime({ offset: true }).nullable(),
})

export const IngestBodySchema = z.object({
  rawSms: z.string().trim().min(10).max(2000),
})

export const DecisionBodySchema = z.object({
  decision: z.enum(['ACCEPT', 'REQUEST_BALANCE', 'REJECT']),
  note: z.string().max(500).optional(),
})

export const CreateOrderBodySchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(9).max(16),
  expectedAmount: z.number().positive().max(1_000_000),
})

// Compile-time guarantees that the Zod schemas and the shared contract agree.
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const contractChecks: [
  Equals<z.infer<typeof ParsedSmsSchema>, ParsedSms>,
  Equals<z.infer<typeof IngestBodySchema>, IngestRequest>,
  Equals<z.infer<typeof DecisionBodySchema>, DecisionRequest>,
  Equals<z.infer<typeof CreateOrderBodySchema>, CreateOrderRequest>,
] = [true, true, true, true]
void contractChecks
