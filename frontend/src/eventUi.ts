import { Brain, CircleCheck, CirclePlay, GitBranch, PauseCircle, UserCheck, Wrench, XCircle, type LucideIcon } from 'lucide-react'
import type { AgentEventType } from './api'

export const EVENT_UI: Record<AgentEventType, { icon: LucideIcon; color: string; label: string }> = {
  run_started: { icon: CirclePlay, color: 'text-slate-500', label: 'Started' },
  node_started: { icon: GitBranch, color: 'text-indigo-500', label: 'Step' },
  thought: { icon: Brain, color: 'text-violet-500', label: 'Note' },
  tool_call: { icon: Wrench, color: 'text-sky-600', label: 'Looking up' },
  tool_result: { icon: Wrench, color: 'text-emerald-600', label: 'Found' },
  review_required: { icon: PauseCircle, color: 'text-amber-500', label: 'Waiting for you' },
  review_resolved: { icon: UserCheck, color: 'text-emerald-600', label: 'Your decision' },
  run_completed: { icon: CircleCheck, color: 'text-emerald-600', label: 'Done' },
  run_failed: { icon: XCircle, color: 'text-rose-600', label: "Couldn't finish" },
}
