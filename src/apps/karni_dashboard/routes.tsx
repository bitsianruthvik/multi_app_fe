import React, { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { RequireAppAccess } from '@core/components/RequireAppAccess';
import { KarniShell } from './components/KarniShell';
import { ToOverview } from './components/ToOverview';

const Overview = lazy(() => import('./pages/Overview'));
const Sales = lazy(() => import('./pages/Sales'));
const Receivables = lazy(() => import('./pages/Ageing').then((m) => ({ default: m.Receivables })));
const Payables = lazy(() => import('./pages/Ageing').then((m) => ({ default: m.Payables })));
const SalesOrders = lazy(() => import('./pages/OpenOrders').then((m) => ({ default: m.SalesOrders })));
const PurchaseOrders = lazy(() => import('./pages/OpenOrders').then((m) => ({ default: m.PurchaseOrders })));
const Inventory = lazy(() => import('./pages/Inventory'));
const Dispatch = lazy(() => import('./pages/Dispatch'));
const Purchase = lazy(() => import('./pages/Purchase'));
const Production = lazy(() => import('./pages/Production'));
const SapReports = lazy(() => import('./pages/SapReports'));
const Connection = lazy(() => import('./pages/Connection'));

/**
 * karni_dashboard routes. **Paths must match navMeta.ts.** The platform's
 * landing URLs (/dashboard, /admin/dashboard, /:role/dashboard) all go to the
 * Overview — a literal `karni_dashboard` segment outranks App.tsx's `:app` routes.
 */
export function getKarniDashboardRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  const wrap = (el: React.ReactNode) => (
    <ProtectedRoute>
      <RequireAppAccess>
        <KarniShell>
          <Suspense fallback={null}>{el}</Suspense>
        </KarniShell>
      </RequireAppAccess>
    </ProtectedRoute>
  );
  const screens: [string, React.ReactNode][] = [
    ['overview', <Overview />],
    ['sales', <Sales />],
    ['sales-orders', <SalesOrders />],
    ['dispatch', <Dispatch />],
    ['receivables', <Receivables />],
    ['purchase', <Purchase />],
    ['purchase-orders', <PurchaseOrders />],
    ['payables', <Payables />],
    ['production', <Production />],
    ['inventory', <Inventory />],
    ['sap-reports', <SapReports />],
    ['connection', <Connection />],
  ];
  const landing = ['', 'home', 'dashboard', 'admin/dashboard', 'admin/dashboard/*', ':role/dashboard'];
  return [
    ...screens.map(([p, el]) => ({ path: `/:company/karni_dashboard/${p}`, element: wrap(el) })),
    ...landing.map((p) => ({
      path: `/:company/karni_dashboard${p ? `/${p}` : ''}`,
      element: <ProtectedRoute><ToOverview /></ProtectedRoute>,
    })),
  ];
}
