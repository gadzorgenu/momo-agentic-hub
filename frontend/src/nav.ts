import { ArrowLeftRight, ClipboardList, Inbox, LayoutDashboard, ScrollText, Workflow, type LucideIcon } from 'lucide-react'

export type View = 'overview' | 'review' | 'transactions' | 'orders' | 'runs' | 'audit'

export const NAV: { id: View; label: string; icon: LucideIcon; group: 'Daily work' | 'Records' }[] = [
  { id: 'overview', label: 'Home', icon: LayoutDashboard, group: 'Daily work' },
  { id: 'review', label: 'Needs your decision', icon: Inbox, group: 'Daily work' },
  { id: 'runs', label: 'Payment checks', icon: Workflow, group: 'Daily work' },
  { id: 'transactions', label: 'Payments', icon: ArrowLeftRight, group: 'Records' },
  { id: 'orders', label: 'Orders', icon: ClipboardList, group: 'Records' },
  { id: 'audit', label: 'Activity history', icon: ScrollText, group: 'Records' },
]
