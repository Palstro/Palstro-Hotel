import { useId } from 'react';
import type { Property } from '../../types/tenant';
import { ChevronUpDownIcon } from '../ui/icons';

// Lets a multi-property user change the active property. Rendered ONLY when the
// user can access more than one (3.txt §1, §2) — a single-property user never
// sees it, though the plumbing behind it is identical. Selecting a property just
// navigates (switchProperty), because the active property is URL state.
//
// A native <select> is used deliberately: it is keyboard- and screen-reader-
// accessible for free, and this is a genuine one-of-many choice.
export function PropertySwitcher({
  property,
  properties,
  onSwitch,
}: {
  property: Property | null;
  properties: Property[];
  onSwitch: (slug: string) => void;
}) {
  const labelId = useId();

  return (
    <div className="relative">
      <label id={labelId} className="sr-only">
        Active property
      </label>
      <select
        aria-labelledby={labelId}
        value={property?.slug ?? ''}
        onChange={(e) => onSwitch(e.target.value)}
        className="w-full appearance-none rounded-lg border border-sand-border bg-white/70 py-2 pr-9 pl-3 text-sm font-semibold text-charcoal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-cream"
      >
        {/* If the current slug matches nothing accessible, keep a disabled
            placeholder rather than silently selecting the first property. */}
        {property === null ? (
          <option value="" disabled>
            Select a property…
          </option>
        ) : null}
        {properties.map((p) => (
          <option key={p.id} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
      <ChevronUpDownIcon className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-charcoal-muted" />
    </div>
  );
}
