import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock prisma BEFORE importing the module under test ──────────────────────
vi.mock('../prisma/client.js', () => ({
  default: {
    receipt: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    reconciliationAttempt: {
      create: vi.fn(),
    },
  },
}))

import prisma from '../prisma/client.js'
import { verifyMomoReceipt, fetchOrderDetails, updateOrderStatus } from './tools.js'

// ────────────────────────────────────────────────────────────────────────────
describe('verifyMomoReceipt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses a valid GHS receipt', async () => {
    ;(prisma.receipt.findUnique as any).mockResolvedValue(null)
    ;(prisma.receipt.create as any).mockResolvedValue({})

    const result = await verifyMomoReceipt({
      rawText: 'You have received GHS 150 from +233501234567. Ref: ORD-1001',
      source: 'mtn',
    })

    expect(result.matched).toBe(true)
    expect(result.amount).toBe(150)
    expect(result.currency).toBe('GHS')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('returns low confidence when no amount found', async () => {
    ;(prisma.receipt.findUnique as any).mockResolvedValue(null)
    ;(prisma.receipt.create as any).mockResolvedValue({})

    const result = await verifyMomoReceipt({
      rawText: 'Hello world no money here',
      source: 'manual',
    })

    expect(result.matched).toBe(false)
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('deduplicates by idempotencyKey when receipt exists', async () => {
    const existingReceipt = {
      id: 'r1',
      amount: 150,
      currency: 'GHS',
      reference: 'ORD-1001',
      parsedAt: new Date(),
      metadata: { sender: '+233501234567' },
    }
    ;(prisma.receipt.findUnique as any).mockResolvedValue(existingReceipt)

    const result = await verifyMomoReceipt({
      rawText: 'GHS 150 ORD-1001',
      source: 'mtn',
      metadata: { idempotencyKey: 'key-abc' },
    })

    expect(result.notes).toMatch(/[Dd]eduplicated/)
    expect(prisma.receipt.create).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('fetchOrderDetails', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns found:false when order does not exist', async () => {
    ;(prisma.order.findUnique as any).mockResolvedValue(null)
    const result = await fetchOrderDetails({ orderId: 'ORD-9999' })
    expect(result.found).toBe(false)
    expect(result.order).toBeUndefined()
  })

  it('returns found:true with mapped order when order exists', async () => {
    ;(prisma.order.findUnique as any).mockResolvedValue({
      id: 'cuid-1',
      orderId: 'ORD-1001',
      amount: 150,
      currency: 'GHS',
      status: 'pending',
      customerPhone: '+233501234567',
      metadata: null,
    })

    const result = await fetchOrderDetails({ orderId: 'ORD-1001' })
    expect(result.found).toBe(true)
    expect(result.order?.orderId).toBe('ORD-1001')
    expect(result.order?.amount).toBe(150)
    expect(result.order?.status).toBe('pending')
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('updateOrderStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns success:false when order does not exist', async () => {
    ;(prisma.order.findUnique as any).mockResolvedValue(null)
    const result = await updateOrderStatus({ orderId: 'ORD-9999', status: 'paid' })
    expect(result.success).toBe(false)
  })

  it('updates the order and creates an audit attempt', async () => {
    const order = {
      id: 'cuid-1',
      orderId: 'ORD-1001',
      amount: 150,
      currency: 'GHS',
      status: 'paid',
      customerPhone: '+233501234567',
      metadata: null,
    }
    ;(prisma.order.findUnique as any).mockResolvedValue({ ...order, status: 'pending' })
    ;(prisma.order.update as any).mockResolvedValue(order)
    ;(prisma.reconciliationAttempt.create as any).mockResolvedValue({})

    const result = await updateOrderStatus(
      { orderId: 'ORD-1001', status: 'paid', amountReceived: 150 },
      'run-abc',
    )

    expect(result.success).toBe(true)
    expect(result.order?.status).toBe('paid')
    expect(prisma.reconciliationAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ runId: 'run-abc', status: 'paid' }),
      }),
    )
  })
})
