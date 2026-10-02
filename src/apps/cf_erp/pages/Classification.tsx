import { Navigate } from 'react-router-dom';
import { useCompanySlug } from '../hooks/useLoad';
import { appPath } from '../navMeta';

/**
 * Setup › Classification is gone (2026-10-02): each screen manages its own,
 * derived part of the tree from a Classification pop-up — Items, Definitions,
 * Machines. Old links and bookmarks land on Items with the pop-up open.
 */
export default function Classification() {
  const company = useCompanySlug();
  return <Navigate to={`${appPath(company, 'items')}?classification=1`} replace />;
}
