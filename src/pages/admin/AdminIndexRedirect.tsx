import { Navigate } from 'react-router-dom';
import { useActiveProperty } from '../../hooks/useActiveProperty';

// Bare /admin has no property in the URL yet. This resolves the user's first
// accessible property and redirects to its Settings page (3.txt §6:
// "/admin redirects to /admin/:firstPropertySlug/settings"). If the user can
// access no property, we show a clear message rather than an empty redirect.
export function AdminIndexRedirect() {
  const { properties, loading, error } = useActiveProperty();

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-cream"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading your properties…</span>
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-sand-border border-t-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <NoticeScreen
        title="Something went wrong"
        body="We couldn't load your properties. Please refresh to try again."
      />
    );
  }

  const first = properties[0];
  if (!first) {
    return (
      <NoticeScreen
        title="No properties yet"
        body="Your account isn't linked to any property. Contact your hotel's administrator to be granted access."
      />
    );
  }

  // replace: this index route should not sit in history — the user lands on the
  // property route as if they navigated there directly.
  return <Navigate to={`/admin/${first.slug}/settings`} replace />;
}

function NoticeScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-charcoal">
          {title}
        </h1>
        <p className="mt-3 text-charcoal-muted">{body}</p>
      </div>
    </main>
  );
}
