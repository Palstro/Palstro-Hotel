import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTenantContext } from '../hooks/useTenantContext';
import { MISSING_VALUE } from '../lib/format';

/**
 * Placeholder admin landing (scope: auth only). Shows who is signed in — email,
 * tenant name, role — and a sign-out control. Real admin screens come later.
 *
 * It reads tenant/role from useTenantContext, which is still resolving right
 * after sign in, so it has its own loading and error states rather than assuming
 * the membership is ready.
 */
export function AdminPage() {
  const { user, signOut } = useAuth();
  const { tenantName, role, isAdmin, loading, error } = useTenantContext();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      // No navigation needed: the session clears, ProtectedRoute re-evaluates
      // and redirects to /login on the next render.
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream px-6 py-16">
      <div className="mx-auto max-w-lg">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-charcoal">
              Admin
            </h1>
            <p className="mt-1 text-sm text-charcoal-muted">
              You're signed in.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-full border border-sand-border px-4 py-2 text-sm font-semibold text-charcoal transition-colors hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </header>

        <dl className="mt-8 divide-y divide-sand-border overflow-hidden rounded-2xl border border-sand-border bg-white/60">
          <Row label="Email" value={user?.email ?? MISSING_VALUE} />
          <Row
            label="Tenant"
            value={
              loading
                ? 'Loading…'
                : error
                  ? 'Unavailable'
                  : (tenantName ?? MISSING_VALUE)
            }
          />
          <Row
            label="Role"
            value={
              loading
                ? 'Loading…'
                : error
                  ? 'Unavailable'
                  : role
                    ? `${role}${isAdmin ? ' (admin)' : ''}`
                    : MISSING_VALUE
            }
          />
        </dl>

        {error ? (
          <p role="alert" className="mt-4 text-sm font-medium text-primary">
            We couldn't load your tenant details. Please refresh to try again.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <dt className="text-sm font-medium text-charcoal-muted">{label}</dt>
      <dd className="text-sm font-semibold text-charcoal">{value}</dd>
    </div>
  );
}
