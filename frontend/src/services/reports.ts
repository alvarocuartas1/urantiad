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
  ReportExportParams,
  ReportPage,
  SalesReportParams,
  SalesReportRow,
  SalesReportSummary,
} from '@/types/report'
import { apiDownload, apiRequest, type DownloadedFile } from './apiClient'

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

// Exports: the CSV of a whole report (every group and the total) with its screen's filters.

export function exportSalesReport(
  params: ReportExportParams<SalesReportParams>,
): Promise<DownloadedFile> {
  return apiDownload('/reports/sales/export', { ...params }, 'ventas.csv')
}

export function exportPurchasesReport(
  params: ReportExportParams<PurchasesReportParams>,
): Promise<DownloadedFile> {
  return apiDownload('/reports/purchases/export', { ...params }, 'compras.csv')
}

export function exportInventoryReport(
  params: ReportExportParams<InventoryReportParams>,
): Promise<DownloadedFile> {
  return apiDownload('/reports/inventory/export', { ...params }, 'inventario.csv')
}

export function exportCashReport(
  params: ReportExportParams<CashReportParams>,
): Promise<DownloadedFile> {
  return apiDownload('/reports/cash/export', { ...params }, 'caja.csv')
}
