import { useState } from 'react';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { DEPARTMENT_LABEL, SEV_INK, ackAlert, resolveAlert, type Alert } from '../../api/alerts';
import { useCompanySlug } from '../../hooks/useLoad';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { useToast } from '../toastContext';

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/**
 * One alert in one line (user, 2026-11-14: "very succinct and quick to look and work on"): a severity bar, what and
 * where in a few words, who it went to on hover, and the three things to do — Got it (someone has it), Done (dealt
 * with), Open (the screen to deal with it on).
 */
export function AlertRow({ a, onChanged, compact = false }: { a: Alert; onChanged: (a: Alert) => void; compact?: boolean }) {
  const company = useCompanySlug();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (what: 'ack' | 'resolve') => {
    setBusy(true);
    try {
      const r = what === 'ack' ? await ackAlert(a.id) : await resolveAlert(a.id);
      invalidateNavCounts();
      onChanged({ ...a, status: r.status as Alert['status'] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const btn = { minWidth: 0, px: 1, py: 0.1, fontSize: 12, lineHeight: 1.6 };
  return (
    <Box data-testid="alert-row" data-kind={a.kind} sx={{
      display: 'grid', gridTemplateColumns: '4px minmax(0, 1fr) auto', columnGap: 1.25, alignItems: 'center',
      px: 1.25, py: compact ? 0.6 : 0.85, borderBottom: '1px solid var(--c-divider)', opacity: a.status === 'resolved' ? 0.55 : 1,
    }}>
      <Box sx={{ alignSelf: 'stretch', borderRadius: 2, background: SEV_INK[a.severity] }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{a.title}</Typography>
        <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{[a.detail, `To: ${a.departments.map((d) => DEPARTMENT_LABEL[d] ?? d).join(', ')}`].filter(Boolean).join('\n\n')}</Box>} arrow disableInteractive>
          <Typography component="div" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {a.kindLabel}
            {a.status === 'acknowledged' ? ` · ${a.ackedBy ?? 'someone'} has it` : ''}
            {` · ${ago(a.lastAt)}`}
            {!compact && a.detail ? ` · ${a.detail}` : ''}
          </Typography>
        </Tooltip>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {a.status === 'open' && <Button size="small" variant="outlined" disabled={busy} sx={btn} onClick={() => void act('ack')}>Got it</Button>}
        {a.status !== 'resolved' && <Button size="small" disabled={busy} sx={btn} onClick={() => void act('resolve')}>Done</Button>}
        {a.link && <Button size="small" sx={btn} component={Link} to={appPath(company, a.link)}>Open</Button>}
      </Box>
    </Box>
  );
}
