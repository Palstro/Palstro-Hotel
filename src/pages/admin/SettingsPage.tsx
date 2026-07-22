import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActiveProperty } from '../../hooks/useActiveProperty';
import { useSettingsData } from '../../hooks/useSettingsData';
import { SETTINGS_TABS } from '../../lib/settings/tabs';
import { SettingsForm } from '../../components/admin/settings/SettingsForm';
import type { SettingsRows } from '../../lib/settings/values';

// The settings screen (build 3, §5) — replaces the build-1 placeholder. Tabs
// come from tabs.ts; the active tab lives in the URL as ?tab=<id> so a reload or
// a shared link returns to the same tab. Mobile-first: at 360px the tab strip
// scrolls horizontally rather than wrapping into an unusable stack. Switching
// tabs with unsaved changes warns first.

export function SettingsPage() {
  const { property } = useActiveProperty();
  const [searchParams, setSearchParams] = useSearchParams();

  // AdminLayout only renders this once `property` is resolved; guard anyway.
  if (!property) return null;

  return (
    // Keyed by property so switching property tears down and reloads cleanly —
    // no stale rows or dirty flags bleed across properties.
    <SettingsScreen
      key={property.id}
      propertyId={property.id}
      tenantId={property.tenant_id}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
    />
  );
}

function SettingsScreen({
  propertyId,
  tenantId,
  searchParams,
  setSearchParams,
}: {
  propertyId: string;
  tenantId: string;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}) {
  const { rows, loading, error, applyRows, reload } = useSettingsData(
    propertyId,
    tenantId,
  );

  // Resolve the active tab from the URL, falling back to the first for an
  // absent/unknown value.
  const paramTab = searchParams.get('tab');
  const activeTab =
    SETTINGS_TABS.find((t) => t.id === paramTab) ?? SETTINGS_TABS[0];

  // Latest dirty flag from the mounted form, read synchronously in the tab-switch
  // handler (a ref, so reporting it does not re-render the whole page).
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const onSaved = useCallback(
    (patch: Partial<SettingsRows>) => applyRows(patch),
    [applyRows],
  );

  function selectTab(id: string) {
    if (id === activeTab.id) return;
    if (
      dirtyRef.current &&
      !window.confirm(
        'You have unsaved changes on this tab. Discard them and switch?',
      )
    ) {
      return;
    }
    dirtyRef.current = false;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-charcoal">
          Settings
        </h1>
        <p className="mt-1 text-sm text-charcoal-muted">
          Configure how this property looks and operates.
        </p>
      </header>

      {/* Tab strip — horizontally scrollable on narrow screens. */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {SETTINGS_TABS.map((tab) => {
          const active = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(tab.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-cream ${
                active
                  ? 'bg-primary text-white'
                  : 'text-charcoal hover:bg-sand'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : rows ? (
        <SettingsForm
          // Remount on tab change so each tab gets fresh, isolated form state.
          key={activeTab.id}
          tab={activeTab}
          rows={rows}
          tenantId={tenantId}
          propertyId={propertyId}
          onSaved={onSaved}
          onDirtyChange={onDirtyChange}
        />
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className="flex items-center justify-center rounded-2xl border border-sand-border bg-white/60 py-16"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading settings…</span>
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-sand-border border-t-primary" />
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-sand-border bg-white/60 p-6 text-center">
      <p className="text-sm font-medium text-charcoal">
        We couldn’t load these settings.
      </p>
      <p className="mt-1 text-sm text-charcoal-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center rounded-lg border border-sand-border bg-white/70 px-4 py-2 text-sm font-semibold text-charcoal transition-colors hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-cream"
      >
        Try again
      </button>
    </div>
  );
}
