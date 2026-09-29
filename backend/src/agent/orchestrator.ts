import { config } from 'dotenv'
config()

type Step = { tool: string; input: Record<string, any> }

const ALLOWED_TOOLS = new Set(['verifyMomoReceipt', 'fetchOrderDetails', 'updateOrderStatus'])

async function callOpenAIPlan(rawText: string, source = 'manual') {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null

  const prompt = `You are a planner that returns a JSON array of steps for reconciliation. Each step must be an object with keys: "tool" (one of verifyMomoReceipt, fetchOrderDetails, updateOrderStatus) and "input" (an object). Return ONLY JSON.

Example output:
[ { "tool": "verifyMomoReceipt", "input": { "rawText": "...", "source": "mtn" } }, { "tool": "fetchOrderDetails", "input": { "orderId": "ORD-1001" } } ]

Now plan steps for this receipt text:\n\n${rawText}\n\nRespond with JSON.`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You output a JSON array of steps only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return null
    // Validate tools
    const steps: Step[] = []
    for (const p of parsed) {
      if (!p?.tool || !ALLOWED_TOOLS.has(p.tool)) return null
      steps.push({ tool: p.tool, input: p.input ?? {} })
    }
    return steps
  } catch (e) {
    return null
  }
}

/**
 * planRun: Lightweight orchestrator that returns a list of tool steps.
 * If `OPENAI_API_KEY` is present this will call OpenAI to get a JSON plan,
 * otherwise it falls back to a deterministic heuristic so the system works
 * without an API key.
 */
export async function planRun(rawText: string, source = 'manual'): Promise<Step[]> {
  // Try LLM planner first
  const llmPlan = await callOpenAIPlan(rawText, source)
  if (llmPlan) return llmPlan

  // Fallback heuristic
  const steps: Step[] = []
  steps.push({ tool: 'verifyMomoReceipt', input: { rawText, source } })
  const orderRefMatch = rawText.match(/(ORD[-_]?\d{3,6})/i)
  if (orderRefMatch) steps.push({ tool: 'fetchOrderDetails', input: { orderId: orderRefMatch[1].toUpperCase() } })
  return steps
}
