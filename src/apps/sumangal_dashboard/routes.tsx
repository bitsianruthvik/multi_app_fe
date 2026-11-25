import React, { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { ListSkeleton } from '@shared/ui';
import { RequireAppAccess } from '@core/components/RequireAppAccess';
import { SumangalShell, ToHome } from './components/SumangalShell';
import { ERP_SCREENS } from './erpScreens';

const ErpV15 = lazy(() => import('./pages/ErpV15'));

/**
 * sumangal_dashboard routes. **Paths must match navMeta.ts.** Only the operations dashboard (one route per screen, all
 * the same page, which stays mounted between screens: SumangalShell's contentKey) is on; the by-topic, by-intent and by-flow layouts are switched
 * off for now (layout.ts) and their old addresses, like the platform's landing URLs, open the home screen.
 * Their pages are still in pages/ for when they come back.
 */
export function getSumangalDashboardRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  const wrap = (el: React.ReactNode) => (
    <ProtectedRoute>
      <RequireAppAccess>
        <SumangalShell>
          <Suspense fallback={<ListSkeleton rows={8} />}>{el}</Suspense>
        </SumangalShell>
      </RequireAppAccess>
    </ProtectedRoute>
  );
  // Named, not a splat: a splat here would also catch the app's login page.
  const landing = ['', 'home', 'dashboard', 'admin/dashboard', 'admin/dashboard/*', ':role/dashboard', 'overview', 'order-types', 'shipments', 'erp', 'erp-v15', 'erp/:screen',
    'layout-topic', 'layout-intent', 'layout-flow', 'layout-erp', 'key-metrics', 'what-changed', 'actions', 'problem-parts', 'journey', 'planning', 'time-spent',
    'batches', 'rhythm', 'ready-waiting', 'orders-per-shipment', 'machining-orders', 'material-suppliers', 'customers',
    'x-alerts', 'x-today', 'x-month', 'x-long-term', 'x-decisions',
    ...['injection', 'assembly', 'coating', 'dewaxing', 'melting', 'fettling', 'heat-treatment', 'inspection', 'machining-inspection', 'dispatch'].map((x) => `step-${x}`),
    ...['customer', 'planning', 'production', 'dispatch', 'vendors'].flatMap((x) => [`flow-asis-${x}`, `flow-historic-${x}`])];
  return [
    ...ERP_SCREENS.map((s) => ({ path: `/:company/sumangal_dashboard/${s.slug}`, element: wrap(<ErpV15 />) })),
    ...landing.map((p) => ({
      path: `/:company/sumangal_dashboard${p ? `/${p}` : ''}`,
      element: <ProtectedRoute><ToHome /></ProtectedRoute>,
    })),
  ];
}
