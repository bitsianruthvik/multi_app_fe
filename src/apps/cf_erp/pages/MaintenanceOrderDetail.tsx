import { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { getOrder, setOrderStatus, falseAlarm, cancelOrder, MAINTENANCE, type MaintenanceOrder, type MoStatus } from '../api/maintenance';
import { CfApiError } from '../api/client';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useFullScreen } from '../hooks/useFullScreen';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { Badge, DetailSkeleton, ErrorNotice, Fact, Mono, PageHeader, SectionCard } from '../components/ui';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { PromptDialog } from '../components/PromptDialog';
import { useToast } from '../components/toastContext';
import { CloseOrderDialog, MrFromOrderDialog } from '../components/Maintenance/MaintenanceDialogs';
import { MO_STATUS, NEXT_LABEL, SOURCE_LABEL, costText, durationText, plainKey, whenText } from '../lib/maintenance';
import { FlashOnChange, nudge } from '../motion';

const linkSx = { color: 'var(--c-primary-700)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } };

/**
 * ONE MAINTENANCE ORDER, full screen (§82): what happened, the machine's state, the moves (start, waiting for parts,
 * close, false alarm, cancel), its MRs and its history. Keys: S start, M material request, C close.
 */
export default function MaintenanceOrderDetail() {
  const { id } = useParams();
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()(MAINTENANCE);
  const fs = useFullScreen('maintenance-order');
  const mo = useLoad(() => getOrder(Number(id)), [id]);
  const [closing, setClosing] = useState<MaintenanceOrder | null>(null);
  const [mr, setMr] = useState<MaintenanceOrder | null>(null);
  const [prompt, setPrompt] = useState<'false' | 'cancel' | null>(null);
  const o = mo.data;
  const active = !!o && ['open', 'in_progress', 'waiting_parts'].includes(o.status);
  // Motion: the pressed button (`anchor`) is nudged when the move is refused; the status badge flashes when it changes.
  const move = async (to: MoStatus, anchor?: HTMLElement | null) => {
    try { const r = await setOrderStatus(o!.id, { status: to }); mo.setData(r); toast.success(`${r.code}: ${MO_STATUS[to].label}.`); } catch (e) { nudge(anchor); toast.error((e as CfApiError).message); }
  };
  const keys = useRef<Record<string, () => void>>({});
  keys.current = {
    s: () => { if (canManage && o?.next.includes('in_progress')) void move('in_progress'); },
    m: () => { if (canManage && active) setMr(o); },
    c: () => { if (canManage && active) setClosing(o); },
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (plainKey(e) && keys.current[e.key.toLowerCase()]) { e.preventDefault(); keys.current[e.key.toLowerCase()](); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (mo.error) return <ErrorNotice error={mo.error} onRetry={mo.reload} />;
  if (!o) return <DetailSkeleton />;
  const st = MO_STATUS[o.status];
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0, maxWidth: 1100 }}>
        <PageHeader
          title={<Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="small" startIcon={<ArrowBackRounded />} onClick={() => navigate(appPath(company, 'maintenance-orders'))}>Orders</Button>
            <Mono>{o.code}</Mono> {o.title}
            <FlashOnChange value={o.status}><Badge family={st.family} label={o.falseAlarm ? 'False alarm' : st.label} noIcon /></FlashOnChange>
            {o.machineDown && <Badge family="danger" label={`Machine down ${durationText(o.downtimeMinutes)}`} noIcon />}
          </Box>}
          subtitle={`${SOURCE_LABEL[o.source]} · ${o.machine.code} ${o.machine.name} · raised ${whenText(o.raisedAt)}${o.raisedBy ? ` by ${o.raisedBy}` : ''}`}
          actions={<FullScreenToggle on={fs.on} onToggle={fs.toggle} />} />
        {canManage && active && (
          <Box data-testid="mo-actions" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {o.next.map((to) => (
              <Button key={to} variant={to === 'in_progress' ? 'contained' : 'outlined'} startIcon={to === 'in_progress' ? <PlayArrowRounded /> : undefined} onClick={(e) => move(to, e.currentTarget)} data-testid={`mo-move-${to}`}>
                {NEXT_LABEL[to]}{to === 'in_progress' ? ' (S)' : ''}
              </Button>
            ))}
            <Button variant="outlined" startIcon={<Inventory2Rounded />} onClick={() => setMr(o)} data-testid="mo-mr">Material request (M)</Button>
            <Button variant="contained" color="success" startIcon={<CheckCircleRounded />} onClick={() => setClosing(o)} data-testid="mo-close">Close — machine up (C)</Button>
            <Box sx={{ flex: 1 }} />
            {o.canFalseAlarm && <Button color="warning" onClick={() => setPrompt('false')} data-testid="mo-false-alarm">False alarm</Button>}
            <Button color="error" onClick={() => setPrompt('cancel')}>Cancel</Button>
          </Box>
        )}
        <SectionCard title="What happened">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2, p: 2 }}>
            <Fact label="Machine"><Mono>{o.machine.code}</Mono> {o.machine.name}</Fact>
            <Fact label="Reason">{o.reason ?? (o.plan ? `Plan: ${o.plan.title}` : '—')}</Fact>
            <Fact label="Note">{o.note ?? '—'}</Fact>
            <Fact label="Machine stopped">{o.stop ? `${whenText(o.stop.startedAt)}${o.stop.endedAt ? ` → ${whenText(o.stop.endedAt)}` : ' — still down'}` : 'Not stopped'}</Fact>
            <Fact label="Downtime">{durationText(o.downtimeMinutes)}</Fact>
            <Fact label="Cost">{costText(o, (n) => rupeeText(n, 2))}</Fact>
            {o.workDone && <Fact label="Work done">{o.workDone}</Fact>}
            {o.costNote && <Fact label="Other cost was for">{o.costNote}</Fact>}
            <Fact label="Started">{whenText(o.startedAt)}</Fact>
            <Fact label="Done">{whenText(o.doneAt ?? o.cancelledAt)}</Fact>
          </Box>
        </SectionCard>
        <SectionCard title={`Material requests (${o.requisitions.length})`}>
          <Box sx={{ p: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }} data-testid="mo-mrs">
            {o.requisitions.length ? o.requisitions.map((r) => (
              <Box key={r.id} component={Link} to={appPath(company, `material-requests/${r.id}`)} sx={linkSx}><Mono>{r.code}</Mono></Box>
            )) : <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13.5 }}>None. A material request goes to Stores, then Purchase if it is not in stock.</Typography>}
          </Box>
        </SectionCard>
        <SectionCard title="History">
          <Box sx={{ p: 2, display: 'grid', gap: 0.5 }} data-testid="mo-history">
            {(o.events ?? []).map((e) => (
              <Typography key={e.id} sx={{ fontSize: 13.5 }}>
                <Mono muted>{String(e.at).replace('T', ' ').slice(0, 16)}</Mono> {e.to ? MO_STATUS[e.to as MoStatus]?.label ?? e.to : e.event}{e.note ? ` — ${e.note}` : ''}{e.by ? ` · ${e.by}` : ''}
              </Typography>
            ))}
          </Box>
        </SectionCard>
        <CloseOrderDialog order={closing} onClose={() => setClosing(null)} onDone={(r) => { setClosing(null); toast.success(r.message); mo.setData(r.order); mo.reload(); }} />
        <MrFromOrderDialog order={mr} onClose={() => setMr(null)} onDone={(r) => { setMr(null); toast.success(r.message); mo.reload(); }} />
        <PromptDialog open={prompt === 'false'} title={`${o.code} was a false alarm?`} body="The machine is back up at once and the order is cancelled." label="What was it?" required={false}
          confirmLabel="False alarm" onClose={() => setPrompt(null)}
          onConfirm={async (note) => { const r = await falseAlarm(o.id, note || null); toast.success(r.message); setPrompt(null); mo.setData(r.order); }} />
        <PromptDialog open={prompt === 'cancel'} title={`Cancel ${o.code}?`} body={o.machineDown ? 'The machine is brought back up.' : 'Nothing else changes.'} label="Why is it cancelled?" danger
          confirmLabel="Cancel the order" onClose={() => setPrompt(null)}
          onConfirm={async (note) => { const r = await cancelOrder(o.id, note); setPrompt(null); mo.setData(r.order); }} />
      </Box>
    </FullScreenFrame>
  );
}
