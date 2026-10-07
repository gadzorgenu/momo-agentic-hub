import { Loader2, MessageSquareText, Send } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { Panel } from './ui'

// Samples line up with the seeded orders (backend/prisma/seed.js).
const SAMPLES = [
  {
    label: 'MTN · exact',
    sms: 'Payment received for GHS 150.00 from KWAME MENSAH 233241234567. Current Balance: GHS 1,250.00. Available Balance: GHS 1,250.00. Reference: Order 1001. Transaction ID: 51234567890. TRANSACTION FEE: 0.00',
  },
  {
    label: 'Telecel · underpaid',
    sms: '0000012345678 Confirmed. You have received GHS95.50 from 0201234567 - AMA SERWAA on 2026-05-01 at 10:15:22. Your Telecel Cash balance is GHS300.00.',
  },
  {
    label: 'AT · overpaid',
    sms: 'AT Money: You have received GHS 20.00 from 0271234567 KOFI BOATENG. Trans ID: ATX7781234. Date: 01/05/2026 10:15. New balance: GHS 45.00',
  },
  {
    label: 'Unmatched',
    sms: 'Payment received for GHS 42.00 from YAW DONKOR 233599887766. Current Balance: GHS 900.00. Transaction ID: 61234500001.',
  },
]

export function IngestPanel({ onStarted }: { onStarted: (runId: string) => void }) {
  const [sms, setSms] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const { runId } = await api.ingest({ rawSms: sms.trim() })
      onStarted(runId)
      setSms('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Panel title="Ingest MoMo SMS" icon={<MessageSquareText className="size-4 text-amber-500" />}>
      <div className="space-y-3 p-4">
        <textarea
          value={sms}
          onChange={(e) => setSms(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && sms.trim()) void submit()
          }}
          rows={5}
          placeholder="Paste an MTN MoMo, Telecel Cash or AT Money payment SMS…"
          className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
        />
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSms(s.sms)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
            >
              {s.label}
            </button>
          ))}
        </div>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!sms.trim() || submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Reconcile payment
        </button>
      </div>
    </Panel>
  )
}
