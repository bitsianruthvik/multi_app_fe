/**
 * The Home card of compliance (CF_HRMS_HIRING_SPEC.md §36.4): law changes waiting to be acknowledged
 * and the statutory deadlines due soon (overdue first). Shown to a login with Compliance view.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { SectionCard, ToneBadge } from '@shared/ui';
import { complianceApi } from '../../api/compliance';

type Summary = Awaited<ReturnType<typeof complianceApi.summary>>;
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function ComplianceHomeCard({ to }: { to: (path: string) => string }) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => { complianceApi.summary().then(setS).catch(() => setS(null)); }, []);
  if (!s) return null;
  return (
    <SectionCard
      title="Compliance"
      subtitle={`${s.openNotices} law change${s.openNotices === 1 ? '' : 's'} to acknowledge · ${s.due.length} deadline${s.due.length === 1 ? '' : 's'} soon${s.overdue ? ` · ${s.overdue} overdue` : ''}`}
      actions={<Button component={Link} to={to('compliance')} size="small" endIcon={<ArrowForwardRounded />}>Open</Button>}
    >
      <Box data-testid="home-compliance" sx={{ display: 'grid', gap: 0.75 }}>
        {s.latest.map((n) => (
          <Box key={n.id} component={Link} to={to(`compliance?notice=${n.id}`)} sx={{ color: 'var(--c-text)', textDecoration: 'none', display: 'flex', gap: 1, alignItems: 'center' }}>
            <ToneBadge tone="warning" label="Law change" />
            <Typography noWrap sx={{ fontSize: 13.5 }}>{n.title}</Typography>
          </Box>
        ))}
        {s.due.map((d) => (
          <Box key={d.key} component={Link} to={to('compliance?tab=calendar')} sx={{ color: 'var(--c-text)', textDecoration: 'none', display: 'flex', gap: 1, alignItems: 'center' }}>
            <ToneBadge tone={d.status === 'OVERDUE' ? 'danger' : d.status === 'DUE_SOON' ? 'warning' : 'neutral'} label={day(d.dueDate)} />
            <Typography noWrap sx={{ fontSize: 13.5 }}>{d.title}</Typography>
          </Box>
        ))}
        {!s.latest.length && !s.due.length && <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing waiting, nothing due in the next ten days.</Typography>}
      </Box>
    </SectionCard>
  );
}

export default ComplianceHomeCard;
