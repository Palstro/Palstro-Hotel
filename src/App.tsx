import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { TenantContextProvider } from './hooks/useTenantContext';
import { PropertyContextProvider } from './hooks/usePropertyContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';

/**
 * Route map:
 *   /       public guest landing — resolved by host, anonymous, NOT protected.
 *   /login  email + password sign in.
 *   /admin  protected placeholder (auth-only scope for now).
 *
 * AuthProvider wraps everything so /login and /admin share one session, and so
 * the landing page can later add an unobtrusive "staff sign in" link without
 * needing its own provider. The landing route keeps its own
 * PropertyContextProvider exactly as before — it is deliberately NOT wrapped in
 * ProtectedRoute, so anonymous visitors see it unchanged.
 *
 * TenantContextProvider sits inside AuthProvider (it depends on the session) and
 * only does real work once a user is present, so it is harmless around the
 * public and login routes too.
 */
function App() {
  return (
    <AuthProvider>
      <TenantContextProvider>
        <Routes>
          <Route
            path="/"
            element={
              <PropertyContextProvider>
                <LandingPage />
              </PropertyContextProvider>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </TenantContextProvider>
    </AuthProvider>
  );
}

export default App;
