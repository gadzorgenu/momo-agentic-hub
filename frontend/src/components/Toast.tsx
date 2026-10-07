import { AlertCircle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cx } from '../format'
import { ToastContext, type ToastInput, type ToastVariant } from '../toast-context'

type Toast = ToastInput & { id: number }

const VARIANT: Record<ToastVariant, { icon: LucideIcon; iconClass: string; ring: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-500', ring: 'ring-emerald-200' },
  error: { icon: AlertCircle, iconClass: 'text-rose-500', ring: 'ring-rose-200' },
  info: { icon: Info, iconClass: 'text-sky-500', ring: 'ring-sky-200' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: ToastInput) => {
    setToasts((prev) => [...prev.slice(-2), { ...t, id: Date.now() + Math.random() }])
  }, [])

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:top-auto sm:bottom-6 sm:items-start sm:px-6 lg:pl-64">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { icon: Icon, iconClass, ring } = VARIANT[toast.variant]
  useEffect(() => {
    const t = setTimeout(onDismiss, 4500)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div
      role="status"
      className={cx(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg bg-white px-3.5 py-3 shadow-lg ring-1',
        ring,
      )}
      style={{ animation: 'toast-in 180ms ease-out' }}
    >
      <Icon className={cx('mt-0.5 size-4 shrink-0', iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs text-slate-500">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
