import { X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cx, TONE_CLASSES } from '../format'

export function Badge({ label, tone }: { label: string; tone: keyof typeof TONE_CLASSES }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE_CLASSES[tone])}>
      {label}
    </span>
  )
}

export function Panel({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string
  subtitle?: string
  icon: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cx('flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            {icon}
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className={cx('flex min-h-0 flex-1 flex-col', bodyClassName)}>{children}</div>
    </section>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm focus-visible:ring-slate-400',
  secondary: 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300',
  danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm focus-visible:ring-emerald-400',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm focus-visible:ring-amber-400',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  disabled,
  ...rest
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: LucideIcon
  iconRight?: LucideIcon
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
      {children}
      {IconRight && <IconRight className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  className,
  ...rest
}: { icon: LucideIcon; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        'inline-grid size-8 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-40',
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export const Input = ({ className, icon: Icon, ...rest }: { icon?: LucideIcon } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="relative">
    {Icon && <Icon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden />}
    <input
      {...rest}
      className={cx(
        'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400',
        'focus:border-amber-400 focus:ring-2 focus:ring-amber-100',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
        Icon && 'pl-8',
        className,
      )}
    />
  </div>
)

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: { label: string; hint?: string; error?: string | null; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
        <span>
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
        {hint && !error && <span className="font-normal text-slate-400">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  const maxW = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cx(
          'relative z-10 w-full overflow-hidden rounded-t-2xl bg-white shadow-xl ring-1 ring-slate-200 sm:rounded-2xl',
          maxW,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id="modal-title" className="text-sm font-semibold text-slate-900">
              {title}
            </h3>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-xs text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-slate-200/60', className)} />
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[10px] font-medium text-slate-600 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
      {children}
    </kbd>
  )
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?'
  const hue = Array.from(name).reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ring-1 ring-black/5"
      style={{ width: size, height: size, backgroundColor: `hsl(${hue} 55% 48%)` }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: LucideIcon; count?: number }[]
}) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map(({ value: v, label, icon: Icon, count }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          onClick={() => onChange(v)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
            v === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {label}
          {typeof count === 'number' && (
            <span className={cx('rounded-full px-1.5 text-[10px] tabular-nums', v === value ? 'bg-slate-100 text-slate-700' : 'bg-slate-200/70 text-slate-600')}>
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
