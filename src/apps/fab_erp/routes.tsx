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
const ShiftCalendars     = lazy(() => import('./pages/ShiftCalendars'));
const GrnDetail          = lazy(() => import('./pages/GrnDetail'));
const GrnEntry           = lazy(() => import('./pages/GrnEntry'));
const SalesOrders        = lazy(() => import('./pages/SalesOrders'));
const SalesOrderDetail   = lazy(() => import('./pages/SalesOrderDetail'));
const Suppliers          = lazy(() => import('./pages/Suppliers'));
const SupplierDetail     = lazy(() => import('./pages/SupplierDetail'));
const Customers          = lazy(() => import('./pages/Customers'));
const CodegenSettings    = lazy(() => import('./pages/CodegenSettings'));
const Operations         = lazy(() => import('./pages/Operations'));
const OperationFlows     = lazy(() => import('./pages/OperationFlows'));
const BomTemplates       = lazy(() => import('./pages/BomTemplates'));
const TaskQueue          = lazy(() => import('./pages/TaskQueue'));

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
    { path: '/:company/fab_erp/plants',                      element: wrap(<Plants />) },
    { path: '/:company/fab_erp/resource-types',              element: wrap(<ResourceTypes />) },
    { path: '/:company/fab_erp/item-metrics',                element: wrap(<ItemMetrics />) },
    { path: '/:company/fab_erp/constants',                   element: wrap(<Constants />) },
    { path: '/:company/fab_erp/item-catalog',                element: wrap(<ItemCatalog />) },
    { path: '/:company/fab_erp/item-catalog/:itemId',        element: wrap(<ItemCatalogDetail />) },
    { path: '/:company/fab_erp/item-batches',                element: wrap(<ItemBatches />) },
    { path: '/:company/fab_erp/shift-calendars',             element: wrap(<ShiftCalendars />) },
    { path: '/:company/fab_erp/grn-detail',                  element: wrap(<GrnDetail />) },
    { path: '/:company/fab_erp/grn',                         element: wrap(<GrnEntry />) },
    { path: '/:company/fab_erp/orders',                       element: wrap(<SalesOrders />) },
    { path: '/:company/fab_erp/orders/:soId',                 element: wrap(<SalesOrderDetail />) },
    { path: '/:company/fab_erp/suppliers',                   element: wrap(<Suppliers />) },
    { path: '/:company/fab_erp/suppliers/:supplierId',       element: wrap(<SupplierDetail />) },
    { path: '/:company/fab_erp/customers',                   element: wrap(<Customers />) },
    { path: '/:company/fab_erp/codegen-settings',            element: wrap(<CodegenSettings />) },
    { path: '/:company/fab_erp/operations',                 element: wrap(<Operations />) },
    { path: '/:company/fab_erp/operation-flows',            element: wrap(<OperationFlows />) },
    { path: '/:company/fab_erp/bom-templates',               element: wrap(<BomTemplates />) },
    { path: '/:company/fab_erp/task-queue',                 element: wrap(<TaskQueue />) },
  ];
}
