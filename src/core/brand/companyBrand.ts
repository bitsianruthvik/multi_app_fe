/**
 * A company's own colours and logo, AFTER sign-in (2026-11-26; backend core/brand/companyBrand.js, admin panel ›
 * Branding). Before sign-in every page is CEOFactory's (core/brand/ceofactory.ts).
 *
 * colors, in order: [primary, secondary, accent, extra…] (3-6). This file turns them into the CSS variables every app
 * already paints with, so no component changes colour by itself:
 *   platform apps (cf_hrms, karni, sumangal, connections) and the two ERPs   --c-primary-50…900, --c-chart-1…6
 *   the older apps (audio, sales, admin pages)                               --color-brand-50…900, --color-primary*, --color-accent
 * and MUI's palette.primary / palette.secondary (BrandPalette in CompanyBrandContext.tsx).
 * A light colour is darkened for the shade that carries white text (600), so buttons stay readable.
 */
export type CompanyBrand = { company: { name: string; slug: string } | null; colors: string[]; logo: string };

type HSL = { h: number; s: number; l: number };
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function toHsl(hex: string): HSL {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function fromHsl({ h, s, l }: HSL): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** The colour itself when white text reads on it (4.5:1), else the same hue darkened until it does. */
export function solidFor(hex: string) {
  const c = toHsl(hex);
  let out = hex.toUpperCase();
  while (contrast(out, '#FFFFFF') < 4.5 && c.l > 5) { c.l -= 2; out = fromHsl(c); }
  return out;
}
/** Text colour for a filled background of this colour. */
export const inkOn = (hex: string) => (contrast(hex, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#111827');

/** A 50…900 ramp around one colour; 600 is `solidFor` (white text on it). */
export function ramp(hex: string) {
  const solid = solidFor(hex);
  const { h, s, l } = toHsl(solid);
  const sat = clamp(s, 10, 92);
  const at = (L: number, S = sat) => fromHsl({ h, s: S, l: clamp(L, 3, 98) });
  return {
    50: at(97, Math.min(sat, 80)), 100: at(93, Math.min(sat, 80)), 200: at(85), 300: at(74), 400: at(Math.max(l + 16, 60)),
    500: at(Math.max(l + 7, 48)), 600: solid, 700: at(l - 8), 800: at(l - 14), 900: at(l - 20),
    // dark theme: the light end becomes the dark end of the same hue (see shared/ui/tokens.css dark block)
    d50: at(14, Math.min(sat, 45)), d100: at(19, Math.min(sat, 50)), d200: at(26, Math.min(sat, 55)), d700: at(80), d900: at(88),
    // the older apps' sidebars: deep navy-like shades of the same hue
    deep900: at(12, Math.min(sat, 60)), deep800: at(16, Math.min(sat, 60)), deep700: at(21, Math.min(sat, 60)),
  };
}

// One attribute more than the token files' own selectors, so these win whatever order the stylesheets load in
// (an app's token CSS arrives with its lazy chunk, after this <style>).
const PLATFORM = "html[data-ui='platform'][data-ui]";
const ERP = ":is(html[data-app='fab_erp'], html[data-app='cf_erp'])[data-app]";

/** The stylesheet text that repaints every app with the company's colours ('' = the standard look). */
export function brandCss(colors: string[]): string {
  if (!colors || colors.length < 3) return '';
  const p = ramp(colors[0]);
  const second = solidFor(colors[1]);
  const accent = solidFor(colors[2]);
  const charts = colors.map((c, i) => `--c-chart-${i + 1}: ${c};`).join(' ');
  const primary = (r: ReturnType<typeof ramp>) =>
    `--c-primary-50: ${r[50]}; --c-primary-100: ${r[100]}; --c-primary-200: ${r[200]}; --c-primary-400: ${r[400]}; --c-primary-500: ${r[500]}; --c-primary-600: ${r[600]}; --c-primary-700: ${r[700]}; --c-primary-900: ${r[900]};`;
  const primaryDark = (r: ReturnType<typeof ramp>) =>
    `--c-primary-50: ${r.d50}; --c-primary-100: ${r.d100}; --c-primary-200: ${r.d200}; --c-primary-700: ${r.d700}; --c-primary-900: ${r.d900};`;
  return [
    `/* company brand (core/brand/companyBrand.ts) */`,
    `:root:root { --color-brand-900: ${p.deep900}; --color-brand-800: ${p.deep800}; --color-brand-700: ${p.deep700}; --color-brand-600: ${p[700]}; --color-brand-500: ${p[600]}; --color-brand-400: ${p[500]}; --color-brand-300: ${p[300]}; --color-brand-200: ${p[200]}; --color-brand-100: ${p[100]}; --color-brand-50: ${p[50]}; --color-accent: ${accent}; --color-secondary: ${second}; --company-1: ${colors[0]}; --company-2: ${colors[1]}; --company-3: ${colors[2]}; }`,
    `${PLATFORM}, ${ERP} { ${primary(p)} ${charts} }`,
    // dark: the same selectors the token files use (they follow data-theme only, not the system setting)
    `${PLATFORM}[data-theme='dark'], ${PLATFORM} [data-theme='dark'], ${ERP}[data-theme='dark'], ${ERP} [data-theme='dark'] { ${primaryDark(p)} }`,
  ].join('\n');
}

const CACHE = (slug: string) => `companyBrand:${slug}`;
export function readCachedBrand(slug: string | null | undefined): CompanyBrand | null {
  if (!slug) return null;
  try { const v = JSON.parse(localStorage.getItem(CACHE(slug)) || 'null'); return v && Array.isArray(v.colors) ? v : null; } catch { return null; }
}
export function cacheBrand(slug: string, b: CompanyBrand | null) {
  try { if (b) localStorage.setItem(CACHE(slug), JSON.stringify(b)); else localStorage.removeItem(CACHE(slug)); } catch { /* storage full or blocked: only the first paint is plain */ }
}
