import React, { lazy } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { RequireAppAccess } from '@core/components/RequireAppAccess';

const Home               = lazy(() => import('./pages/Home'));
const Plants             = lazy(() => import('./pages/Plants'));
const ResourceTypes      = lazy(() => import('./pages/ResourceTypes'));
const ItemMetrics        = lazy(() => import('./pages/ItemMetrics'));
const Constants          = lazy(() => import('./pages/Constants'));
const ItemCatalog        = lazy(() => import('./pages/ItemCatalog'));
const ItemCatalogDetail  = lazy(() => import('./pages/ItemCatalogDetail'));
const ItemBatches        = lazy(() => import('./pages/ItemBatches'));
const StockIn            = lazy(() => import('./pages/StockIn'));
const ShiftCalendars     = lazy(() => import('./pages/ShiftCalendars'));
const SalesOrders        = lazy(() => import('./pages/SalesOrders'));
const SalesOrderDetail   = lazy(() => import('./pages/SalesOrderDetail'));
const Customers          = lazy(() => import('./pages/Customers'));
const CodegenSettings    = lazy(() => import('./pages/CodegenSettings'));
const Operations         = lazy(() => import('./pages/Operations'));
const OperationFlows     = lazy(() => import('./pages/OperationFlows'));
const ProgressTemplates  = lazy(() => import('./pages/ProgressTemplates'));
const TaskQueue          = lazy(() => import('./pages/TaskQueue'));
const TaskEngine         = lazy(() => import('./pages/TaskEngine'));
const MachineBoard       = lazy(() => import('./pages/MachineBoard'));
const BufferConfig       = lazy(() => import('./pages/BufferConfig'));
const MachineTimeline    = lazy(() => import('./pages/MachineTimeline'));
const ShiftLog           = lazy(() => import('./pages/ShiftLog'));
const People             = lazy(() => import('./pages/People'));
const Reconciliation     = lazy(() => import('./pages/Reconciliation'));
const ShopfloorAnalytics = lazy(() => import('./pages/ShopfloorAnalytics'));
const CriticalChain      = lazy(() => import('./pages/CriticalChain'));
const Setup              = lazy(() => import('./pages/Setup'));

export function getFabErpRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  const wrap = (el: React.ReactElement) => (
    <ProtectedRoute><RequireAppAccess>{el}</RequireAppAccess></ProtectedRoute>
  );

  function FabErpDashboardRedirect() {
    const { company } = useParams<{ company: string }>();
    return <Navigate to={`/${company}/fab_erp/home`} replace />;
  }

  return [
    { path: '/:company/fab_erp/dashboard',                   element: <FabErpDashboardRedirect /> },
    { path: '/:company/fab_erp/home',                        element: wrap(<Home />) },
    { path: '/:company/fab_erp/setup',                       element: wrap(<Setup />) },
    { path: '/:company/fab_erp/plants',                      element: wrap(<Plants />) },
    { path: '/:company/fab_erp/resource-types',              element: wrap(<ResourceTypes />) },
    { path: '/:company/fab_erp/item-metrics',                element: wrap(<ItemMetrics />) },
    { path: '/:company/fab_erp/constants',                   element: wrap(<Constants />) },
    { path: '/:company/fab_erp/item-catalog',                element: wrap(<ItemCatalog />) },
    { path: '/:company/fab_erp/item-catalog/:itemId',        element: wrap(<ItemCatalogDetail />) },
    { path: '/:company/fab_erp/item-batches',                element: wrap(<ItemBatches />) },
    { path: '/:company/fab_erp/stock-in',                    element: wrap(<StockIn />) },
    { path: '/:company/fab_erp/shift-calendars',             element: wrap(<ShiftCalendars />) },
    { path: '/:company/fab_erp/orders',                       element: wrap(<SalesOrders />) },
    { path: '/:company/fab_erp/orders/:soId',                 element: wrap(<SalesOrderDetail />) },
    { path: '/:company/fab_erp/customers',                   element: wrap(<Customers />) },
    { path: '/:company/fab_erp/codegen-settings',            element: wrap(<CodegenSettings />) },
    { path: '/:company/fab_erp/operations',                 element: wrap(<Operations />) },
    { path: '/:company/fab_erp/operation-flows',            element: wrap(<OperationFlows />) },
    { path: '/:company/fab_erp/progress-templates',          element: wrap(<ProgressTemplates />) },
    { path: '/:company/fab_erp/task-queue',                 element: wrap(<TaskQueue />) },
    { path: '/:company/fab_erp/task-engine',                element: wrap(<TaskEngine />) },
    { path: '/:company/fab_erp/machine-board',               element: wrap(<MachineBoard />) },
    { path: '/:company/fab_erp/buffer-config',               element: wrap(<BufferConfig />) },
    { path: '/:company/fab_erp/machine-timeline',            element: wrap(<MachineTimeline />) },
    { path: '/:company/fab_erp/people',                     element: wrap(<People />) },
    { path: '/:company/fab_erp/shift-log',                  element: wrap(<ShiftLog />) },
    { path: '/:company/fab_erp/reconciliation',              element: wrap(<Reconciliation />) },
    { path: '/:company/fab_erp/analytics',                   element: wrap(<ShopfloorAnalytics />) },
    { path: '/:company/fab_erp/critical-chain',              element: wrap(<CriticalChain />) },
  ];
}
