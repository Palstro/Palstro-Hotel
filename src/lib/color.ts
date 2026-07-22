// Colour maths for the settings framework: WCAG contrast checking (the inline
// warning on colour fields, CLAUDE.md §8) and small transforms the theme system
// needs. Pure functions, no tenant content — the colours flow in as data.

// #RGB or #RRGGBB — the two hex forms the native colour input and our fields
// accept. Anything else is treated as "not yet a colour".
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidHex(hex: string): boolean {
  return HEX.test(hex.trim());
}

// Normalise to a 6-digit body without the leading '#'. Assumes isValidHex.
function expand(hex: string): string {
  const h = hex.trim().slice(1);
  return h.length === 3
    ? h
        .split('')
        .map((c) => c + c)
        .join('')
    : h;
}

export function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  if (!isValidHex(hex)) return null;
  const h = expand(hex);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// The sRGB -> linear channel transform from the WCAG relative-luminance formula.
function linearise(channel8bit: number): number {
  const s = channel8bit / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// WCAG relative luminance in [0, 1], or null for an invalid colour.
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (
    0.2126 * linearise(rgb.r) +
    0.7152 * linearise(rgb.g) +
    0.0722 * linearise(rgb.b)
  );
}

// WCAG contrast ratio in [1, 21], or null if either colour is unparseable. The
// order of the two arguments does not matter.
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// The AA thresholds from CLAUDE.md §8: 4.5:1 for normal text, 3:1 for large.
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

// Darken a hex colour toward black by `amount` (0..1). Used to DERIVE a hover /
// active variant from the single brand colour the admin picks — they choose one
// primary, not a primary and its darker hover, so the theme derives the second.
export function darken(hex: string, amount: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const f = Math.max(0, Math.min(1, 1 - amount));
  const to2 = (n: number) =>
    Math.round(n * f)
      .toString(16)
      .padStart(2, '0');
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}
