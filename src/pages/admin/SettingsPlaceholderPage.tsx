import { useActiveProperty } from '../../hooks/useActiveProperty';
import { MISSING_VALUE } from '../../lib/format';

// Placeholder Settings page for build 1 (3.txt §6). It exists to PROVE the
// active-property context resolves end to end: it reads the property out of the
// URL-driven context and shows its name, slug, timezone and currency. The real
// settings forms (branding editor, booking toggle, etc.) are the next build and
// will replace this body while keeping the same route.
export function SettingsPlaceholderPage() {
  const { property } = useActiveProperty();

  // AdminLayout only renders this page once `property` is resolved and non-null,
  // so a null here would be a bug; guard defensively rather than crash.
  if (!property) return null;

  const rows: { label: string; value: string }[] = [
    { label: 'Property', value: property.name || MISSING_VALUE },
    { label: 'Slug', value: property.slug || MISSING_VALUE },
    { label: 'Timezone', value: property.timezone || MISSING_VALUE },
    { label: 'Currency', value: property.currency || MISSING_VALUE },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-charcoal">
          Settings
        </h1>
        <p className="mt-1 text-sm text-charcoal-muted">
          Settings for this property. Editing tools arrive in the next build —
          for now this confirms the active property is resolved from the URL.
        </p>
      </header>

      <dl className="mt-8 divide-y divide-sand-border overflow-hidden rounded-2xl border border-sand-border bg-white/60">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-5 py-4"
          >
            <dt className="text-sm font-medium text-charcoal-muted">
              {row.label}
            </dt>
            <dd className="text-sm font-semibold text-charcoal">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
