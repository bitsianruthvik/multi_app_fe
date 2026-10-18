import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import BuildRounded from '@mui/icons-material/BuildRounded';
import { getSummary, MAINTENANCE } from '../../api/maintenance';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { appPath } from '../../navMeta';
import { rupeeText } from '../../lib/money';
import { Surface } from '../ui';

/**
 * The management dashboard's MAINTENANCE card (§82): downtime hours this week (faults, maintenance jobs, planned
 * windows) and what maintenance cost — one small read (GET /maintenance/summary). Hidden without the permission.
 */
export function MaintenanceCard() {
  const company = useCompanySlug();
  const can = useIsPermitted();
  const allowed = can(MAINTENANCE) || can('cf_erp_production_view');
  const s = useLoad(() => (allowed ? getSummary() : Promise.resolve(null)), [allowed]);
  if (!allowed || !s.data) return null;
  const d = s.data;
  return (
    <Surface e={1} data-testid="maintenance-card" sx={{ p: 1.5, mb: 2, display: 'flex', gap: 2.5, alignItems: 'center', flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'var(--c-primary-600)' }}><BuildRounded fontSize="small" /><Typography sx={{ fontWeight: 600, color: 'var(--c-text)' }}>Maintenance this week</Typography></Box>
      <Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Downtime</Typography>
        <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600 }} data-testid="mc-hours">{d.downtimeHours} h</Typography>
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>faults {d.faultHours} h · maintenance {d.maintenanceHours} h · planned {d.plannedHours} h</Typography>
      <Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Cost</Typography>
        <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600 }} data-testid="mc-cost">{rupeeText(d.cost)}</Typography>
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box component={Link} to={appPath(company, 'maintenance')} sx={{ fontSize: 13, color: d.machinesDown ? 'var(--c-danger-700)' : 'var(--c-primary-700)', textDecoration: 'none' }}>
        {d.machinesDown ? `${d.machinesDown} machine${d.machinesDown === 1 ? '' : 's'} down · ` : ''}{d.openOrders} open order{d.openOrders === 1 ? '' : 's'} →
      </Box>
    </Surface>
  );
}
