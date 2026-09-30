import type {
  CashReportParams,
  CashReportRow,
  CashReportSummary,
  InventoryReportParams,
  InventoryReportRow,
  InventoryReportSummary,
  PurchasesReportParams,
  PurchasesReportRow,
  PurchasesReportSummary,
  ReportPage,
  SalesReportParams,
  SalesReportRow,
  SalesReportSummary,
} from '@/types/report'
import { apiRequest } from './apiClient'

export function getSalesReport(
  params: SalesReportParams,
): Promise<ReportPage<SalesReportRow, SalesReportSummary>> {
  return apiRequest('/reports/sales', { query: { ...params } })
}

export function getPurchasesReport(
  params: PurchasesReportParams,
): Promise<ReportPage<PurchasesReportRow, PurchasesReportSummary>> {
  return apiRequest('/reports/purchases', { query: { ...params } })
}

export function getInventoryReport(
  params: InventoryReportParams,
): Promise<ReportPage<InventoryReportRow, InventoryReportSummary>> {
  return apiRequest('/reports/inventory', { query: { ...params } })
}

export function getCashReport(
  params: CashReportParams,
): Promise<ReportPage<CashReportRow, CashReportSummary>> {
  return apiRequest('/reports/cash', { query: { ...params } })
}
