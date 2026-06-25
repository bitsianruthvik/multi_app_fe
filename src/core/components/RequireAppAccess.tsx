import { useAuth } from '@core/contexts/AuthContext';
import { useLocation, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';

interface Props { children: ReactNode; }

// Reads app slug from URL position 1 (/:company/:appSlug/...).
// Works for dynamic routes AND hardcoded slugs like /audio_intelligence/flow/*.
export function RequireAppAccess({ children }: Props) {
  const { user } = useAuth();
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const appSlug = parts[1];

  const appRoles = user?.appRoles;
  if (appRoles && appSlug && !appRoles[appSlug]) {
    return <Navigate to={`/${company}/apps`} replace />;
  }

  return <>{children}</>;
}
