import { useLocation } from 'react-router-dom';

/**
 * The company slug, read from the URL path.
 *
 * `useParams()` cannot be used for this in the shell: AppShell, the top nav and
 * the command palette are rendered *outside* the `/:company/:app/*` route, and
 * useParams only populates inside a matched route — it returns undefined there,
 * so every nav link would point at `/undefined/<app>/…`.
 *
 * Pages are inside the route and may keep using useParams; this exists for the
 * chrome that wraps them.
 */
export function useCompanySlug(): string {
  const { pathname } = useLocation();
  return pathname.split('/').filter(Boolean)[0] ?? '';
}
