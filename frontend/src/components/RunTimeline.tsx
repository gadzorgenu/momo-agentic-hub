import type { AgentEvent } from '../api'
import { EVENT_UI } from '../eventUi'
import { cx, time } from '../format'

function EventRow({ evt }: { evt: AgentEvent }) {
  const ui = EVENT_UI[evt.type]
  const Icon = ui.icon
  const tool = (evt.data as { tool?: string } | undefined)?.tool
  const showData = evt.data !== undefined && evt.type !== 'run_started'
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="absolute top-6 bottom-0 left-[10px] w-px bg-slate-200" aria-hidden />
      <Icon className={cx('relative mt-0.5 size-5 shrink-0 rounded-full bg-white', ui.color)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{ui.label}</span>
          {evt.node && <code className="rounded bg-slate-100 px-1 text-[11px] text-indigo-700">{evt.node}</code>}
          {tool && <code className="rounded bg-sky-50 px-1 text-[11px] text-sky-700">{tool}</code>}
          <span className="ml-auto tabular-nums">{time(evt.at)}</span>
        </div>
        <p className={cx('mt-0.5 text-[13px] text-slate-800', evt.type === 'thought' && 'text-slate-700 italic')}>{evt.message}</p>
        {showData && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer text-slate-400 select-none hover:text-slate-600">data</summary>
            <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-slate-900 p-2 text-[11px] leading-relaxed text-slate-100">{JSON.stringify(evt.data, null, 2)}</pre>
          </details>
        )}
      </div>
    </li>
  )
}

/** Vertical timeline of every node, reasoning step, tool call and state change in a run. */
export function RunTimeline({ events }: { events: AgentEvent[] }) {
  return (
    <ol className="[&>li:last-child>span:first-child]:hidden">
      {events.map((e) => (
        <EventRow key={e.seq} evt={e} />
      ))}
    </ol>
  )
}
