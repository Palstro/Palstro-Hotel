// The curated font pairings a property may choose from (build 3, §4).
//
// WHY A CURATED LIST, NOT FREE GOOGLE-FONTS INPUT: arbitrary font loading is
// both a performance problem (an admin could paste a 400KB display face that
// blocks first paint on the guest site) and a licensing one (not every Google
// font is licensed for embedding the way we assume). Six vetted pairings, each
// with a known stylesheet URL, sidestep both.
//
// Each pairing is a DISPLAY face (headings) + a BODY face (running text) + the
// single Google Fonts stylesheet URL that loads exactly those two families. The
// theme system (lib/theme.ts) loads ONLY the selected pairing's URL, and loads a
// newly selected one the moment the admin switches, so the live preview shows
// the real fonts rather than a fallback.
//
// The font-family STACKS always end in a system fallback of the right category
// (serif for display, sans for body) so text stays readable during the brief
// window before the web font arrives, or if it fails to load entirely.

export interface FontPairing {
  // Stable id stored in property_settings.branding.font_pairing. Never rename an
  // existing id — a stored value would orphan and fall back to the default.
  id: string;
  label: string;
  // CSS font-family values, applied to --brand-font-display / --brand-font-body.
  display: string;
  body: string;
  // The Google Fonts stylesheet that provides both families. null for the
  // default pairing, whose family is already loaded in index.html.
  url: string | null;
}

// Maven Pro is the platform default (matches index.html and index.css). Its
// families are preloaded there, so its pairing carries no URL to fetch.
export const DEFAULT_FONT_PAIRING_ID = 'maven_pro';

const SANS_FALLBACK = 'ui-sans-serif, system-ui, sans-serif';
const SERIF_FALLBACK = 'ui-serif, Georgia, "Times New Roman", serif';

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'maven_pro',
    label: 'Maven Pro — clean & friendly (default)',
    display: `'Maven Pro', ${SANS_FALLBACK}`,
    body: `'Maven Pro', ${SANS_FALLBACK}`,
    url: null,
  },
  {
    id: 'playfair_source',
    label: 'Playfair Display + Source Sans — classic hospitality',
    display: `'Playfair Display', ${SERIF_FALLBACK}`,
    body: `'Source Sans 3', ${SANS_FALLBACK}`,
    url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap',
  },
  {
    id: 'lora_inter',
    label: 'Lora + Inter — warm & readable',
    display: `'Lora', ${SERIF_FALLBACK}`,
    body: `'Inter', ${SANS_FALLBACK}`,
    url: 'https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap',
  },
  {
    id: 'fraunces_nunito',
    label: 'Fraunces + Nunito Sans — characterful & soft',
    display: `'Fraunces', ${SERIF_FALLBACK}`,
    body: `'Nunito Sans', ${SANS_FALLBACK}`,
    url: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Nunito+Sans:wght@400;600;700&display=swap',
  },
  {
    id: 'cormorant_montserrat',
    label: 'Cormorant Garamond + Montserrat — elegant & modern',
    display: `'Cormorant Garamond', ${SERIF_FALLBACK}`,
    body: `'Montserrat', ${SANS_FALLBACK}`,
    url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Montserrat:wght@400;500;600&display=swap',
  },
  {
    id: 'dmserif_dmsans',
    label: 'DM Serif Display + DM Sans — bold & contemporary',
    display: `'DM Serif Display', ${SERIF_FALLBACK}`,
    body: `'DM Sans', ${SANS_FALLBACK}`,
    url: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap',
  },
];

// Look up a pairing by id, falling back to the default for an unknown/blank id
// (a property that never chose one, or a stored id we later retired).
export function resolveFontPairing(id: string | null | undefined): FontPairing {
  const found = id ? FONT_PAIRINGS.find((p) => p.id === id) : undefined;
  return found ?? FONT_PAIRINGS[0];
}
