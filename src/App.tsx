import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { TenantContextProvider } from './hooks/useTenantContext';
import { PropertyContextProvider } from './hooks/usePropertyContext';
import { ActivePropertyProvider } from './hooks/useActiveProperty';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { AdminLayout } from './components/admin/AdminLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { AdminIndexRedirect } from './pages/admin/AdminIndexRedirect';
import { SettingsPlaceholderPage } from './pages/admin/SettingsPlaceholderPage';
import { ModuleNotAvailablePage } from './pages/admin/ModuleNotAvailablePage';

/**
 * Route map:
 *   /                             public guest landing — resolved by host,
 *                                 anonymous, NOT protected.
 *   /login                        email + password sign in.
 *   /admin                        protected; redirects to the user's first
 *                                 accessible property's settings.
 *   /admin/:propertySlug          admin shell (AdminLayout) for one property;
 *                                 the active property lives in the URL (§1).
 *   /admin/:propertySlug/settings the settings screen (placeholder in build 1).
 *
 * A DATA router (createBrowserRouter + RouterProvider) is used deliberately:
 * useDirtyForm relies on react-router's useBlocker to intercept in-app
 * navigation away from an unsaved form (3.txt §5), and useBlocker only works
 * under a data router.
 *
 * ActivePropertyProvider wraps the whole /admin subtree so both the bare-/admin
 * redirect and the property shell share ONE fetch of the user's accessible
 * properties. It sits inside ProtectedRoute, so it never fetches for a
 * signed-out or non-admin user.
 */
const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <PropertyContextProvider>
        <LandingPage />
      </PropertyContextProvider>
    ),
    errorElement: <ErrorBoundary />,
  },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/admin',
    element: (
      <ProtectedRoute requireAdmin>
        <ActivePropertyProvider>
          <Outlet />
        </ActivePropertyProvider>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminIndexRedirect /> },
      {
        path: ':propertySlug',
        element: <AdminLayout />,
        children: [
          // Pathless boundary nested INSIDE AdminLayout: an error in a content
          // page renders here, in AdminLayout's Outlet, so the sidebar survives
          // and the user can navigate away (§2). An error in AdminLayout itself
          // bubbles past this to the root's full-screen boundary.
          {
            errorElement: <ErrorBoundary />,
            children: [
              // A bare /admin/:slug lands on Settings, the one working screen.
              { index: true, element: <Navigate to="settings" replace /> },
              { path: 'settings', element: <SettingsPlaceholderPage /> },
              // Not-yet-built modules render inside AdminLayout so the sidebar
              // stays visible and the user can navigate away — never
              // react-router's raw 404 (§1).
              { path: '*', element: <ModuleNotAvailablePage /> },
            ],
          },
        ],
      },
    ],
  },
]);

/**
 * AuthProvider / TenantContextProvider / ToastProvider wrap the router. None of
 * them use router hooks, so they are correctly OUTSIDE RouterProvider; the app
 * shares one session and one toast surface across every route.
 */
function App() {
  return (
    <AuthProvider>
      <TenantContextProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TenantContextProvider>
    </AuthProvider>
  );
}

export default App;
