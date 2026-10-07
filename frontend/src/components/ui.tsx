import { cx, TONE_CLASSES } from '../format'

export function Badge({ label, tone }: { label: string; tone: keyof typeof TONE_CLASSES }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE_CLASSES[tone])}>
      {label}
    </span>
  )
}

export function Panel({ title, icon, actions, children, className }: { title: string; icon: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {icon}
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  )
}
