import type { PropertyBranding } from '../types/tenant';

// Safe accessors over the freeform property_settings.branding JSONB. The schema
// does not constrain branding's shape (001), so every read is defensive: a
// missing key, wrong type, or blank string yields a null/empty result and the
// caller simply does not render that piece (rule: no empty gaps, no crashes).
//
// Known keys the guest site reads (all optional):
//   logo_url, tagline, hero_images[], about_text, about_image, amenities[],
//   gallery_images[], address, directions, phone, email, social{}

export function brandingString(
  b: PropertyBranding,
  key: string,
): string | null {
  const v = (b as Record<string, unknown>)?.[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

export function brandingStringArray(
  b: PropertyBranding,
  key: string,
): string[] {
  const v = (b as Record<string, unknown>)?.[key];
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
}

// A flat string->string map (e.g. branding.social = { instagram: "https://…" }).
// Non-string values and blanks are dropped.
export function brandingRecord(
  b: PropertyBranding,
  key: string,
): Record<string, string> {
  const v = (b as Record<string, unknown>)?.[key];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val.trim().length > 0) out[k] = val.trim();
  }
  return out;
}
