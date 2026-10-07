import { Brain, CircleCheck, CirclePlay, GitBranch, PauseCircle, UserCheck, Wrench, XCircle, type LucideIcon } from 'lucide-react'
import type { AgentEventType } from './api'

export const EVENT_UI: Record<AgentEventType, { icon: LucideIcon; color: string; label: string }> = {
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
