import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@core/contexts/AuthContext';
import { getApp } from '@apps/index';
import { Box, Typography } from '@mui/material';
import { isAdminRole } from '@core/utils/roles';

export default function UserDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const company = parts[0];
  const appSlug = parts[1];

  // Redirect company-level admins who land on user dashboard
  if (isAdminRole(user?.role) && !location.pathname.includes('/admin/')) {
    return <Navigate to={`/${company}/${appSlug}/admin/dashboard`} replace />;
  }

  const appDef = getApp(appSlug);

  // workflow_fab: no dashboard concept, redirect to board
  if (appSlug === 'workflow_fab') {
    return <Navigate to={`/${company}/${appSlug}/user/board`} replace />;
  }

  if (!appDef?.Dashboard) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          App not configured. Contact your administrator.
        </Typography>
      </Box>
    );
  }

  const Dashboard = appDef.Dashboard;
  return <Dashboard />;
}
