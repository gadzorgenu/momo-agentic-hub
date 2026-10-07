import { Send, Sparkles, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { cx, ghs } from '../format'
import { useToast } from '../toast-context'
import { Button, Field, Input, Kbd, Modal } from './ui'

type Sample = { label: string; provider: 'MTN' | 'Telecel' | 'AT' | 'Unknown'; sms: string }

// Samples line up with the seeded orders (backend/prisma/seed.js).
const SAMPLES: Sample[] = [
  {
    label: 'MTN · exact',
    provider: 'MTN',
    sms: 'Payment received for GHS 150.00 from KWAME MENSAH 233241234567. Current Balance: GHS 1,250.00. Available Balance: GHS 1,250.00. Reference: Order 1001. Transaction ID: 51234567890. TRANSACTION FEE: 0.00',
  },
  {
    label: 'Telecel · underpaid',
    provider: 'Telecel',
    sms: '0000012345678 Confirmed. You have received GHS95.50 from 0201234567 - AMA SERWAA on 2026-05-01 at 10:15:22. Your Telecel Cash balance is GHS300.00.',
  },
  {
    label: 'AT · overpaid',
    provider: 'AT',
    sms: 'AT Money: You have received GHS 20.00 from 0271234567 KOFI BOATENG. Trans ID: ATX7781234. Date: 01/05/2026 10:15. New balance: GHS 45.00',
  },
  {
    label: 'Unmatched',
    provider: 'Unknown',
    sms: 'Payment received for GHS 42.00 from YAW DONKOR 233599887766. Current Balance: GHS 900.00. Transaction ID: 61234500001.',
  },
]

const PROVIDER_STYLES: Record<Sample['provider'], string> = {
  MTN: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  Telecel: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  AT: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
  Unknown: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
}

const MAX_CHARS = 2000

export function IngestDialog({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (runId: string) => void }) {
  const [sms, setSms] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = sms.trim()

  const submit = async () => {
    if (!trimmed || sms.length > MAX_CHARS) return
    setSubmitting(true)
    setError(null)
    try {
      const { runId } = await api.ingest({ rawSms: trimmed })
      setSms('')
      onStarted(runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ingest MoMo SMS"
      description="Paste a payment SMS. The agent will parse it, match it to an order and reconcile it."
      size="lg"
      footer={
        <>
          <span className="mr-auto hidden text-[11px] text-slate-500 sm:block">
            <Kbd>⌘</Kbd> + <Kbd>Enter</Kbd> to submit
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Send} loading={submitting} disabled={!trimmed || sms.length > MAX_CHARS} onClick={() => void submit()}>
            Reconcile payment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          value={sms}
          autoFocus
          onChange={(e) => setSms(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && void submit()}
          rows={6}
          placeholder="Paste an MTN MoMo, Telecel Cash or AT Money payment SMS…"
          aria-label="MoMo SMS"
          className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
        />
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
            <Sparkles className="size-3 text-amber-500" /> Try a sample
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button key={s.label} type="button" onClick={() => setSms(s.sms)} className={cx('rounded-full border px-2.5 py-1 text-xs font-medium transition', PROVIDER_STYLES[s.provider])}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function NewOrderDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ customerName: '', customerPhone: '', expectedAmount: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createOrder({ ...form, expectedAmount: Number(form.expectedAmount) })
      toast({ variant: 'success', title: 'Order created', description: `${form.customerName} · ${ghs(Number(form.expectedAmount))}` })
      setForm({ customerName: '', customerPhone: '', expectedAmount: '' })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New pending order"
      description="Incoming MoMo payments are matched against pending orders by phone, name and amount."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-order" icon={UserPlus} loading={saving}>
            Create order
          </Button>
        </>
      }
    >
      <form id="new-order" onSubmit={submit} className="space-y-3">
        <Field label="Customer name" required>
          <Input required autoFocus value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Ama Serwaa" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="MoMo number" required>
            <Input required value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="024 123 4567" />
          </Field>
          <Field label="Amount (GHS)" required>
            <Input required type="number" step="0.01" min="0.01" value={form.expectedAmount} onChange={(e) => setForm({ ...form, expectedAmount: e.target.value })} placeholder="150.00" />
          </Field>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </form>
    </Modal>
  )
}
