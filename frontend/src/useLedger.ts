import { useEffect, useState } from 'react'
import { api, type AuditLogDto, type OrderDto, type TransactionDto } from './api'

export interface LedgerData {
  orders: OrderDto[]
  transactions: TransactionDto[]
  audit: AuditLogDto[]
}

export function useLedger(version: number) {
  const [data, setData] = useState<LedgerData>({ orders: [], transactions: [], audit: [] })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    Promise.all([api.orders(), api.transactions(), api.audit()])
      .then(([orders, transactions, audit]) => {
        if (cancelled) return
        setData({ orders, transactions, audit })
        setError(null)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [version])
  return { data, error }
}
