import React, { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { FlowProvider } from './contexts/FlowContext';
import { RequireAppAccess } from '@core/components/RequireAppAccess';

const BrandPicker = lazy(() => import('./pages/user/BrandPicker'));
const RecordingsInContext = lazy(() => import('./pages/user/RecordingsInContext'));
const AudioReview = lazy(() => import('./pages/user/AudioReview'));
const AnalysisDetail = lazy(() => import('./pages/user/AnalysisDetail'));
const MyProgress = lazy(() => import('./pages/user/MyProgress'));

export function getAudioRoutes(ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>): RouteObject[] {
  return [
    {
      path: '/:company/audio_intelligence/flow/:actionId',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><BrandPicker /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/audio_intelligence/flow/:actionId/:brandName',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><RecordingsInContext /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/audio_intelligence/flow/:actionId/:brandName/recording/:recordingId',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><AudioReview /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/audio_intelligence/flow/:actionId/:brandName/recording/:recordingId/analysis',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><AnalysisDetail /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/audio_intelligence/flow/:actionId/performance',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><MyProgress /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
    {
      path: '/:company/audio_intelligence/flow/:actionId/:brandName/performance',
      element: <ProtectedRoute><RequireAppAccess><FlowProvider><MyProgress /></FlowProvider></RequireAppAccess></ProtectedRoute>,
    },
  ];
}
