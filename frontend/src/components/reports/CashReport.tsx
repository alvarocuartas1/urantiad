import { useState } from 'react'
import { CashDifferenceBadge } from '@/components/cash/CashBadges'
import { FilterSelect } from '@/components/ui/ListFilters'
import { useAuth } from '@/hooks/useAuth'
import { useCashRegisters } from '@/hooks/useCash'
import { useCashReport } from '@/hooks/useReports'
import { exportCashReport } from '@/services/reports'
import { useUsers } from '@/hooks/useUsers'
import { PERMISSIONS } from '@/types/auth'
import type { CashGroupBy, CashReportRow, CashReportSummary } from '@/types/report'
import { labelEntries } from '@/utils/catalog'
import { formatCurrency } from '@/utils/format'
import { businessDayRange } from '@/utils/inventory'
import { CASH_GROUP_LABELS, currentMonthDates } from '@/utils/report'
import { groupColumn, moneyColumn } from './columns'
import { ExportButton } from './ExportButton'
import { ReportResults } from './ReportResults'
import type { ReportColumn } from './ReportTable'
import { PeriodFilter, ReportToolbar } from './ReportToolbar'
import { SummaryCards, type SummaryItem } from './SummaryCards'

const PAGE_SIZE = 20
// A business has few users and registers: the filters list them all at once.
const ALL_FOR_FILTER = { page: 1, size: 100 }

interface Filters {
  groupBy: CashGroupBy
  from: string
  to: string
  registerId: string
  userId: string
}

function cashColumns(groupBy: CashGroupBy): ReportColumn<CashReportRow>[] {
  return [
    groupColumn<CashReportRow>(CASH_GROUP_LABELS[groupBy], groupBy === 'day'),
    {
      header: 'Aperturas',
      numeric: true,
      render: (row) => (
        <>
          {row.sessions_count}
          {row.open_count > 0 && (
            <span className="block text-xs text-slate-500">
              {row.open_count} {row.open_count === 1 ? 'abierta' : 'abiertas'}
            </span>
          )}
          {row.sessions_with_difference > 0 && (
            <span className="block text-xs text-slate-500">
              {row.sessions_with_difference} con diferencia
            </span>
          )}
        </>
      ),
    },
    moneyColumn<CashReportRow>('Inicial', (row) => row.opening_total),
    moneyColumn<CashReportRow>('Ventas en efectivo', (row) => row.cash_sales_total),
    moneyColumn<CashReportRow>('Ingresos', (row) => row.income_total),
    moneyColumn<CashReportRow>('Retiros', (row) => row.withdrawals_total),
    moneyColumn<CashReportRow>('Anulaciones', (row) => row.cash_cancellations_total),
    moneyColumn<CashReportRow>('Esperado', (row) => row.expected_cash),
    moneyColumn<CashReportRow>('Contado', (row) => row.counted_cash),
    moneyColumn<CashReportRow>('Sobrantes', (row) => row.surplus_total),
    moneyColumn<CashReportRow>('Faltantes', (row) => row.shortage_total),
    {
      header: 'Diferencia',
      render: (row) => (
        <span className="whitespace-nowrap">
          <CashDifferenceBadge difference={row.difference_total} />
        </span>
      ),
    },
  ]
}

function cashSummary(summary: CashReportSummary): SummaryItem[] {
  return [
    {
      label: 'Aperturas',
      value: summary.sessions_count,
      detail: `${summary.open_count} abiertas · ${summary.sessions_with_difference} con diferencia`,
    },
    {
      label: 'Ventas en efectivo',
      value: formatCurrency(summary.cash_sales_total),
      detail: `Anulaciones ${formatCurrency(summary.cash_cancellations_total)}`,
    },
    {
      label: 'Ingresos',
      value: formatCurrency(summary.income_total),
      detail: `Retiros ${formatCurrency(summary.withdrawals_total)}`,
    },
    {
      label: 'Diferencia neta de los arqueos',
      value: <CashDifferenceBadge difference={summary.difference_total} />,
      detail: `Sobrantes ${formatCurrency(summary.surplus_total)} · Faltantes ${formatCurrency(summary.shortage_total)}`,
    },
  ]
}

/** Cash sessions of a period (by opening date) grouped by day, register or cashier. */
export function CashReport() {
  const { hasPermission } = useAuth()
  const canListUsers = hasPermission(PERMISSIONS.usersRead)
  const canListRegisters = hasPermission(PERMISSIONS.cashRegistersRead)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(() => ({
    groupBy: 'day',
    ...currentMonthDates(),
    registerId: '',
    userId: '',
  }))

  const users = useUsers(ALL_FOR_FILTER, { enabled: canListUsers })
  const registers = useCashRegisters(ALL_FOR_FILTER, { enabled: canListRegisters })
  const reportParams = {
    group_by: filters.groupBy,
    ...businessDayRange(filters.from, filters.to),
    cash_register_id: filters.registerId ? Number(filters.registerId) : undefined,
    user_id: filters.userId ? Number(filters.userId) : undefined,
  }
  const { data, isPending, error, isFetching } = useCashReport({
    page,
    size: PAGE_SIZE,
    ...reportParams,
  })

  const updateFilters = (changes: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...changes }))
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <ReportToolbar isFetching={isFetching && !isPending}>
        <FilterSelect
          label="Agrupar por"
          value={filters.groupBy}
          onChange={(value) => updateFilters({ groupBy: value as CashGroupBy })}
        >
          {labelEntries(CASH_GROUP_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              Por {label.toLowerCase()}
            </option>
          ))}
        </FilterSelect>
        <PeriodFilter from={filters.from} to={filters.to} onChange={updateFilters} />
        {canListRegisters && (
          <FilterSelect
            label="Caja"
            value={filters.registerId}
            onChange={(value) => updateFilters({ registerId: value })}
          >
            <option value="">Todas las cajas</option>
            {registers.data?.items.map((register) => (
              <option key={register.id} value={register.id}>
                {register.name}
              </option>
            ))}
          </FilterSelect>
        )}
        {canListUsers && (
          <FilterSelect
            label="Cajero"
            value={filters.userId}
            onChange={(value) => updateFilters({ userId: value })}
          >
            <option value="">Todos los cajeros</option>
            {users.data?.items.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </FilterSelect>
        )}
        <ExportButton onExport={() => exportCashReport(reportParams)} />
      </ReportToolbar>
      <p className="text-sm text-slate-600">
        Esperado, contado y diferencias solo incluyen las aperturas ya cerradas.
      </p>

      <ReportResults
        caption={`Caja por ${CASH_GROUP_LABELS[filters.groupBy].toLowerCase()}`}
        data={data}
        isPending={isPending}
        error={error}
        columns={cashColumns(filters.groupBy)}
        renderSummary={(summary) => <SummaryCards items={cashSummary(summary)} />}
        onPageChange={setPage}
      />
    </div>
  )
}
