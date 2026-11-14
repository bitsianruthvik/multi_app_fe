import React, { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { ListSkeleton } from '@shared/ui';
import { RequireAppAccess } from '@core/components/RequireAppAccess';
import { SumangalShell, SwitchLayout, ToHome } from './components/SumangalShell';

const KeyMetrics = lazy(() => import('./pages/KeyMetrics'));
const FlowCustomer = lazy(() => import('./pages/flow/FlowCustomer'));
const FlowPlanning = lazy(() => import('./pages/flow/FlowPlanning'));
const FlowProduction = lazy(() => import('./pages/flow/FlowProduction'));
const FlowDispatch = lazy(() => import('./pages/flow/FlowDispatch'));
const XAlerts = lazy(() => import('./pages/XAlerts'));
const XToday = lazy(() => import('./pages/XToday'));
const XMonth = lazy(() => import('./pages/XMonth'));
const XLongTerm = lazy(() => import('./pages/XLongTerm'));
const XDecisions = lazy(() => import('./pages/XDecisions'));
const WhatChanged = lazy(() => import('./pages/WhatChanged'));
const ActionList = lazy(() => import('./pages/ActionList'));
const ProblemParts = lazy(() => import('./pages/ProblemParts'));
const Orders = lazy(() => import('./pages/Orders'));
const Production = lazy(() => import('./pages/Production'));
const Quality = lazy(() => import('./pages/Quality'));
const Step = lazy(() => import('./pages/Step'));
const MeltingPanel = lazy(() => import('./components/MeltingPanel').then((m) => ({ default: m.MeltingPanel })));
const MachiningOrders = lazy(() => import('./pages/MachiningOrders'));
const OrderJourney = lazy(() => import('./pages/OrderJourney'));
const Planning = lazy(() => import('./pages/Planning'));
const TimeSpent = lazy(() => import('./pages/TimeSpent'));
const Batches = lazy(() => import('./pages/Batches'));
const Rhythm = lazy(() => import('./pages/Rhythm'));
const ReadyWaiting = lazy(() => import('./pages/ReadyWaiting'));
const OrdersPerShipment = lazy(() => import('./pages/OrdersPerShipment'));
const MaterialSuppliers = lazy(() => import('./pages/MaterialSuppliers'));
const Customers = lazy(() => import('./pages/Customers'));
const Vendors = lazy(() => import('./pages/Vendors'));

const STEPS: [string, string, string][] = [
  ['injection', 'Injection', 'Wax patterns made, and how soon after the batch.'],
  ['assembly', 'Assembly', 'Patterns assembled onto trees.'],
  ['coating', 'Coating', 'Shells built on the assembled trees.'],
  ['dewaxing', 'Dewaxing', 'Wax removed from the coated shells.'],
  ['melting', 'Melting', 'Metal poured, heats, charge and energy.'],
  ['fettling', 'Fettling', 'Castings after pouring.'],
  ['heat-treatment', 'Heat treatment', 'What is treated, how, and where.'],
  ['inspection', 'Inspection', 'Castings inspected, and how long after pouring.'],
  ['machining-inspection', 'Machining inspection', 'Machined castings inspected.'],
  ['dispatch', 'Dispatch', 'What has shipped, and what is cleared and waiting.'],
];

/**
 * sumangal_dashboard routes. **Paths must match navMeta.ts.** The platform's
 * landing URLs go to Key metrics; a literal segment outranks App.tsx's `:app` routes.
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
  const screens: [string, React.ReactNode][] = [
    ['key-metrics', <KeyMetrics />],
    ['flow/asis/customer', <FlowCustomer mode="asis" />],
    ['flow/asis/planning', <FlowPlanning mode="asis" />],
    ['flow/asis/production', <FlowProduction mode="asis" />],
    ['flow/asis/dispatch', <FlowDispatch mode="asis" />],
    ['flow/historic/customer', <FlowCustomer mode="historic" />],
    ['flow/historic/planning', <FlowPlanning mode="historic" />],
    ['flow/historic/production', <FlowProduction mode="historic" />],
    ['flow/historic/dispatch', <FlowDispatch mode="historic" />],
    ['x-alerts', <XAlerts />],
    ['x-today', <XToday />],
    ['x-month', <XMonth />],
    ['x-long-term', <XLongTerm />],
    ['x-decisions', <XDecisions />],
    ['what-changed', <WhatChanged />],
    ['actions', <ActionList />],
    ['problem-parts', <ProblemParts />],
    ['journey', <OrderJourney />],
    ['planning', <Planning />],
    ['time-spent', <TimeSpent />],
    ['batches', <Batches />],
    ['rhythm', <Rhythm />],
    ['ready-waiting', <ReadyWaiting />],
    ['orders-per-shipment', <OrdersPerShipment />],
    ['orders', <Orders />],
    ['production', <Production />],
    ['quality', <Quality />],
    ['machining-orders', <MachiningOrders />],
    ['material-suppliers', <MaterialSuppliers />],
    ...STEPS.map(([slug, title, question]) => [`step-${slug}`, <Step key={slug} slug={slug} title={title} question={question} extra={slug === 'melting' ? (f) => <MeltingPanel filters={f} /> : undefined} />] as [string, React.ReactNode]),
    ['customers', <Customers />],
    ['vendors', <Vendors />],
  ];
  // Old screens that were folded into others also land on Key metrics.
  const landing = ['', 'home', 'dashboard', 'admin/dashboard', 'admin/dashboard/*', ':role/dashboard', 'overview', 'order-types', 'shipments'];
  return [
    ...screens.map(([p, el]) => ({ path: `/:company/sumangal_dashboard/${p}`, element: wrap(el) })),
    { path: '/:company/sumangal_dashboard/layout-intent', element: <ProtectedRoute><SwitchLayout to="intent" /></ProtectedRoute> },
    { path: '/:company/sumangal_dashboard/layout-topic', element: <ProtectedRoute><SwitchLayout to="topic" /></ProtectedRoute> },
    { path: '/:company/sumangal_dashboard/layout-flow', element: <ProtectedRoute><SwitchLayout to="flow" /></ProtectedRoute> },
    ...landing.map((p) => ({
      path: `/:company/sumangal_dashboard${p ? `/${p}` : ''}`,
      element: <ProtectedRoute><ToHome /></ProtectedRoute>,
    })),
  ];
}
