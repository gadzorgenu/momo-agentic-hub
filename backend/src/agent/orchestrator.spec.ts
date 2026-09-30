import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma BEFORE importing orchestrator (it calls planRun which might call prisma via agent.service)
vi.mock('../prisma/client.js', () => ({
  default: {
    reconciliationAttempt: { create: vi.fn() },
  },
}))

// Mock fetch globally for OpenAI calls
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { planRun } from './orchestrator.js'

describe('planRun – heuristic fallback (no OPENAI_API_KEY)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.OPENAI_API_KEY
  })

  it('produces verifyMomoReceipt step from any receipt text', async () => {
    const steps = await planRun('GHS 150 from sender', 'manual')
    expect(steps.length).toBeGreaterThanOrEqual(1)
    expect(steps[0].tool).toBe('verifyMomoReceipt')
    expect(steps[0].input.rawText).toBe('GHS 150 from sender')
  })

  it('adds fetchOrderDetails step when orderId found in text', async () => {
    const steps = await planRun('You paid GHS 150 for ORD-1001', 'manual')
    const tools = steps.map((s) => s.tool)
    expect(tools).toContain('verifyMomoReceipt')
    expect(tools).toContain('fetchOrderDetails')
    const fetchStep = steps.find((s) => s.tool === 'fetchOrderDetails')!
    expect(fetchStep.input.orderId).toBe('ORD-1001')
  })

  it('does NOT add fetchOrderDetails when no orderId in text', async () => {
    const steps = await planRun('GHS 80 random payment', 'manual')
    expect(steps.every((s) => s.tool !== 'fetchOrderDetails')).toBe(true)
  })
})

describe('planRun – OpenAI branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
  })

  it('uses OpenAI plan when API returns valid JSON steps', async () => {
    const plan = [
      { tool: 'verifyMomoReceipt', input: { rawText: 'GHS 150', source: 'mtn' } },
      { tool: 'fetchOrderDetails', input: { orderId: 'ORD-1001' } },
    ]
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(plan) } }],
      }),
    })

    const steps = await planRun('GHS 150 ORD-1001', 'mtn')
    expect(steps[0].tool).toBe('verifyMomoReceipt')
    expect(steps[1].tool).toBe('fetchOrderDetails')
  })

  it('falls back to heuristic when OpenAI returns invalid JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'sorry I cannot help with that' } }],
      }),
    })

    const steps = await planRun('GHS 150 ORD-1001', 'manual')
    // should fall back to heuristic
    expect(steps.some((s) => s.tool === 'verifyMomoReceipt')).toBe(true)
  })

  it('falls back to heuristic when OpenAI request fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false })
    fetchMock.mockResolvedValueOnce({ ok: false })
    fetchMock.mockResolvedValueOnce({ ok: false })

    const steps = await planRun('GHS 150 ORD-1001', 'manual')
    expect(steps.some((s) => s.tool === 'verifyMomoReceipt')).toBe(true)
  })
})
