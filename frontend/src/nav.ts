import { ArrowLeftRight, ClipboardList, Inbox, LayoutDashboard, ScrollText, Workflow, type LucideIcon } from 'lucide-react'

export type View = 'overview' | 'review' | 'transactions' | 'orders' | 'runs' | 'audit'

export const NAV: { id: View; label: string; icon: LucideIcon; group: 'Reconcile' | 'Records' }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Reconcile' },
  { id: 'review', label: 'Review queue', icon: Inbox, group: 'Reconcile' },
  { id: 'runs', label: 'Agent runs', icon: Workflow, group: 'Reconcile' },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, group: 'Records' },
  { id: 'orders', label: 'Orders', icon: ClipboardList, group: 'Records' },
  { id: 'audit', label: 'Audit log', icon: ScrollText, group: 'Records' },
]
