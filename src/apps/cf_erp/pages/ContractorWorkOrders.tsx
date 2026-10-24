import { useEffect, useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import EngineeringRounded from '@mui/icons-material/EngineeringRounded';
import { getWorkOrderBoard, type WoCard } from '../api/contractorWorkOrders';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { useFullScreen } from '../hooks/useFullScreen';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { LANE_HELP, tonnesText } from '../lib/contractorWorkOrders';
import { Badge, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader } from '../components/ui';
import { FlashOnChange, Stagger } from '../motion';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

function Card({ w, className, style }: { w: WoCard; className?: string; style?: React.CSSProperties }) {
  const company = useCompanySlug();
  return (
    <Box component={Link} className={className} style={style} to={appPath(company, `contractor-work-orders/${w.id}`)} data-testid="wo-card" data-lane={w.lane}
      sx={{ ...linkSx, display: 'grid', gap: 0.5, p: 1.25, border: `1px solid ${w.sentBack ? 'var(--c-danger-500, #d32f2f)' : 'var(--c-border)'}`, borderRadius: 'var(--r-md)', background: 'var(--c-surface)', minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mono chip>{w.code}</Mono>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{w.order.code}{w.productionOrder ? ` · ${w.productionOrder.code}` : ''}</Typography>
      </Box>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{w.contractor.name}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{rupeeText(w.value)}</Typography>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{tonnesText(w.done)} of {tonnesText(w.tonnes)} done · {rupeeText(w.paid)} paid{w.owed > 0 ? ` · ${rupeeText(w.owed)} owed` : ''}</Typography>
      {w.sentBack && <Typography sx={{ fontSize: 12, color: 'var(--c-danger-700)' }}>{w.sentBack}</Typography>}
      {w.dueDate && <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>Due {w.dueDate}{w.lastPaid ? ` · last paid ${w.lastPaid}` : ''}</Typography>}
    </Box>
  );
}

/**
 * ACCOUNTS › WORK ORDERS (Step 6): every contractor work order in lanes Waiting approval → Issued → In progress →
 * Completed → Paid in full. Cards move by themselves: Management's approval issues one, payments move it on, all done
 * completes it, paying the balance closes it. Work orders are made from a production order (Contractor work).
 */
export default function ContractorWorkOrders() {
  const fs = useFullScreen('accounts-work-orders');
  const [search, setSearch] = useUrlParam('search', '');
  const [typed, setTyped] = useState(search);
  const load = useLoad(() => getWorkOrderBoard({ search: search || undefined }), [search]);
  useEffect(() => { const t = window.setTimeout(() => { if (typed !== search) setSearch(typed); }, 300); return () => window.clearTimeout(t); }, [typed, search, setSearch]);
  const data = load.data;
  const empty = data && data.lanes.every((l) => !l.cards.length);
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <PageHeader title="Work orders" subtitle="Contractor work: raised from a production order, approved by Management, paid week by week."
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" placeholder="Search work orders" value={typed} onChange={(e) => setTyped(e.target.value)} inputProps={{ 'aria-label': 'Search work orders', 'data-testid': 'wo-search' }} />
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        <ErrorNotice error={load.error} onRetry={load.reload} />
        {data && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} data-testid="wo-summary">
            <Badge family={data.counts.waitingApproval ? 'warning' : 'neutral'} noIcon label={`${data.counts.waitingApproval} waiting approval`} />
            <Badge family={data.counts.owed > 0 ? 'warning' : 'neutral'} noIcon label={`${rupeeText(data.counts.owed)} owed to contractors`} />
          </Box>
        )}
        {!data && !load.error && <ListSkeleton rows={4} />}
        {empty && <EmptyState icon={<EngineeringRounded />} title="No contractor work orders yet." body="Open a production order and use “Give work to a contractor”." />}
        {data && !empty && (
          <Box data-testid="wo-board" sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: '80vw', sm: 'minmax(230px, 1fr)' }, gap: 1.25, overflowX: 'auto', pb: 1, minWidth: 0 }}>
            {data.lanes.map((lane) => (
              <Box key={lane.key} data-testid="wo-lane" data-lane={lane.key} sx={{ background: 'var(--c-surface-2)', borderRadius: 'var(--r-md)', p: 1, display: 'grid', alignContent: 'start', gap: 1, minWidth: 0 }}>
                <Box sx={{ px: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-2)' }}>{lane.label}</Typography>
                    <FlashOnChange value={lane.cards.length}><Mono muted>{lane.cards.length} · {rupeeText(lane.value)}</Mono></FlashOnChange>
                  </Box>
                  <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{LANE_HELP[lane.key]}</Typography>
                </Box>
                {/* Motion: cards fade in — on first show, and when a card moves into this lane (it mounts here). */}
                <Stagger variant="fade">{lane.cards.map((w) => <Card key={w.id} w={w} />)}</Stagger>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </FullScreenFrame>
  );
}
