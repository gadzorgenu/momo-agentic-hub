// Types come straight from the backend contract so both sides compile against the same shapes.
import type {
  AuditLogDto,
  CreateOrderRequest,
  DecisionRequest,
  IngestRequest,
  IngestResponse,
  OrderDto,
  RunSummary,
  TransactionDto,
} from '../../backend/src/contracts'

export type * from '../../backend/src/contracts'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const issues = body?.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('; ')
    throw new ApiError(issues || body?.message || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  ingest: (body: IngestRequest) => request<IngestResponse>('/api/reconcile/ingest', { method: 'POST', body }),
  decide: (runId: string, body: DecisionRequest) => request<{ accepted: true }>(`/api/reconcile/${runId}/decision`, { method: 'POST', body }),
  runs: () => request<RunSummary[]>('/api/reconcile/runs'),
  orders: () => request<OrderDto[]>('/api/orders'),
  createOrder: (body: CreateOrderRequest) => request<OrderDto>('/api/orders', { method: 'POST', body }),
  transactions: () => request<TransactionDto[]>('/api/transactions'),
  audit: () => request<AuditLogDto[]>('/api/audit'),
  eventsUrl: `${API_BASE}/api/reconcile/events`,
}
