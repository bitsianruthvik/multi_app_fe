/**
 * CEOFactory's own look (from the website, ceofactory_site/src/styles/tokens.css). Every page a person sees BEFORE
 * they are signed in uses this, and only this: the sign-in pages say nothing about which companies exist
 * (user, 2026-11-24), so they cannot wear a company's colours. A company's own colours start after sign-in
 * (core/brand/companyBrand.ts).
 */
export const CF = {
  ink: '#091133',          // darkest navy: the page behind the card
  brand: '#12236f',        // primary navy: buttons, links
  accent: '#2c54ff',       // electric blue: hover, focus
  accentSoft: '#8ea4ff',   // accent on navy
  text: '#1b2240',
  textMuted: '#505f98',
  textOnDark: '#dfe4f7',
  textOnDarkMuted: '#b9c1e3',
  surface: '#ffffff',
  surfaceAlt: '#f4f6fc',
  line: '#d9deef',
  dangerBg: '#fdecec',
  dangerText: '#8a1c1c',
  okBg: '#e8f6ee',
  okText: '#14532d',
  font: "'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif",
  radius: 14,
  radiusSm: 10,
  shadow: '0 24px 64px rgb(9 17 51 / 0.35)',
  logo: '/brand/ceofactory-logo.png',
  logoWhite: '/brand/ceofactory-logo-white.png',
} as const;
