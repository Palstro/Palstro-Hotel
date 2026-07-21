import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenantContext } from '../hooks/useTenantContext';

interface ProtectedRouteProps {
  children: ReactNode;
  // When true, additionally require the active role to be an admin ('owner' or
  // 'manager'), matching is_tenant_admin() in migration 001. A signed-in
  // non-admin is shown a clear no-access message rather than being redirected.
  requireAdmin?: boolean;
}

// A neutral full-screen spinner reused for both the session and (when required)
// the tenant-role resolution, so no protected page flashes before we know the
// answer.
function LoadingScreen() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-cream"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-sand-border border-t-primary" />
    </div>
  );
}

/**
 * Gates admin routes behind an authenticated session, and optionally behind an
 * admin role.
 *
 * While the session is still resolving we show a neutral loading state — NOT the
 * login form — so an already-authenticated user (Supabase restores the session
 * asynchronously on load) never sees a flash of /login before landing on the
 * page they asked for.
 *
 * When resolution finishes with no session, we redirect to /login and remember
 * where they were headed (location.state.from) so a later sign-in can return
 * them there.
 *
 * SECURITY NOTE: requireAdmin is a UX guard ONLY. The real enforcement is RLS at
 * the database (rule 19) — is_tenant_admin() gates every destructive write
 * regardless of what the client renders. This check only spares a non-admin a
 * confusing dead-end screen; it is never the thing that actually protects data.
 */
export function ProtectedRoute({ children, requireAdmin }: ProtectedRouteProps) {
  const { session, loading: authLoading } = useAuth();
  const {
    isAdmin,
    loading: tenantLoading,
    error: tenantError,
  } = useTenantContext();
  const location = useLocation();

  // 1. Session first. Still resolving → wait, don't flash the login form.
  if (authLoading) return <LoadingScreen />;
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 2. Admin gate (opt-in). The role comes from tenant context, which resolves
  //    after the session, so wait for it before judging access.
  if (requireAdmin) {
    if (tenantLoading) return <LoadingScreen />;

    // If we could not load the membership at all, we cannot confirm admin —
    // fail closed with the same no-access screen rather than assuming access.
    if (tenantError || !isAdmin) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-cream px-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold tracking-tight text-charcoal">
              No access
            </h1>
            <p className="mt-3 text-charcoal-muted">
              You do not have access to this area. If you think this is a
              mistake, contact your hotel's administrator.
            </p>
          </div>
        </main>
      );
    }
  }

  return <>{children}</>;
}
