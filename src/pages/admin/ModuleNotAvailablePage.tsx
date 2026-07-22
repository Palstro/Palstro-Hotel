// Catch-all for admin module routes that are not built yet (3.txt §1). Rendered
// as the `*` child of /admin/:propertySlug, so it appears INSIDE AdminLayout —
// the sidebar stays visible and the user can navigate away. Typing a URL like
// /admin/finima/bookings lands here instead of react-router's raw 404 screen.
export function ModuleNotAvailablePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-charcoal">
          This module is not available yet
        </h1>
        <p className="mt-1 text-sm text-charcoal-muted">
          This part of the admin isn't ready yet — it's coming in a future build.
          Use the menu to head to a section that's available now.
        </p>
      </header>
    </div>
  );
}
