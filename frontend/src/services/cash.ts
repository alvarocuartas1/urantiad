import type { Page } from '@/types/api'
import type {
  CashMovement,
  CashMovementCreate,
  CashMovementResult,
  CashRegister,
  CashRegisterCreate,
  CashRegisterListParams,
  CashRegisterUpdate,
  CashSession,
  CashSessionClose,
  CashSessionListParams,
  CashSessionOpen,
  CashSessionSalesSummary,
} from '@/types/cash'
import { apiRequest } from './apiClient'

export function listCashRegisters(params: CashRegisterListParams): Promise<Page<CashRegister>> {
  return apiRequest<Page<CashRegister>>('/cash-registers', { query: { ...params } })
}

export function createCashRegister(data: CashRegisterCreate): Promise<CashRegister> {
  return apiRequest<CashRegister>('/cash-registers', { method: 'POST', body: data })
}

export function updateCashRegister(id: number, data: CashRegisterUpdate): Promise<CashRegister> {
  return apiRequest<CashRegister>(`/cash-registers/${id}`, { method: 'PATCH', body: data })
}

/** The current user's open session, or `null` when they have no register open. */
export function getCurrentCashSession(): Promise<CashSession | null> {
  return apiRequest<CashSession | null>('/cash-sessions/current')
}

export function openCashSession(data: CashSessionOpen): Promise<CashSession> {
  return apiRequest<CashSession>('/cash-sessions', { method: 'POST', body: data })
}

export function listCashSessions(params: CashSessionListParams): Promise<Page<CashSession>> {
  return apiRequest<Page<CashSession>>('/cash-sessions', { query: { ...params } })
}

export function getCashSession(id: number): Promise<CashSession> {
  return apiRequest<CashSession>(`/cash-sessions/${id}`)
}

export function getCashSessionSalesSummary(id: number): Promise<CashSessionSalesSummary> {
  return apiRequest<CashSessionSalesSummary>(`/cash-sessions/${id}/sales-summary`)
}

export function closeCashSession(id: number, data: CashSessionClose): Promise<CashSession> {
  return apiRequest<CashSession>(`/cash-sessions/${id}/close`, { method: 'POST', body: data })
}

export function listCashMovements(
  sessionId: number,
  params: { page: number; size: number },
): Promise<Page<CashMovement>> {
  return apiRequest<Page<CashMovement>>(`/cash-sessions/${sessionId}/movements`, {
    query: { ...params },
  })
}

export function createCashMovement(
  sessionId: number,
  data: CashMovementCreate,
): Promise<CashMovementResult> {
  return apiRequest<CashMovementResult>(`/cash-sessions/${sessionId}/movements`, {
    method: 'POST',
    body: data,
  })
}
