import { useLocation } from 'react-router-dom';

/**
 * The company slug, read from the URL path.
 *
 * `useParams()` cannot be used for this in the shell: FabErpShell, the top nav
 * and the command palette are all rendered by AppShell, which sits *outside*
 * the `/:company/fab_erp/*` Route. useParams only populates inside a matched
 * route, so it returned undefined there and every nav link pointed at
 * `/undefined/fab_erp/...`.
 *
 * Pages are inside the route and may keep using useParams; this exists for the
 * chrome that wraps them.
 */
export function useCompanySlug(): string {
  const { pathname } = useLocation();
  return pathname.split('/').filter(Boolean)[0] ?? '';
}
