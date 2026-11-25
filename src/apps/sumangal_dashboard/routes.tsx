import React, { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { ListSkeleton } from '@shared/ui';
import { RequireAppAccess } from '@core/components/RequireAppAccess';
import { SumangalShell, ToHome } from './components/SumangalShell';

const ErpV15 = lazy(() => import('./pages/ErpV15'));

/**
 * sumangal_dashboard routes. **Paths must match navMeta.ts.** Only the operations dashboard (`erp/<screen>`, one
 * route so its page stays mounted between screens) is on; the by-topic, by-intent and by-flow layouts are switched
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
  const landing = ['', 'home', 'dashboard', 'admin/dashboard', 'admin/dashboard/*', ':role/dashboard', 'overview', 'order-types', 'shipments', 'erp', 'erp-v15',
    'layout-topic', 'layout-intent', 'layout-flow', 'layout-erp', 'key-metrics', 'what-changed', 'actions', 'problem-parts', 'journey', 'planning', 'time-spent',
    'batches', 'rhythm', 'ready-waiting', 'orders-per-shipment', 'orders', 'production', 'quality', 'machining-orders', 'material-suppliers', 'customers', 'vendors',
    'x-alerts', 'x-today', 'x-month', 'x-long-term', 'x-decisions',
    ...['injection', 'assembly', 'coating', 'dewaxing', 'melting', 'fettling', 'heat-treatment', 'inspection', 'machining-inspection', 'dispatch'].map((x) => `step-${x}`),
    ...['customer', 'planning', 'production', 'dispatch', 'vendors'].flatMap((x) => [`flow-asis-${x}`, `flow-historic-${x}`])];
  return [
    { path: '/:company/sumangal_dashboard/erp/:screen', element: wrap(<ErpV15 />) },
    ...landing.map((p) => ({
      path: `/:company/sumangal_dashboard${p ? `/${p}` : ''}`,
      element: <ProtectedRoute><ToHome /></ProtectedRoute>,
    })),
  ];
}
