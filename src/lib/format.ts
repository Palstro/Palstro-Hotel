// Presentation helpers. NONE of these carry tenant content — the currency code,
// amounts, and counts all arrive from the database (rule 17). Only generic,
// non-tenant UI words ("adult", "children") live here.

// Format a money amount in the property's own currency (e.g. NGN -> ₦45,000).
// Rates are advertised in whole units, so fraction digits are dropped for a
// clean nightly price. An unknown currency code falls back to "CODE 45,000"
// rather than throwing.
export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat().format(amount)}`;
  }
}

// "2 adults · 1 child" — pluralised, children omitted when zero.
export function formatOccupancy(adults: number, children: number): string {
  const parts = [`${adults} ${adults === 1 ? 'adult' : 'adults'}`];
  if (children > 0) {
    parts.push(`${children} ${children === 1 ? 'child' : 'children'}`);
  }
  return parts.join(' · ');
}

// The first usable image URL from a room_types.images JSONB array. images is
// jsonb (rule §6: presentation data, never money), so it is validated defensively
// here — a malformed or empty array yields null and the caller shows a
// placeholder rather than a broken <img>.
export function firstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const first = images.find(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
  return first ?? null;
}
