import { useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import { InfoButton } from '@shared/ui';
import { DEPARTMENT_LABEL, KIND_LABEL, checkAlertsNow, listAlerts, type Alert, type AlertKind, type Department } from '../api/alerts';
import { useLoad } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows, Surface } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { AlertRow } from '../components/Alerts/AlertRow';
import { useToast } from '../components/toastContext';

const INFO = (
  <Box sx={{ display: 'grid', gap: 1 }}>
    <Typography sx={{ fontSize: 13 }}>Alerts go to the departments that act on them:</Typography>
    <Typography sx={{ fontSize: 13 }}><b>Delivery date moved</b> — Stores, Planning, MD, Purchase. <b>Procurement late</b> — Purchase, Stores, Planning (the MD after 3 days).</Typography>
    <Typography sx={{ fontSize: 13 }}><b>Start late</b> and <b>Finish late</b> — Planning and the shop floor (the MD after a day). <b>Unplanned start</b> — Planning and the MD.</Typography>
    <Typography sx={{ fontSize: 13 }}>Starts and finishes are read against the planner&rsquo;s slots, every 10 minutes. An alert closes by itself when the delay is gone. <b>Got it</b> tells the others someone has it; <b>Done</b> closes it.</Typography>
  </Box>
);

/**
 * Production › Alerts (§110, user 2026-11-14: "filtered alerts and right departments should get the notifications"):
 * the alerts of the person's departments — by kind, by department, grouped by sales order or by operation.
 */
export default function Alerts() {
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canCheck = isPermitted('cf_erp_production_manage|cf_erp_plate_change_approve|cf_erp_approve_month_plan');
  const [status, setStatus] = useUrlParam('status', 'active');
  const [kind, setKind] = useUrlParam('kind', '');
  const [dept, setDept] = useUrlParam('dept', '');
  const [by, setBy] = useUrlParam('by', 'order');
  const [everyone, setEveryone] = useUrlParam('everyone', '');
  const [tick, setTick] = useState(0);
  const list = useLoad(() => listAlerts({ status: status as 'active', department: dept as Department | '', all: everyone === '1' }), [status, dept, everyone, tick]);
  const [patched, setPatched] = useState<Map<number, Alert>>(new Map());
  const rows = useMemo(() => (list.data?.alerts ?? []).map((a) => patched.get(a.id) ?? a).filter((a) => !kind || a.kind === kind), [list.data, patched, kind]);
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; rows: Alert[] }>();
    for (const a of rows) {
      const k = by === 'operation' ? (a.operation ? `op${a.operation.id}` : a.kind.startsWith('po_') ? 'proc' : 'none') : (a.order ? `o${a.order.id}` : a.kind.startsWith('po_') ? 'proc' : 'none');
      const title = by === 'operation' ? (a.operation?.name ?? (k === 'proc' ? 'Procurement' : 'Other')) : (a.order?.code ?? (k === 'proc' ? 'Procurement (not tied to one order)' : 'Other'));
      const g = m.get(k) ?? { title, rows: [] };
      g.rows.push(a); m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.rows.filter((x) => x.severity === 'danger').length - a.rows.filter((x) => x.severity === 'danger').length || b.rows.length - a.rows.length);
  }, [rows, by]);
  const changed = (a: Alert) => setPatched((p) => new Map(p).set(a.id, a));
  const mine = list.data?.departments ?? [];
  const byKind = list.data?.counts.byKind ?? {};
  const runCheck = async () => {
    try { const r = await checkAlertsNow(); toast.success(`Checked — ${r.found} delay${r.found === 1 ? '' : 's'} found.`); setPatched(new Map()); setTick((t) => t + 1); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Box>
      <PageHeader title="Alerts" help={<InfoButton text={INFO} label="Who gets which alert" />}
        subtitle={mine.length ? `For ${mine.map((d) => DEPARTMENT_LABEL[d]).join(', ')}.` : 'You are in no department that gets alerts.'}
        actions={canCheck ? <Button variant="outlined" size="small" onClick={() => void runCheck()}>Check now</Button> : undefined} />
      <FilterBar>
        <FacetChip label="Active" active={status === 'active'} onClick={() => setStatus('active')} />
        <FacetChip label="Not taken" active={status === 'open'} onClick={() => setStatus('open')} />
        <FacetChip label="Closed" active={status === 'resolved'} onClick={() => setStatus('resolved')} />
        <TextField select size="small" label="Kind" value={kind} onChange={(e) => setKind(String(e.target.value))} sx={{ minWidth: 190 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">Every kind</MenuItem>
          {(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => <MenuItem key={k} value={k}>{KIND_LABEL[k]}{byKind[k] ? ` (${byKind[k]})` : ''}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Department" value={dept} onChange={(e) => setDept(String(e.target.value))} sx={{ minWidth: 170 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">{everyone === '1' ? 'Every department' : 'My departments'}</MenuItem>
          {(Object.keys(DEPARTMENT_LABEL) as Department[]).map((d) => <MenuItem key={d} value={d}>{DEPARTMENT_LABEL[d]}</MenuItem>)}
        </TextField>
        <ToggleButtonGroup size="small" exclusive value={by} onChange={(_, v) => v && setBy(v)} sx={{ height: 32 }}>
          <ToggleButton value="order" sx={{ textTransform: 'none', fontSize: 12.5, px: 1.25 }}>By sales order</ToggleButton>
          <ToggleButton value="operation" sx={{ textTransform: 'none', fontSize: 12.5, px: 1.25 }}>By operation</ToggleButton>
        </ToggleButtonGroup>
        {isPermitted('cf_erp_plate_change_approve') && (
          <FacetChip label="Everyone's" active={everyone === '1'} onClick={() => setEveryone(everyone === '1' ? '' : '1')} />
        )}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {!list.data ? <SkeletonRows rows={6} /> : !rows.length ? (
        <EmptyState icon={<NotificationsNoneRounded />} title="Nothing here" hint={status === 'active' ? 'No delay is open for these departments.' : 'Pick another filter.'} />
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {groups.map((g) => (
            <Surface key={g.title} e={1} sx={{ overflow: 'hidden' }}>
              <Box sx={{ px: 1.5, py: 0.75, background: 'var(--c-surface-2)', display: 'flex', alignItems: 'baseline', gap: 1, borderBottom: '1px solid var(--c-divider)' }}>
                <Mono sx={{ fontWeight: 700, fontSize: 13 }}>{g.title}</Mono>
                <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{g.rows.length} alert{g.rows.length === 1 ? '' : 's'}</Typography>
              </Box>
              {g.rows.map((a) => <AlertRow key={a.id} a={a} onChanged={changed} />)}
            </Surface>
          ))}
        </Box>
      )}
    </Box>
  );
}
