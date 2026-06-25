import React, { lazy } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { RequireAppAccess } from '@core/components/RequireAppAccess';

const Home              = lazy(() => import('./pages/Home'));
const PlanDashboard     = lazy(() => import('./pages/PlanDashboard'));
const TreeView          = lazy(() => import('./pages/TreeView'));
const NodeDetail        = lazy(() => import('./pages/NodeDetail'));
const ProcessStepEditor = lazy(() => import('./pages/ProcessStepEditor'));
const ExcelUpload       = lazy(() => import('./pages/ExcelUpload'));
const PlanReview        = lazy(() => import('./pages/PlanReview'));
const CapacityMaster    = lazy(() => import('./pages/CapacityMaster'));
const PlanSchedule      = lazy(() => import('./pages/PlanSchedule'));
const DailyProgress     = lazy(() => import('./pages/DailyProgress'));

export function getFabFlowRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  const wrap = (el: React.ReactElement) => (
    <ProtectedRoute><RequireAppAccess>{el}</RequireAppAccess></ProtectedRoute>
  );

  function FabFlowDashboardRedirect() {
    const { company } = useParams<{ company: string }>();
    return <Navigate to={`/${company}/fab_flow/plans`} replace />;
  }

  return [
    { path: '/:company/fab_flow/dashboard',                                    element: <FabFlowDashboardRedirect /> },
    { path: '/:company/fab_flow/plans',                                        element: wrap(<Home />) },
    { path: '/:company/fab_flow/plans/:planId',                                element: wrap(<PlanDashboard />) },
    { path: '/:company/fab_flow/plans/:planId/tree',                           element: wrap(<TreeView />) },
    { path: '/:company/fab_flow/plans/:planId/nodes/:nodeId',                  element: wrap(<NodeDetail />) },
    { path: '/:company/fab_flow/plans/:planId/process-steps',                  element: wrap(<ProcessStepEditor />) },
    { path: '/:company/fab_flow/plans/:planId/excel-upload',                   element: wrap(<ExcelUpload />) },
    { path: '/:company/fab_flow/plans/:planId/review',                         element: wrap(<PlanReview />) },
    { path: '/:company/fab_flow/capacity',                                      element: wrap(<CapacityMaster />) },
    { path: '/:company/fab_flow/plans/:planId/schedule',                        element: wrap(<PlanSchedule />) },
    { path: '/:company/fab_flow/plans/:planId/progress',                        element: wrap(<DailyProgress />) },
  ];
}
