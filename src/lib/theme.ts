// Runtime theme override (build 3, §4) — the piece deferred when Tailwind was
// first set up (see the note in index.css).
//
// index.css defines the platform default theme as CSS custom properties
// (--brand-*). This module re-sets those variables at runtime from a property's
// branding, so every Tailwind utility that reads them (bg-primary, text-charcoal,
// font-sans, and headings via --font-display) re-themes with no per-component
// change. A MISSING or INVALID branding value leaves the variable untouched, so
// the index.css default stands — a property that has set no branding still
// renders correctly.
//
// Applied in two places (both call applyBranding):
//   * the guest site, so a real visitor sees the property's theme; and
//   * the admin settings tab, so a colour/font change previews live as the admin
//     edits, not only after save.
// When the admin leaves the settings preview, clearThemeOverrides() removes the
// overrides so the rest of the admin renders in the neutral platform theme.

import { brandingString } from './branding';
import { darken, isValidHex } from './color';
import {
  resolveFontPairing,
  type FontPairing,
} from './settings/fonts';

// Each editable brand colour maps to its base CSS variable and, where the design
// uses a darker hover/active shade, the hover variable to DERIVE from it (the
// admin picks one colour, not a colour and its hover). text/surface/background
// have no hover pair. text-muted and border stay at their index.css defaults —
// they are derived tones the admin does not set directly.
const COLOR_MAP: {
  brandingKey: string;
  cssVar: string;
  hoverVar?: string;
}[] = [
  {
    brandingKey: 'primary_color',
    cssVar: '--brand-primary',
    hoverVar: '--brand-primary-hover',
  },
  {
    brandingKey: 'accent_color',
    cssVar: '--brand-accent',
    hoverVar: '--brand-accent-hover',
  },
  { brandingKey: 'background_color', cssVar: '--brand-background' },
  { brandingKey: 'text_color', cssVar: '--brand-text' },
  { brandingKey: 'surface_color', cssVar: '--brand-surface' },
];

// Every variable this module ever writes, so clearThemeOverrides can restore the
// index.css defaults completely and symmetrically.
const MANAGED_VARS: string[] = [
  ...COLOR_MAP.flatMap((c) => (c.hoverVar ? [c.cssVar, c.hoverVar] : [c.cssVar])),
  '--brand-font-body',
  '--brand-font-display',
];

// How much darker the derived hover shade is than the chosen base colour.
const HOVER_DARKEN = 0.16;

function rootOf(target?: HTMLElement): HTMLElement {
  return target ?? document.documentElement;
}

// Apply a property's branding to the given root (defaults to <html>). `branding`
// is the freeform JSONB shape (guest site passes settings.branding; the settings
// preview passes an object built from the live field values) — read defensively.
export function applyBranding(
  branding: Record<string, unknown>,
  target?: HTMLElement,
): void {
  const root = rootOf(target);

  for (const { brandingKey, cssVar, hoverVar } of COLOR_MAP) {
    const value = brandingString(branding, brandingKey);
    // Only override with a VALID hex; anything else falls back to the default by
    // clearing any prior override (so a freshly-blanked field returns to default
    // in the live preview rather than sticking).
    if (value && isValidHex(value)) {
      root.style.setProperty(cssVar, value);
      if (hoverVar) {
        const hover = darken(value, HOVER_DARKEN);
        if (hover) root.style.setProperty(hoverVar, hover);
      }
    } else {
      root.style.removeProperty(cssVar);
      if (hoverVar) root.style.removeProperty(hoverVar);
    }
  }

  applyFontPairing(resolveFontPairing(brandingString(branding, 'font_pairing')), root);
}

// Set the font variables and ensure the pairing's stylesheet is loaded. Split
// out so the settings preview can call it directly on a pairing id change.
export function applyFontPairing(
  pairing: FontPairing,
  target?: HTMLElement,
): void {
  const root = rootOf(target);
  root.style.setProperty('--brand-font-body', pairing.body);
  root.style.setProperty('--brand-font-display', pairing.display);
  loadFontStylesheet(pairing);
}

// Remove every override this module applied, restoring the index.css platform
// defaults. Called when the admin leaves the settings preview so the rest of the
// admin is not left wearing a half-applied theme.
export function clearThemeOverrides(target?: HTMLElement): void {
  const root = rootOf(target);
  for (const cssVar of MANAGED_VARS) root.style.removeProperty(cssVar);
}

// --- Font stylesheet loading ----------------------------------------------
// Load ONLY the selected pairing's stylesheet, and only once. Switching pairings
// loads the newly selected one (so the preview is real) without unloading the
// previous — leaving a link in place is cheap and avoids a flash if the admin
// switches back. The default pairing has no URL (Maven Pro is preloaded in
// index.html), so it is a no-op.
const loadedFontUrls = new Set<string>();

function loadFontStylesheet(pairing: FontPairing): void {
  if (!pairing.url) return;
  if (loadedFontUrls.has(pairing.url)) return;
  if (typeof document === 'undefined') return;

  // Guard against a duplicate if a link for this URL already exists (e.g. added
  // by a previous mount before the module set was populated).
  const existing = document.querySelector(
    `link[data-font-pairing="${pairing.id}"]`,
  );
  if (existing) {
    loadedFontUrls.add(pairing.url);
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = pairing.url;
  link.dataset.fontPairing = pairing.id;
  document.head.appendChild(link);
  loadedFontUrls.add(pairing.url);
}
