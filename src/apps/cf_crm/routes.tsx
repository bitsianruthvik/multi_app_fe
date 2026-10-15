import React, { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { RequireAppAccess } from '@core/components/RequireAppAccess';

const CfCrmFrame = lazy(() => import('./CfCrmFrame'));

/**
 * cf_crm is one full-screen page (CfCrmFrame); the app inside does its own
 * navigation. Every address under /:company/cf_crm opens it, including the
 * platform's shared landing URLs — after sign-in an admin is sent to
 * /admin/dashboard and everyone else to /dashboard, and a literal `cf_crm`
 * segment outranks App.tsx's `:app` routes for those.
 */
export function getCfCrmRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  const page = (
    <ProtectedRoute>
      <RequireAppAccess>
        <Suspense fallback={null}>
          <CfCrmFrame />
        </Suspense>
      </RequireAppAccess>
    </ProtectedRoute>
  );
  return [
    '/:company/cf_crm',
    '/:company/cf_crm/home',
    '/:company/cf_crm/dashboard',
    '/:company/cf_crm/admin/dashboard',
    '/:company/cf_crm/admin/dashboard/*',
    '/:company/cf_crm/:role/dashboard',
    '/:company/cf_crm/profile',
    '/:company/cf_crm/settings',
  ].map((path) => ({ path, element: page }));
}
