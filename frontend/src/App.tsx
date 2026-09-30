import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { AppLayout } from '@/components/layout/AppLayout'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import PosPage from '@/pages/PosPage'
import { PERMISSIONS } from '@/types/auth'
import { REPORT_PERMISSIONS } from '@/utils/report'
import { STATISTICS_PERMISSIONS } from '@/utils/statistics'

// Login, home and POS ship in the main bundle: the cashier never waits for them. The other
// pages load on demand (AppLayout shows a placeholder meanwhile), so their code and
// libraries (charts in statistics) stay out of the POS.
const AuditLogsPage = lazy(() => import('@/pages/AuditLogsPage'))
const CashRegistersPage = lazy(() => import('@/pages/CashRegistersPage'))
const CashSessionsPage = lazy(() => import('@/pages/CashSessionsPage'))
const CategoriesPage = lazy(() => import('@/pages/CategoriesPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const InventoryMovementsPage = lazy(() => import('@/pages/InventoryMovementsPage'))
const MyCashPage = lazy(() => import('@/pages/MyCashPage'))
const PaymentMethodsPage = lazy(() => import('@/pages/PaymentMethodsPage'))
const ProductsPage = lazy(() => import('@/pages/ProductsPage'))
const PurchasePage = lazy(() => import('@/pages/PurchasePage'))
const PurchasesPage = lazy(() => import('@/pages/PurchasesPage'))
const ReplenishmentPage = lazy(() => import('@/pages/ReplenishmentPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const SalePage = lazy(() => import('@/pages/SalePage'))
const SalesPage = lazy(() => import('@/pages/SalesPage'))
const StatisticsPage = lazy(() => import('@/pages/StatisticsPage'))
const SuppliersPage = lazy(() => import('@/pages/SuppliersPage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route element={<RequirePermission permission={PERMISSIONS.usersRead} />}>
                <Route path="usuarios" element={<UsersPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.productsRead} />}>
                <Route path="productos" element={<ProductsPage />} />
                <Route path="categorias" element={<CategoriesPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.inventoryRead} />}>
                <Route path="inventario/movimientos" element={<InventoryMovementsPage />} />
                <Route path="inventario/reposicion" element={<ReplenishmentPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.suppliersRead} />}>
                <Route path="proveedores" element={<SuppliersPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.purchasesRead} />}>
                <Route path="compras" element={<PurchasesPage />} />
                <Route path="compras/:purchaseId" element={<PurchasePage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.purchasesManage} />}>
                <Route path="compras/nueva" element={<PurchasePage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.customersRead} />}>
                <Route path="clientes" element={<CustomersPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.cashOperate} />}>
                <Route path="caja" element={<MyCashPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.cashSupervise} />}>
                <Route path="caja/aperturas" element={<CashSessionsPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.salesCreate} />}>
                <Route path="pos" element={<PosPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.salesRead} />}>
                <Route path="ventas" element={<SalesPage />} />
                <Route path="ventas/:saleId" element={<SalePage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.cashRegistersRead} />}>
                <Route path="cajas" element={<CashRegistersPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.paymentMethodsManage} />}>
                <Route path="metodos-pago" element={<PaymentMethodsPage />} />
              </Route>
              <Route element={<RequirePermission permission={REPORT_PERMISSIONS} />}>
                <Route path="reportes" element={<ReportsPage />} />
                <Route path="reportes/:tab" element={<ReportsPage />} />
              </Route>
              <Route element={<RequirePermission permission={STATISTICS_PERMISSIONS} />}>
                <Route path="estadisticas" element={<StatisticsPage />} />
              </Route>
              <Route element={<RequirePermission permission={PERMISSIONS.auditRead} />}>
                <Route path="auditoria" element={<AuditLogsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
