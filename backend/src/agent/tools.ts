import { z } from 'zod'
import {
  FetchOrderDetailsInput,
  FetchOrderDetailsOutput,
  VerifyMomoReceiptInput,
  VerifyMomoReceiptOutput,
  UpdateOrderStatusInput,
  UpdateOrderStatusOutput,
  OrderSchema,
} from '../tools/schemas.js'
import prisma from '../prisma/client.js'

export async function verifyMomoReceipt(input: unknown) {
  const parsed = VerifyMomoReceiptInput.parse(input)

  // naive parsing: look for numbers that look like amounts and refs
  const amountMatch = parsed.rawText.match(/(?:GHS|GHc|ghs)?\s?(\d+(?:\.\d{1,2})?)/i)
  const refMatch = parsed.rawText.match(/(ORD[-_]?\d{3,6}|MM|REF|REF:|TRX)[:#\s-]*([A-Z0-9-]+)/i)

  const reference = refMatch ? refMatch[1].toUpperCase() : undefined

  const output = VerifyMomoReceiptOutput.parse({
    matched: Boolean(amountMatch),
    reference: reference,
    amount: amountMatch ? Number(amountMatch[1]) : undefined,
    currency: amountMatch ? 'GHS' : undefined,
    sender: parsed.metadata?.sender || undefined,
    fees: undefined,
    confidence: amountMatch ? 0.9 : 0.2,
    parsedAt: new Date().toISOString(),
    notes: amountMatch ? 'Parsed by simple parser' : 'No amount found',
  })

  // Persist receipt for audit and idempotency
  try {
    await prisma.receipt.create({
      data: {
        source: parsed.source,
        rawText: parsed.rawText,
        reference: output.reference,
        amount: output.amount ?? undefined,
        parsedAt: output.parsedAt ? new Date(output.parsedAt) : undefined,
        metadata: parsed.metadata ?? undefined,
      },
    })
  } catch (e) {
    // ignore persistence errors for now; caller will handle
  }

  return output
}

export async function fetchOrderDetails(input: unknown) {
  const parsed = FetchOrderDetailsInput.parse(input)
  const order = await prisma.order.findUnique({ where: { orderId: parsed.orderId } })
  if (!order) return FetchOrderDetailsOutput.parse({ found: false })

  // map to OrderSchema shape
  const mapped = {
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    customerPhone: order.customerPhone ?? undefined,
    items: undefined,
    metadata: order.metadata ?? undefined,
  }

  return FetchOrderDetailsOutput.parse({ found: true, order: mapped })
}

export async function updateOrderStatus(input: unknown) {
  const parsed = UpdateOrderStatusInput.parse(input)

  const existing = await prisma.order.findUnique({ where: { orderId: parsed.orderId } })
  if (!existing) return UpdateOrderStatusOutput.parse({ success: false })

  const updated = await prisma.order.update({
    where: { orderId: parsed.orderId },
    data: {
      status: parsed.status as any,
      amount: parsed.amountReceived ?? existing.amount,
    },
  })

  // log reconciliation attempt
  try {
    await prisma.reconciliationAttempt.create({
      data: {
        orderId: updated.id,
        status: parsed.status,
        note: parsed.note ?? undefined,
      },
    })
  } catch (e) {
    // ignore
  }

  const mapped = {
    orderId: updated.orderId,
    amount: updated.amount,
    currency: updated.currency,
    status: updated.status,
    customerPhone: updated.customerPhone ?? undefined,
    items: undefined,
    metadata: updated.metadata ?? undefined,
  }

  return UpdateOrderStatusOutput.parse({ success: true, updatedAt: new Date().toISOString(), order: mapped })
}
