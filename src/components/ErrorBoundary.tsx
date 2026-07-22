import {
  isRouteErrorResponse,
  useNavigate,
  useRouteError,
} from 'react-router-dom';

// Route-level error boundary (3.txt §2). Wired as `errorElement` on the root and
// admin routes so any runtime error renders this warm apology instead of
// react-router's raw developer error screen — stack trace and all — to whoever
// hits it (a hotel owner, not a developer).
//
// The technical error text is shown ONLY in development (import.meta.env.DEV). A
// production build never renders a stack trace or raw error message.
export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  const detail = import.meta.env.DEV ? formatError(error) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-charcoal">
          Something went wrong
        </h1>
        <p className="mt-3 text-charcoal-muted">
          Sorry — an unexpected error stopped this page from loading. You can go
          back or try again.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center rounded-full border border-sand-border bg-white/70 px-5 py-2.5 text-sm font-semibold text-charcoal transition-colors hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Try again
          </button>
        </div>

        {/* DEV only: the raw error, so a developer can debug. Never in prod. */}
        {detail ? (
          <pre className="mt-8 overflow-x-auto rounded-lg border border-sand-border bg-white/60 px-4 py-3 text-left text-xs text-charcoal-muted">
            {detail}
          </pre>
        ) : null}
      </div>
    </main>
  );
}

// Render an unknown thrown value as readable text for the DEV-only panel.
function formatError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    const body =
      error.data == null
        ? ''
        : typeof error.data === 'string'
          ? `\n${error.data}`
          : `\n${JSON.stringify(error.data, null, 2)}`;
    return `${error.status} ${error.statusText}${body}`;
  }
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}
