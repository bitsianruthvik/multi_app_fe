import React, { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { FlowProvider } from '@apps/audio_intelligence/contexts/FlowContext';
import { RequireAppAccess } from '@core/components/RequireAppAccess';

const BrandPicker        = lazy(() => import('@apps/audio_intelligence/pages/user/BrandPicker'));
const RecordingsInContext = lazy(() => import('@apps/audio_intelligence/pages/user/RecordingsInContext'));
const AudioReview        = lazy(() => import('@apps/audio_intelligence/pages/user/AudioReview'));
const AnalysisDetail     = lazy(() => import('@apps/audio_intelligence/pages/user/AnalysisDetail'));
const MyProgress         = lazy(() => import('@apps/audio_intelligence/pages/user/MyProgress'));
const ManagerDashboard   = lazy(() => import('./pages/manager/ManagerDashboard'));
const ManagerRecordingView = lazy(() => import('./pages/manager/ManagerRecordingView'));

export function getSalesControlRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  return [
    {
      path: '/:company/sales_control/manager/dashboard',
      element: <ProtectedRoute><RequireAppAccess><ManagerDashboard /></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/sales_control/manager/recording/:recordingId',
      element: <ProtectedRoute><RequireAppAccess><ManagerRecordingView /></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/sales_control/flow/:actionId',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><BrandPicker /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/sales_control/flow/:actionId/:brandName',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><RecordingsInContext /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/sales_control/flow/:actionId/:brandName/recording/:recordingId',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><AudioReview /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/sales_control/flow/:actionId/:brandName/recording/:recordingId/analysis',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><AnalysisDetail /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/sales_control/flow/:actionId/performance',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><MyProgress /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/sales_control/flow/:actionId/:brandName/performance',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><MyProgress /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
  ];
}
