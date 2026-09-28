import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { AppLayout } from '@/components/layout/AppLayout'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
