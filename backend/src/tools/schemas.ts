import { z } from 'zod'

// Shared types
export const Timestamp = z.string().datetime()

// Order shape returned by fetchOrderDetails
export const OrderSchema = z.object({
  orderId: z.string(),
  amount: z.number(),
  currency: z.string().default('GHS'),
  status: z.enum(['pending', 'paid', 'partial', 'failed', 'cancelled']),
  customerPhone: z.string().optional(),
  items: z.array(z.object({ sku: z.string(), name: z.string().optional(), qty: z.number().optional() })).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

// fetchOrderDetails
export const FetchOrderDetailsInput = z.object({
  orderId: z.string().min(1),
})

export const FetchOrderDetailsOutput = z.object({
  found: z.boolean(),
  order: OrderSchema.optional(),
})

// verifyMomoReceipt: parse raw SMS/receipt into structured data
export const VerifyMomoReceiptInput = z.object({
  rawText: z.string().min(1),
  source: z.enum(['mtn', 'telecel', 'whatsapp', 'manual']).default('manual'),
  receivedAt: Timestamp.optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export const VerifyMomoReceiptOutput = z.object({
  matched: z.boolean(),
  reference: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  sender: z.string().optional(),
  fees: z.number().optional(),
  confidence: z.number().min(0).max(1).default(0),
  parsedAt: Timestamp.optional(),
  notes: z.string().optional(),
})

// updateOrderStatus: apply reconciliation decision
export const UpdateOrderStatusInput = z.object({
  orderId: z.string().min(1),
  status: z.enum(['paid', 'partial', 'failed', 'pending', 'cancelled']),
  amountReceived: z.number().optional(),
  paymentReference: z.string().optional(),
  note: z.string().optional(),
  approvedBy: z.string().optional(),
})

export const UpdateOrderStatusOutput = z.object({
  success: z.boolean(),
  updatedAt: Timestamp.optional(),
  order: OrderSchema.optional(),
})

// Export combined tool specs for registration
export const Tools = {
  fetchOrderDetails: { input: FetchOrderDetailsInput, output: FetchOrderDetailsOutput },
  verifyMomoReceipt: { input: VerifyMomoReceiptInput, output: VerifyMomoReceiptOutput },
  updateOrderStatus: { input: UpdateOrderStatusInput, output: UpdateOrderStatusOutput },
}

export type Order = z.infer<typeof OrderSchema>
export type FetchOrderDetailsInputT = z.infer<typeof FetchOrderDetailsInput>
export type FetchOrderDetailsOutputT = z.infer<typeof FetchOrderDetailsOutput>
export type VerifyMomoReceiptInputT = z.infer<typeof VerifyMomoReceiptInput>
export type VerifyMomoReceiptOutputT = z.infer<typeof VerifyMomoReceiptOutput>
export type UpdateOrderStatusInputT = z.infer<typeof UpdateOrderStatusInput>
export type UpdateOrderStatusOutputT = z.infer<typeof UpdateOrderStatusOutput>