import { tool } from '@langchain/core/tools'
import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { ParsedSmsSchema } from './schemas.js'

/** Thrown when a conditional order update finds the order no longer in the expected state. */
export class OrderStateConflictError extends Error {}

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

/**
 * Zod-typed tools the reconciliation graph uses for every database side effect.
 * Inputs are validated by the tool wrapper, so a malformed call never reaches Prisma.
 * Order updates are conditional on the current status to stay safe under concurrent runs.
 */
export function createTools(db: PrismaClient) {
  const findTransaction = tool(
    async ({ momoTxId }) => {
      const tx = await db.transaction.findUnique({ where: { momoTxId }, select: { id: true, orderId: true, createdAt: true } })
      return tx ? { exists: true as const, transactionId: tx.id, orderId: tx.orderId, processedAt: tx.createdAt.toISOString() } : { exists: false as const }
    },
    {
      name: 'find_transaction',
      description: 'Check whether a MoMo transaction ID has already been processed.',
      schema: z.object({ momoTxId: z.string().min(1) }),
    },
  )

  const listPendingOrders = tool(
    async () =>
      db.order.findMany({
        where: { status: 'PENDING' },
        select: { id: true, customerName: true, customerPhone: true, expectedAmount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
    {
      name: 'list_pending_orders',
      description: 'List orders awaiting payment, oldest first.',
      schema: z.object({}),
    },
  )

  const settleExactMatch = tool(
    async ({ parsed, rawSms, orderId }) => {
      try {
        return await db.$transaction(async (trx) => {
          const { count } = await trx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'VERIFIED' } })
          if (count === 0) throw new OrderStateConflictError(`Order ${orderId} is no longer PENDING`)
          const tx = await trx.transaction.create({ data: toTransactionData(parsed, rawSms, orderId) })
          return { duplicate: false as const, transactionId: tx.id, orderStatus: 'VERIFIED' as const }
        })
      } catch (err) {
        if (isUniqueViolation(err)) return { duplicate: true as const }
        throw err
      }
    },
    {
      name: 'settle_exact_match',
      description: 'Record the transaction against the order and mark the order VERIFIED.',
      schema: z.object({ parsed: ParsedSmsSchema, rawSms: z.string(), orderId: z.uuid() }),
    },
  )

  const flagDiscrepancy = tool(
    async ({ parsed, rawSms, orderId }) => {
      try {
        return await db.$transaction(async (trx) => {
          if (orderId) {
            const { count } = await trx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'DISCREPANCY_FLAGGED' } })
            if (count === 0) throw new OrderStateConflictError(`Order ${orderId} is no longer PENDING`)
          }
          // Recording the transaction now claims its momoTxId, so replays are rejected while a human reviews.
          const tx = await trx.transaction.create({ data: toTransactionData(parsed, rawSms, orderId) })
          return { duplicate: false as const, transactionId: tx.id, orderStatus: orderId ? ('DISCREPANCY_FLAGGED' as const) : null }
        })
      } catch (err) {
        if (isUniqueViolation(err)) return { duplicate: true as const }
        throw err
      }
    },
    {
      name: 'flag_discrepancy',
      description: 'Record the transaction and flag its order (if any) for human review.',
      schema: z.object({ parsed: ParsedSmsSchema, rawSms: z.string(), orderId: z.uuid().nullable() }),
    },
  )

  const applyReviewDecision = tool(
    async ({ transactionId, orderId, decision }) =>
      db.$transaction(async (trx) => {
        if (!orderId) {
          // Unmatched payment: the transaction stays on record (so it cannot be replayed) with no order.
          return { orderStatus: null }
        }
        const status = decision === 'ACCEPT' ? 'VERIFIED' : decision === 'REJECT' ? 'REJECTED' : 'DISCREPANCY_FLAGGED'
        const { count } = await trx.order.updateMany({ where: { id: orderId, status: 'DISCREPANCY_FLAGGED' }, data: { status } })
        if (count === 0) throw new OrderStateConflictError(`Order ${orderId} is no longer DISCREPANCY_FLAGGED`)
        if (decision === 'REJECT') {
          await trx.transaction.update({ where: { id: transactionId }, data: { orderId: null } })
        }
        return { orderStatus: status }
      }),
    {
      name: 'apply_review_decision',
      description: 'Apply the operator decision: ACCEPT verifies the order, REQUEST_BALANCE keeps it flagged, REJECT rejects it and unlinks the payment.',
      schema: z.object({
        transactionId: z.uuid(),
        orderId: z.uuid().nullable(),
        decision: z.enum(['ACCEPT', 'REQUEST_BALANCE', 'REJECT']),
      }),
    },
  )

  return { findTransaction, listPendingOrders, settleExactMatch, flagDiscrepancy, applyReviewDecision }
}

export type ReconciliationTools = ReturnType<typeof createTools>

function toTransactionData(parsed: z.infer<typeof ParsedSmsSchema>, rawSms: string, orderId: string | null) {
  return {
    momoTxId: parsed.momoTxId,
    senderName: parsed.senderName,
    senderPhone: parsed.senderPhone,
    amountPaid: parsed.amount,
    rawSms,
    provider: parsed.provider,
    transactedAt: parsed.transactedAt ? new Date(parsed.transactedAt) : null,
    orderId,
  }
}
