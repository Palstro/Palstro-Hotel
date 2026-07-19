import type { Property } from '../types/tenant';

// Compose one human-readable address line from the structured address columns on
// `properties` (003). Returns null when the property has no real locality set:
// `country` is not-null and defaults to 'Nigeria' for every property, so country
// alone is NOT a meaningful address and must not force the Location section to
// render. We therefore require at least a street line or a city before showing
// an address, then join whatever parts are present.
export function formatPropertyAddress(property: Property): string | null {
  const clean = (v: string | null | undefined): string | null => {
    const t = v?.trim();
    return t && t.length > 0 ? t : null;
  };

  const addressLine = clean(property.address_line);
  const city = clean(property.city);
  if (!addressLine && !city) return null;

  const parts = [
    addressLine,
    city,
    clean(property.state),
    clean(property.postal_code),
    clean(property.country),
  ].filter((p): p is string => p !== null);

  return parts.length > 0 ? parts.join(', ') : null;
}
