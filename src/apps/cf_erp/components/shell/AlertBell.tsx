import { useState } from 'react';
import { Badge, Box, Button, CircularProgress, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import { Link } from 'react-router-dom';
import { SEV_INK, ackAlert, listAlerts, type Alert } from '../../api/alerts';
import { useNavCounts } from '../../hooks/useNavCounts';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';

/**
 * THE BELL (§110, user 2026-11-14: "the right departments should get the notifications"): how many open alerts reach
 * this person's departments, and the newest of them in one click — each with "Got it" (acknowledge) and a link to
 * where it is dealt with. The full list, filters and grouping are on Alerts.
 */

export function AlertBell() {
  const company = useCompanySlug();
  const { counts, refresh } = useNavCounts();
  const n = Number((counts as Record<string, number>).alerts ?? 0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [rows, setRows] = useState<Alert[] | null>(null);
  const open = async (el: HTMLElement) => {
    setAnchor(el); setRows(null);
    try { setRows((await listAlerts({ status: 'open' })).alerts.slice(0, 12)); } catch { setRows([]); }
  };
  const ack = async (a: Alert) => {
    try { await ackAlert(a.id); setRows((r) => (r ?? []).filter((x) => x.id !== a.id)); refresh(); } catch { /* the list shows it still */ }
  };
  return (
    <>
      <Tooltip title={n ? `${n} open alert${n === 1 ? '' : 's'} for you` : 'Alerts'}>
        <IconButton size="small" aria-label="Alerts" data-testid="alert-bell" onClick={(e) => void open(e.currentTarget)} sx={{ color: 'var(--c-text-2)', flexShrink: 0 }}>
          <Badge badgeContent={n} color="error" max={99} overlap="circular"><NotificationsNoneRounded fontSize="small" /></Badge>
        </IconButton>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 420, maxWidth: 'calc(100vw - 24px)', borderRadius: 'var(--r-md)' } } }}>
        <Box sx={{ px: 1.75, py: 1.25, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--c-divider)' }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14, flex: '1 1 auto' }}>Alerts for you</Typography>
          <Button size="small" component={Link} to={appPath(company, 'alerts')} onClick={() => setAnchor(null)}>See all</Button>
        </Box>
        <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
          {rows == null ? <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress size={18} /></Box>
            : !rows.length ? <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-3)' }}>Nothing open for your departments.</Typography>
              : rows.map((a) => (
                <Box key={a.id} data-testid="bell-alert" sx={{ display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: 1.25, px: 1.5, py: 1, borderBottom: '1px solid var(--c-divider)' }}>
                  <Box sx={{ borderRadius: 2, background: SEV_INK[a.severity] }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{a.kindLabel}{a.order ? ` · ${a.order.code}` : ''}</Typography>
                    <Typography sx={{ fontSize: 13, lineHeight: 1.35 }}>{a.title}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end' }}>
                    <Button size="small" variant="outlined" sx={{ minWidth: 0, px: 1, py: 0, fontSize: 12 }} onClick={() => void ack(a)}>Got it</Button>
                    {a.link && <Button size="small" sx={{ minWidth: 0, px: 1, py: 0, fontSize: 12 }} component={Link} to={appPath(company, a.link)} onClick={() => setAnchor(null)}>Open</Button>}
                  </Box>
                </Box>
              ))}
        </Box>
      </Popover>
    </>
  );
}
