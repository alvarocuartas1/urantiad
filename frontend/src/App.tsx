import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { AppLayout } from '@/components/layout/AppLayout'
import CategoriesPage from '@/pages/CategoriesPage'
import CustomersPage from '@/pages/CustomersPage'
import HomePage from '@/pages/HomePage'
import InventoryMovementsPage from '@/pages/InventoryMovementsPage'
import LoginPage from '@/pages/LoginPage'
import ProductsPage from '@/pages/ProductsPage'
import PurchasePage from '@/pages/PurchasePage'
import PurchasesPage from '@/pages/PurchasesPage'
import ReplenishmentPage from '@/pages/ReplenishmentPage'
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
