import { Activity, Brain, CircleCheck, CirclePlay, GitBranch, PauseCircle, UserCheck, Wrench, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { AgentEvent, AgentEventType, RunSummary } from '../api'
import { cx, OUTCOME, RUN_STATUS, time } from '../format'
import { Badge, Panel } from './ui'

const EVENT_UI: Record<AgentEventType, { icon: LucideIcon; color: string; label: string }> = {
  run_started: { icon: CirclePlay, color: 'text-slate-500', label: 'Run started' },
  node_started: { icon: GitBranch, color: 'text-indigo-500', label: 'Node' },
  thought: { icon: Brain, color: 'text-violet-500', label: 'Reasoning' },
  tool_call: { icon: Wrench, color: 'text-sky-600', label: 'Tool call' },
  tool_result: { icon: Wrench, color: 'text-emerald-600', label: 'Tool result' },
  review_required: { icon: PauseCircle, color: 'text-amber-500', label: 'Paused for review' },
  review_resolved: { icon: UserCheck, color: 'text-emerald-600', label: 'Human decision' },
  run_completed: { icon: CircleCheck, color: 'text-emerald-600', label: 'Completed' },
  run_failed: { icon: XCircle, color: 'text-rose-600', label: 'Failed' },
}

function EventRow({ evt }: { evt: AgentEvent }) {
  const ui = EVENT_UI[evt.type]
  const Icon = ui.icon
  const tool = (evt.data as { tool?: string } | undefined)?.tool
  const showData = evt.data !== undefined && evt.type !== 'run_started'
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="absolute top-6 bottom-0 left-[11px] w-px bg-slate-200 last:hidden" aria-hidden />
      <Icon className={cx('relative mt-0.5 size-[22px] shrink-0 rounded-full bg-white p-0.5', ui.color)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{ui.label}</span>
          {evt.node && <code className="rounded bg-slate-100 px-1 text-[11px] text-indigo-700">{evt.node}</code>}
          {tool && <code className="rounded bg-sky-50 px-1 text-[11px] text-sky-700">{tool}</code>}
          <span className="ml-auto tabular-nums">{time(evt.at)}</span>
        </div>
        <p className={cx('mt-0.5 text-sm text-slate-800', evt.type === 'thought' && 'italic text-slate-700')}>{evt.message}</p>
        {showData && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-600">data</summary>
            <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-slate-900 p-2 text-[11px] leading-relaxed text-slate-100">{JSON.stringify(evt.data, null, 2)}</pre>
          </details>
        )}
      </div>
    </li>
  )
}

export function AgentStream({ runs, selectedId, onSelect, connected }: { runs: RunSummary[]; selectedId: string | null; onSelect: (id: string) => void; connected: boolean }) {
  const selected = runs.find((r) => r.runId === selectedId) ?? runs[0] ?? null
  const scrollRef = useRef<HTMLDivElement>(null)
  const eventCount = selected?.events.length ?? 0

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [selected?.runId, eventCount])

  return (
    <Panel
      title="Live agent execution"
      icon={<Activity className="size-4 text-indigo-500" />}
      actions={
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className={cx('size-2 rounded-full', connected ? 'animate-pulse bg-emerald-500' : 'bg-slate-300')} />
          {connected ? 'Streaming' : 'Reconnecting…'}
        </span>
      }
      className="min-h-[28rem] lg:h-full"
    >
      {runs.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">Ingest an SMS to watch the agent reason through it.</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[13rem_1fr]">
          <ul className="max-h-48 overflow-y-auto border-b border-slate-100 sm:max-h-none sm:border-r sm:border-b-0">
            {runs.map((r) => {
              const parsed = r.events.find((e) => e.node === 'parse_sms' && e.type === 'thought')?.data as { parsed?: { senderName: string } } | undefined
              return (
                <li key={r.runId}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.runId)}
                    className={cx('w-full border-l-2 px-3 py-2 text-left hover:bg-slate-50', r.runId === selected?.runId ? 'border-indigo-500 bg-indigo-50/50' : 'border-transparent')}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-xs font-medium text-slate-800">{parsed?.parsed?.senderName ?? 'Parsing…'}</span>
                      <span className="text-[11px] tabular-nums text-slate-400">{time(r.createdAt)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge {...RUN_STATUS[r.status]} />
                      {r.outcome && <Badge {...OUTCOME[r.outcome]} />}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          <div ref={scrollRef} className="max-h-[36rem] min-h-0 overflow-y-auto p-4 lg:max-h-none">
            {selected && (
              <>
                <p className="mb-3 truncate font-mono text-[11px] text-slate-400">run {selected.runId}</p>
                <ol>
                  {selected.events.map((e) => (
                    <EventRow key={e.seq} evt={e} />
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
