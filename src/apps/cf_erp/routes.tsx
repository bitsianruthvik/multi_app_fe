import React, { lazy } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { RequireAppAccess } from '@core/components/RequireAppAccess';

const Home = lazy(() => import('./pages/Home'));
const Classification = lazy(() => import('./pages/Classification'));
const Specifications = lazy(() => import('./pages/Specifications'));
const Formulas = lazy(() => import('./pages/Formulas'));
const Records = lazy(() => import('./pages/Records'));
const RecordDetail = lazy(() => import('./pages/RecordDetail'));
const CodingRules = lazy(() => import('./pages/CodingRules'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Customers = lazy(() => import('./pages/Customers'));
const Tracker = lazy(() => import('./pages/Tracker'));
const Machines = lazy(() => import('./pages/Machines'));
const MachineDetail = lazy(() => import('./pages/MachineDetail'));
const Operations = lazy(() => import('./pages/Operations'));
const OperationDetail = lazy(() => import('./pages/OperationDetail'));
const Flows = lazy(() => import('./pages/Flows'));
const FlowDetail = lazy(() => import('./pages/FlowDetail'));
const Stock = lazy(() => import('./pages/Stock'));
const BuyList = lazy(() => import('./pages/BuyList'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const PurchaseOrderDetail = lazy(() => import('./pages/PurchaseOrderDetail'));
const Movements = lazy(() => import('./pages/Movements'));
const MovementDetail = lazy(() => import('./pages/MovementDetail'));
const Batches = lazy(() => import('./pages/Batches'));
const BatchDetail = lazy(() => import('./pages/BatchDetail'));
const StockingAreas = lazy(() => import('./pages/StockingAreas'));
const StockingAreaDetail = lazy(() => import('./pages/StockingAreaDetail'));

/** cf_erp routes. Paths must match navMeta.ts — it is what the shell and breadcrumbs read. */
export function getCfErpRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  const wrap = (el: React.ReactElement) => (
    <ProtectedRoute><RequireAppAccess>{el}</RequireAppAccess></ProtectedRoute>
  );

  function ToHome() {
    const { company } = useParams<{ company: string }>();
    return <Navigate to={`/${company}/cf_erp/home`} replace />;
  }

  return [
    { path: '/:company/cf_erp', element: <ToHome /> },
    { path: '/:company/cf_erp/dashboard', element: <ToHome /> },
    { path: '/:company/cf_erp/home', element: wrap(<Home />) },
    { path: '/:company/cf_erp/orders', element: wrap(<Orders />) },
    { path: '/:company/cf_erp/orders/:id', element: wrap(<OrderDetail />) },
    { path: '/:company/cf_erp/customers', element: wrap(<Customers />) },
    { path: '/:company/cf_erp/items', element: wrap(<Records recordKind="item" />) },
    { path: '/:company/cf_erp/items/:id', element: wrap(<RecordDetail recordKind="item" />) },
    { path: '/:company/cf_erp/definitions', element: wrap(<Records recordKind="definition" />) },
    { path: '/:company/cf_erp/definitions/:id', element: wrap(<RecordDetail recordKind="definition" />) },
    { path: '/:company/cf_erp/tracker', element: wrap(<Tracker />) },
    { path: '/:company/cf_erp/machines', element: wrap(<Machines />) },
    { path: '/:company/cf_erp/machines/:id', element: wrap(<MachineDetail />) },
    { path: '/:company/cf_erp/operations', element: wrap(<Operations />) },
    { path: '/:company/cf_erp/operations/:id', element: wrap(<OperationDetail />) },
    { path: '/:company/cf_erp/flows', element: wrap(<Flows />) },
    { path: '/:company/cf_erp/flows/:id', element: wrap(<FlowDetail />) },
    { path: '/:company/cf_erp/stock', element: wrap(<Stock />) },
    { path: '/:company/cf_erp/buy-list', element: wrap(<BuyList />) },
    { path: '/:company/cf_erp/purchase-orders', element: wrap(<PurchaseOrders />) },
    { path: '/:company/cf_erp/purchase-orders/:id', element: wrap(<PurchaseOrderDetail />) },
    { path: '/:company/cf_erp/movements', element: wrap(<Movements />) },
    { path: '/:company/cf_erp/movements/:id', element: wrap(<MovementDetail />) },
    { path: '/:company/cf_erp/batches', element: wrap(<Batches />) },
    { path: '/:company/cf_erp/batches/:id', element: wrap(<BatchDetail />) },
    { path: '/:company/cf_erp/stocking-areas', element: wrap(<StockingAreas />) },
    { path: '/:company/cf_erp/stocking-areas/:id', element: wrap(<StockingAreaDetail />) },
    { path: '/:company/cf_erp/classification', element: wrap(<Classification />) },
    { path: '/:company/cf_erp/specifications', element: wrap(<Specifications />) },
    { path: '/:company/cf_erp/formulas', element: wrap(<Formulas />) },
    { path: '/:company/cf_erp/coding-rules', element: wrap(<CodingRules />) },
  ];
}
