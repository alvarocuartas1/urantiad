import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { AppLayout } from '@/components/layout/AppLayout'
import AuditLogsPage from '@/pages/AuditLogsPage'
import CashRegistersPage from '@/pages/CashRegistersPage'
import CashSessionsPage from '@/pages/CashSessionsPage'
import CategoriesPage from '@/pages/CategoriesPage'
import CustomersPage from '@/pages/CustomersPage'
import HomePage from '@/pages/HomePage'
import InventoryMovementsPage from '@/pages/InventoryMovementsPage'
import LoginPage from '@/pages/LoginPage'
import MyCashPage from '@/pages/MyCashPage'
import PosPage from '@/pages/PosPage'
import ProductsPage from '@/pages/ProductsPage'
import PurchasePage from '@/pages/PurchasePage'
import PurchasesPage from '@/pages/PurchasesPage'
import ReplenishmentPage from '@/pages/ReplenishmentPage'
import SalePage from '@/pages/SalePage'
import SalesPage from '@/pages/SalesPage'
import SuppliersPage from '@/pages/SuppliersPage'
import UsersPage from '@/pages/UsersPage'
import { PERMISSIONS } from '@/types/auth'

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
