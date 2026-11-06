import React, { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { RequireAppAccess } from '@core/components/RequireAppAccess';
import { ConnectionsShell, ToList } from './components/ConnectionsShell';

const Connections = lazy(() => import('./pages/Connections'));

/**
 * connections routes. **Paths must match navMeta.ts.** The platform's landing URLs
 * go to the list; a literal `connections` segment outranks App.tsx's `:app` routes.
 */
export function getConnectionsRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  const landing = ['', 'home', 'dashboard', 'admin/dashboard', 'admin/dashboard/*', ':role/dashboard'];
  return [
    {
      path: '/:company/connections/list',
      element: (
        <ProtectedRoute>
          <RequireAppAccess>
            <ConnectionsShell>
              <Suspense fallback={null}><Connections /></Suspense>
            </ConnectionsShell>
          </RequireAppAccess>
        </ProtectedRoute>
      ),
    },
    ...landing.map((p) => ({
      path: `/:company/connections${p ? `/${p}` : ''}`,
      element: <ProtectedRoute><ToList /></ProtectedRoute>,
    })),
  ];
}
