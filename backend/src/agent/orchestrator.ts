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

  // Try a few times in case of transient LLM errors
  let lastText: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a strict JSON planner: output ONLY a JSON array of steps. Do not add commentary.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.0,
        max_tokens: 800,
      }),
    })

    if (!res.ok) {
      // backoff then retry
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
      continue
    }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (!text) {
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      continue
    }
    lastText = text
    // proceed to parsing below
    break
  }
  if (!lastText) return null

  // Try to extract JSON from the model output. Models may wrap JSON in ``` or text.
  const extractJson = (s: string) => {
    const codeFence = /```(?:json)?\n([\s\S]*?)\n```/i.exec(s)
    const candidate = codeFence ? codeFence[1] : s
    // find first { or [ and parse from there
    const start = candidate.search(/[\[{]/)
    if (start === -1) return null
    const sub = candidate.slice(start)
    try {
      return JSON.parse(sub)
    } catch (e) {
      // attempt to balance braces by trimming trailing text
      for (let i = sub.length - 1; i >= 0; i--) {
        try {
          const maybe = sub.slice(0, i + 1)
          return JSON.parse(maybe)
        } catch (_err) {
          continue
        }
      }
      return null
    }
  }

  const parsed = extractJson(lastText)
  if (!Array.isArray(parsed)) return null

  // Validate tools and inputs
  const steps: Step[] = []
  for (const p of parsed) {
    if (!p || typeof p !== 'object') return null
    const tool = String(p.tool || '')
    if (!ALLOWED_TOOLS.has(tool)) return null
    const input = p.input && typeof p.input === 'object' ? p.input : {}
    // Basic sanity checks per tool
    if (tool === 'verifyMomoReceipt' && !input.rawText) return null
    if (tool === 'fetchOrderDetails' && !input.orderId) return null
    // updateOrderStatus will be allowed but typically not planned automatically
    steps.push({ tool, input })
  }
  return steps
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
