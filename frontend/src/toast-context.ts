import { createContext, useContext } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'
export type ToastInput = { variant: ToastVariant; title: string; description?: string }

export const ToastContext = createContext<(t: ToastInput) => void>(() => {})

export const useToast = () => useContext(ToastContext)
