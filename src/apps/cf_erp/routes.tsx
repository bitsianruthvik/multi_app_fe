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
const Cutting = lazy(() => import('./pages/Cutting'));
const CodingRules = lazy(() => import('./pages/CodingRules'));
const Processes = lazy(() => import('./pages/Processes'));
// The list and the one-process screen share a file, so they share their words.
const ProcessDetail = lazy(() => import('./pages/Processes').then((m) => ({ default: m.ProcessDetail })));
const Orders = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'));
const CompanyTax = lazy(() => import('./pages/CompanyTax'));
const Customers = lazy(() => import('./pages/Customers'));
const Plan = lazy(() => import('./pages/Plan'));
const Planner = lazy(() => import('./pages/Planner'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tracker = lazy(() => import('./pages/Tracker'));
const Floor = lazy(() => import('./pages/Floor'));
const Operators = lazy(() => import('./pages/Operators'));
const StopReasons = lazy(() => import('./pages/StopReasons'));
const Machines = lazy(() => import('./pages/Machines'));
const MachineDetail = lazy(() => import('./pages/MachineDetail'));
const Tools = lazy(() => import('./pages/Tools'));
// Maintenance (§82): machines board, maintenance orders, preventive plans, planned downtime.
const MaintenanceBoard = lazy(() => import('./pages/Maintenance'));
const MaintenanceOrders = lazy(() => import('./pages/Maintenance').then((m) => ({ default: m.MaintenanceOrders })));
const MaintenancePlans = lazy(() => import('./pages/Maintenance').then((m) => ({ default: m.MaintenancePlans })));
const PlannedDowntime = lazy(() => import('./pages/Maintenance').then((m) => ({ default: m.PlannedDowntime })));
const MaintenanceOrderDetail = lazy(() => import('./pages/MaintenanceOrderDetail'));
const MachineTypeDetail = lazy(() => import('./pages/MachineTypeDetail'));
const Operations = lazy(() => import('./pages/Operations'));
const OperationDetail = lazy(() => import('./pages/OperationDetail'));
const Flows = lazy(() => import('./pages/Flows'));
const FlowDetail = lazy(() => import('./pages/FlowDetail'));
const ContractorWorkOrders = lazy(() => import('./pages/ContractorWorkOrders'));
const ContractorWorkOrderDetail = lazy(() => import('./pages/ContractorWorkOrderDetail'));
const ProductionOrders = lazy(() => import('./pages/ProductionOrders'));
const ProductionOrderDetail = lazy(() => import('./pages/ProductionOrderDetail'));
const WorkOrderDetail = lazy(() => import('./pages/WorkOrderDetail'));
const Stock = lazy(() => import('./pages/Stock'));
// Purchase flow v3 (§71): MR → PR (vendor columns) → PO → Receive against PO.
const MaterialRequests = lazy(() => import('./pages/MaterialRequests'));
// §79: Stores › To reorder (min / max and periodic items, by AI).
const ToReorder = lazy(() => import('./pages/ToReorder'));
const MaterialRequestDetail = lazy(() => import('./pages/MaterialRequestDetail'));
const PurchaseRequests = lazy(() => import('./pages/PurchaseRequests'));
const PurchaseRequestDetail = lazy(() => import('./pages/PurchaseRequestDetail'));
const ReceiveAgainstPo = lazy(() => import('./pages/ReceiveAgainstPo'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const PurchaseOrderDetail = lazy(() => import('./pages/PurchaseOrderDetail'));
// Plate changes after a purchase order, approved by the MD (init.sql §62).
const PlateChanges = lazy(() => import('./pages/PlateChanges'));
// Customer acceptance, the Management inbox, the Orders board, Setup › Templates (§73).
const Approvals = lazy(() => import('./pages/Approvals'));
const ManagementOverview = lazy(() => import('./pages/Approvals').then((m) => ({ default: m.ManagementOverview })));
const OrdersBoard = lazy(() => import('./pages/OrdersBoard'));
const TermTemplates = lazy(() => import('./pages/TermTemplates'));
// Accounts (§74): the Billing board, receipts, order costing.
const Billing = lazy(() => import('./pages/Billing'));
const Receipts = lazy(() => import('./pages/Receipts'));
const OrderCosting = lazy(() => import('./pages/OrderCosting'));
const Movements = lazy(() => import('./pages/Movements'));
const MovementDetail = lazy(() => import('./pages/MovementDetail'));
const WorkInProgress = lazy(() => import('./pages/WorkInProgress'));
const Offcuts = lazy(() => import('./pages/Offcuts'));
const CustomerReturns = lazy(() => import('./pages/CustomerReturns'));
const Batches = lazy(() => import('./pages/Batches'));
const BatchDetail = lazy(() => import('./pages/BatchDetail'));
const StockingAreas = lazy(() => import('./pages/StockingAreas'));
const StockingAreaDetail = lazy(() => import('./pages/StockingAreaDetail'));
// Standard drawings (init.sql §69): the list and one standard share a file.
const StandardDrawings = lazy(() => import('./pages/StandardDrawings'));
const StandardDrawingDetail = lazy(() => import('./pages/StandardDrawings').then((m) => ({ default: m.StandardDrawingDetail })));
// In-app help (TM/CF_ERP_HELP_SPEC.md): the full manual, by role and by area; ?role= prints a role's manual.
const Help = lazy(() => import('./pages/Help'));

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
  /** The old purchase board's address (§71: the board went) lands on the material requests. */
  function ToMaterialRequests() {
    const { company } = useParams<{ company: string }>();
    return <Navigate to={`/${company}/cf_erp/material-requests`} replace />;
  }

  return [
    { path: '/:company/cf_erp', element: <ToHome /> },
    { path: '/:company/cf_erp/dashboard', element: <ToHome /> },
    { path: '/:company/cf_erp/home', element: wrap(<Home />) },
    { path: '/:company/cf_erp/help', element: wrap(<Help />) },
    { path: '/:company/cf_erp/orders', element: wrap(<Orders />) },
    { path: '/:company/cf_erp/orders/:id', element: wrap(<OrderDetail />) },
    { path: '/:company/cf_erp/orders-board', element: wrap(<OrdersBoard />) },
    { path: '/:company/cf_erp/approvals', element: wrap(<Approvals />) },
    { path: '/:company/cf_erp/management-overview', element: wrap(<ManagementOverview />) },
    { path: '/:company/cf_erp/term-templates', element: wrap(<TermTemplates />) },
    { path: '/:company/cf_erp/billing', element: wrap(<Billing />) },
    { path: '/:company/cf_erp/receipts', element: wrap(<Receipts />) },
    { path: '/:company/cf_erp/order-costing', element: wrap(<OrderCosting />) },
    { path: '/:company/cf_erp/contractor-work-orders', element: wrap(<ContractorWorkOrders />) },
    { path: '/:company/cf_erp/contractor-work-orders/:id', element: wrap(<ContractorWorkOrderDetail />) },
    { path: '/:company/cf_erp/invoices', element: wrap(<Invoices />) },
    { path: '/:company/cf_erp/invoices/:id', element: wrap(<InvoiceDetail />) },
    { path: '/:company/cf_erp/company-tax', element: wrap(<CompanyTax />) },
    { path: '/:company/cf_erp/customers', element: wrap(<Customers />) },
    { path: '/:company/cf_erp/customers/:partyId', element: wrap(<Customers />) },
    { path: '/:company/cf_erp/contractors', element: wrap(<Customers fixedRole="subcontractor" />) },
    { path: '/:company/cf_erp/suppliers', element: wrap(<Customers fixedRole="supplier" />) },
    { path: '/:company/cf_erp/standard-drawings', element: wrap(<StandardDrawings />) },
    { path: '/:company/cf_erp/standard-drawings/:id', element: wrap(<StandardDrawingDetail />) },
    { path: '/:company/cf_erp/items', element: wrap(<Records recordKind="item" />) },
    { path: '/:company/cf_erp/items/:id', element: wrap(<RecordDetail recordKind="item" />) },
    { path: '/:company/cf_erp/definitions', element: wrap(<Records recordKind="definition" />) },
    { path: '/:company/cf_erp/definitions/:id', element: wrap(<RecordDetail recordKind="definition" />) },
    { path: '/:company/cf_erp/management', element: wrap(<Dashboard />) },
    { path: '/:company/cf_erp/plan', element: wrap(<Plan />) },
    { path: '/:company/cf_erp/planner', element: wrap(<Planner />) },
    { path: '/:company/cf_erp/tracker', element: wrap(<Tracker />) },
    { path: '/:company/cf_erp/floor', element: wrap(<Floor />) },
    { path: '/:company/cf_erp/operators', element: wrap(<Operators />) },
    { path: '/:company/cf_erp/stop-reasons', element: wrap(<StopReasons />) },
    { path: '/:company/cf_erp/machines', element: wrap(<Machines />) },
    { path: '/:company/cf_erp/machines/:id', element: wrap(<MachineDetail />) },
    { path: '/:company/cf_erp/tools', element: wrap(<Tools />) },
    { path: '/:company/cf_erp/maintenance', element: wrap(<MaintenanceBoard />) },
    { path: '/:company/cf_erp/maintenance-orders', element: wrap(<MaintenanceOrders />) },
    { path: '/:company/cf_erp/maintenance-orders/:id', element: wrap(<MaintenanceOrderDetail />) },
    { path: '/:company/cf_erp/maintenance-plans', element: wrap(<MaintenancePlans />) },
    { path: '/:company/cf_erp/planned-downtime', element: wrap(<PlannedDowntime />) },
    { path: '/:company/cf_erp/machine-types/:id', element: wrap(<MachineTypeDetail />) },
    { path: '/:company/cf_erp/operations', element: wrap(<Operations />) },
    { path: '/:company/cf_erp/operations/:id', element: wrap(<OperationDetail />) },
    { path: '/:company/cf_erp/flows', element: wrap(<Flows />) },
    { path: '/:company/cf_erp/flows/:id', element: wrap(<FlowDetail />) },
    // Step 6 (§85): the old list is retired — contractor work orders live in Accounts; older ones stay readable by id.
    { path: '/:company/cf_erp/work-orders', element: <Navigate to="../contractor-work-orders" relative="path" replace /> },
    { path: '/:company/cf_erp/production-orders', element: wrap(<ProductionOrders />) },
    { path: '/:company/cf_erp/production-orders/:id', element: wrap(<ProductionOrderDetail />) },
    { path: '/:company/cf_erp/work-orders/:id', element: wrap(<WorkOrderDetail />) },
    { path: '/:company/cf_erp/stock', element: wrap(<Stock />) },
    { path: '/:company/cf_erp/purchase', element: <ToMaterialRequests /> },
    { path: '/:company/cf_erp/material-requests', element: wrap(<MaterialRequests />) },
    { path: '/:company/cf_erp/material-requests/:id', element: wrap(<MaterialRequestDetail />) },
    { path: '/:company/cf_erp/to-reorder', element: wrap(<ToReorder />) },
    { path: '/:company/cf_erp/purchase-requests', element: wrap(<PurchaseRequests />) },
    { path: '/:company/cf_erp/purchase-requests/:id', element: wrap(<PurchaseRequestDetail />) },
    { path: '/:company/cf_erp/receive', element: wrap(<ReceiveAgainstPo />) },
    { path: '/:company/cf_erp/purchase-orders', element: wrap(<PurchaseOrders />) },
    { path: '/:company/cf_erp/purchase-orders/:id', element: wrap(<PurchaseOrderDetail />) },
    // Not in the menu while the plate-change gate is off (§71); a customer's substitute is still approved here.
    { path: '/:company/cf_erp/plate-changes', element: wrap(<PlateChanges />) },
    { path: '/:company/cf_erp/movements', element: wrap(<Movements />) },
    { path: '/:company/cf_erp/movements/:id', element: wrap(<MovementDetail />) },
    { path: '/:company/cf_erp/wip', element: wrap(<WorkInProgress />) },
    { path: '/:company/cf_erp/offcuts', element: wrap(<Offcuts />) },
    { path: '/:company/cf_erp/customer-returns', element: wrap(<CustomerReturns />) },
    { path: '/:company/cf_erp/batches', element: wrap(<Batches />) },
    { path: '/:company/cf_erp/batches/:id', element: wrap(<BatchDetail />) },
    { path: '/:company/cf_erp/stocking-areas', element: wrap(<StockingAreas />) },
    { path: '/:company/cf_erp/stocking-areas/:id', element: wrap(<StockingAreaDetail />) },
    { path: '/:company/cf_erp/classification', element: wrap(<Classification />) },
    { path: '/:company/cf_erp/specifications', element: wrap(<Specifications />) },
    { path: '/:company/cf_erp/formulas', element: wrap(<Formulas />) },
    { path: '/:company/cf_erp/cutting', element: wrap(<Cutting />) },
    { path: '/:company/cf_erp/coding-rules', element: wrap(<CodingRules />) },
    { path: '/:company/cf_erp/processes', element: wrap(<Processes />) },
    { path: '/:company/cf_erp/processes/:id', element: wrap(<ProcessDetail />) },
  ];
}
