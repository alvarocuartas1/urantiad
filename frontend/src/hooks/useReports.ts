import { keepPreviousData, type Query, useQuery } from '@tanstack/react-query'
import {
  getCashReport,
  getInventoryReport,
  getPurchasesReport,
  getSalesReport,
} from '@/services/reports'
import type {
  CashReportParams,
  InventoryReportParams,
  PurchasesReportParams,
  SalesReportParams,
} from '@/types/report'

// Reports summarize data that almost every operation changes (sales, purchases, cash), so
// like the audit log they reload when opened instead of being invalidated from everywhere.
const reportOptions = { placeholderData: keepPreviousData, staleTime: 0 } as const

/** Keep showing the previous result while a new one loads, but only with the same grouping:
 * rows of another grouping (ids instead of dates) do not fit the new columns. */
function sameGrouping<T>(groupBy: string) {
  return (
    previous: T | undefined,
    previousQuery: Query<T, Error, T, readonly unknown[]> | undefined,
  ) => {
    const params = previousQuery?.queryKey[2] as { group_by?: string } | undefined
    return params?.group_by === groupBy ? previous : undefined
  }
}

export function useSalesReport(params: SalesReportParams) {
  return useQuery({
    queryKey: ['reports', 'sales', params],
    queryFn: () => getSalesReport(params),
    ...reportOptions,
    placeholderData: sameGrouping(params.group_by),
  })
}

export function usePurchasesReport(params: PurchasesReportParams) {
  return useQuery({
    queryKey: ['reports', 'purchases', params],
    queryFn: () => getPurchasesReport(params),
    ...reportOptions,
    placeholderData: sameGrouping(params.group_by),
  })
}

export function useInventoryReport(params: InventoryReportParams) {
  return useQuery({
    queryKey: ['reports', 'inventory', params],
    queryFn: () => getInventoryReport(params),
    ...reportOptions,
  })
}

export function useCashReport(params: CashReportParams) {
  return useQuery({
    queryKey: ['reports', 'cash', params],
    queryFn: () => getCashReport(params),
    ...reportOptions,
    placeholderData: sameGrouping(params.group_by),
  })
}
