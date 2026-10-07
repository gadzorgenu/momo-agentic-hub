import { ClipboardList, Plus, ReceiptText, RefreshCw, ScrollText, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import type { LedgerData } from '../useLedger'
import { cx, dateTime, ghs, ORDER_STATUS } from '../format'
import { Badge, Panel } from './ui'

type Tab = 'orders' | 'transactions' | 'audit'

const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500'
const td = 'px-3 py-2 text-sm text-slate-700 whitespace-nowrap'

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing here yet.</p>}
    </div>
  )
}

function NewOrderForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', expectedAmount: '' })
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.createOrder({ ...form, expectedAmount: Number(form.expectedAmount) })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const input = 'rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
      <input required placeholder="Customer name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className={cx(input, 'min-w-0 flex-1')} />
      <input required placeholder="Phone (024…)" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className={cx(input, 'w-36')} />
      <input required type="number" step="0.01" min="0.01" placeholder="GHS" value={form.expectedAmount} onChange={(e) => setForm({ ...form, expectedAmount: e.target.value })} className={cx(input, 'w-28')} />
      <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
        Create
      </button>
      <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200" aria-label="Cancel">
        <X className="size-4" />
      </button>
      {error && <p className="w-full text-xs text-rose-700">{error}</p>}
    </form>
  )
}

export function Ledger({ data, error, onRefresh }: { data: LedgerData; error: string | null; onRefresh: () => void }) {
  const [tab, setTab] = useState<Tab>('orders')
  const [creating, setCreating] = useState(false)
  const tabs: { id: Tab; label: string; icon: typeof ClipboardList; count: number }[] = [
    { id: 'orders', label: 'Orders', icon: ClipboardList, count: data.orders.length },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText, count: data.transactions.length },
    { id: 'audit', label: 'Audit log', icon: ScrollText, count: data.audit.length },
  ]

  return (
    <Panel
      title="Ledger"
      icon={<ClipboardList className="size-4 text-slate-500" />}
      actions={
        <div className="flex items-center gap-1">
          {tab === 'orders' && !creating && (
            <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <Plus className="size-3.5" /> New order
            </button>
          )}
          <button type="button" onClick={onRefresh} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Refresh">
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      }
    >
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cx(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap',
              tab === id ? 'border-amber-500 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            <Icon className="size-3.5" />
            {label}
            <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">{count}</span>
          </button>
        ))}
      </nav>
      {error && <p className="bg-rose-50 px-4 py-2 text-xs text-rose-700">Could not load ledger: {error}</p>}

      {tab === 'orders' && (
        <>
          {creating && <NewOrderForm onCreated={onRefresh} onClose={() => setCreating(false)} />}
          <Table head={['Customer', 'Phone', 'Expected', 'Status', 'Updated']} empty={data.orders.length === 0}>
            {data.orders.map((o) => (
              <tr key={o.id}>
                <td className={cx(td, 'font-medium text-slate-900')}>{o.customerName}</td>
                <td className={cx(td, 'font-mono text-xs')}>{o.customerPhone}</td>
                <td className={cx(td, 'tabular-nums')}>{ghs(o.expectedAmount)}</td>
                <td className={td}>
                  <Badge {...ORDER_STATUS[o.status]} />
                </td>
                <td className={cx(td, 'text-slate-500')}>{dateTime(o.updatedAt)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}

      {tab === 'transactions' && (
        <Table head={['MoMo Tx ID', 'Provider', 'Sender', 'Paid', 'Order', 'Received']} empty={data.transactions.length === 0}>
          {data.transactions.map((t) => {
            const diff = t.order ? t.amountPaid - t.order.expectedAmount : null
            return (
              <tr key={t.id}>
                <td className={cx(td, 'font-mono text-xs')} title={t.rawSms}>
                  {t.momoTxId}
                </td>
                <td className={td}>{t.provider ?? '—'}</td>
                <td className={td}>
                  {t.senderName}
                  <span className="ml-1 font-mono text-xs text-slate-400">{t.senderPhone}</span>
                </td>
                <td className={cx(td, 'tabular-nums')}>
                  {ghs(t.amountPaid)}
                  {diff !== null && Math.abs(diff) >= 0.005 && (
                    <span className={cx('ml-1 text-xs', diff < 0 ? 'text-amber-700' : 'text-sky-700')}>
                      ({diff > 0 ? '+' : '−'}
                      {Math.abs(diff).toFixed(2)})
                    </span>
                  )}
                </td>
                <td className={td}>
                  {t.order ? (
                    <span className="inline-flex items-center gap-1.5">
                      {t.order.customerName} <Badge {...ORDER_STATUS[t.order.status]} />
                    </span>
                  ) : (
                    <Badge label="Unlinked" tone="slate" />
                  )}
                </td>
                <td className={cx(td, 'text-slate-500')}>{dateTime(t.transactedAt ?? t.createdAt)}</td>
              </tr>
            )
          })}
        </Table>
      )}

      {tab === 'audit' && (
        <Table head={['Time', 'Event', 'Detail', 'Run']} empty={data.audit.length === 0}>
          {data.audit.map((a) => (
            <tr key={a.id}>
              <td className={cx(td, 'text-slate-500 tabular-nums')}>{dateTime(a.createdAt)}</td>
              <td className={td}>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{a.event}</code>
              </td>
              <td className={cx(td, 'max-w-md truncate whitespace-nowrap')} title={a.message}>
                {a.message}
              </td>
              <td className={cx(td, 'font-mono text-[11px] text-slate-400')}>{a.runId.slice(0, 8)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}
