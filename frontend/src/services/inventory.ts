import type { Page } from '@/types/api'
import type {
  AdjustmentCreate,
  AdjustmentResult,
  InventoryMovement,
  MovementListParams,
  ReplenishmentItem,
  ReplenishmentListParams,
} from '@/types/inventory'
import { apiRequest } from './apiClient'

export function createAdjustment(data: AdjustmentCreate): Promise<AdjustmentResult> {
  return apiRequest<AdjustmentResult>('/inventory/adjustments', { method: 'POST', body: data })
}

export function listMovements(params: MovementListParams): Promise<Page<InventoryMovement>> {
  return apiRequest<Page<InventoryMovement>>('/inventory/movements', { query: { ...params } })
}

export function listReplenishment(
  params: ReplenishmentListParams,
): Promise<Page<ReplenishmentItem>> {
  return apiRequest<Page<ReplenishmentItem>>('/inventory/replenishment', {
    query: { ...params },
  })
}
