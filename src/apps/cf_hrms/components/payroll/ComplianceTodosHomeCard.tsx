/**
 * The Home card of payroll compliance to-dos (CF_HRMS_HIRING_SPEC.md §36.3): open to-dos, those breaking the
 * law, those waiting for the Owner, those past their deadline; the latest few. Counts only — no amounts.
 * Hidden when there is nothing open.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { SectionCard, ToneBadge } from '@shared/ui';
import { complianceChecksApi, SEVERITY_TONE } from '../../api/complianceChecks';

type Summary = Awaited<ReturnType<typeof complianceChecksApi.todoSummary>>;

export function ComplianceTodosHomeCard({ to }: { to: (path: string) => string }) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => { complianceChecksApi.todoSummary().then(setS).catch(() => setS(null)); }, []);
  if (!s || !s.counts.open) return null;
  const c = s.counts;
  return (
    <SectionCard
      title="Compliance to-dos"
      subtitle={`${c.open} to fix${c.hard ? ` · ${c.hard} breaking the law` : ''}${c.waitingApproval ? ` · ${c.waitingApproval} waiting for the Owner` : ''}${c.overdue ? ` · ${c.overdue} past the deadline` : ''}`}
      actions={<Button component={Link} to={to('payroll-compliance')} size="small" endIcon={<ArrowForwardRounded />}>Open</Button>}
    >
      <Box data-testid="home-compliance-todos" sx={{ display: 'grid', gap: 0.75 }}>
        {s.latest.map((t) => (
          <Box key={t.id} component={Link} to={to(`payroll-compliance/${t.id}`)} sx={{ color: 'var(--c-text)', textDecoration: 'none', display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}>
            <ToneBadge tone={t.overdue ? 'danger' : SEVERITY_TONE[t.severity]} label={t.status === 'CHOSEN' ? 'Approve' : t.overdue ? 'Past due' : t.severity === 'HARD' ? 'Law' : t.severity === 'WARN' ? 'Warning' : 'Note'} />
            <Typography noWrap sx={{ fontSize: 13.5 }}>{t.title}{t.peopleCount ? ` (${t.peopleCount})` : ''}</Typography>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}

export default ComplianceTodosHomeCard;
