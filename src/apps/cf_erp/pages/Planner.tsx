import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import PushPinRounded from '@mui/icons-material/PushPinRounded';
import PushPinOutlined from '@mui/icons-material/PushPinOutlined';
import FlagRounded from '@mui/icons-material/FlagRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ViewTimelineRounded from '@mui/icons-material/ViewTimelineRounded';
import {
  askRebaseline, getPlan3, putOrderInputs, putPlanMode, savePlan,
  type Plan3, type PlanMode, type PlanOrder, type PlanStep, type PlanType,
} from '../api/planner3';
import { CfApiError } from '../api/client';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { useFullScreen } from '../hooks/useFullScreen';
import { appPath } from '../navMeta';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows, StatStrip } from '../components/ui';
import { HelpButton } from '../help/HelpButton';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { useToast } from '../components/toastContext';
import { rupeeText } from '../lib/money';
import { plainKey } from '../lib/maintenance';
import {
  MODE_WORDS, barOf, dayOrders, dayShort, loadPct, loadTone, minutesText, moveRank, slipText, slowedText, weekday,
} from '../lib/planner3';

/**
 * PRODUCTION › PLANNER — STEP 5 (backend init.sql §84; contract TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Step 5").
 * The user, 2026-10-18: plan per production order ("SO260008 · Span 2 of 3"), step by step; days on screen; capacity per
 * machine type from the shifts minus planned downtime and faults; AUTO ("by AI") or MANUAL (Management's rank and
 * earliest start); baseline, re-baseline with Management's approval; fast, keyboard, full screen.
 *
 * Keys: A automatic · M manual · S save the plan · B ask to re-baseline · R re-plan · 1 by production order ·
 * 2 by machine type · ↑/↓ pick a row · Alt+↑/↓ move its rank (manual) · P pin (automatic) · Enter its steps · F full screen.
 */

const COL = 26;          // px a day
const LABEL_W = 380;

const TONE_BG: Record<string, string> = {
  none: 'transparent', low: 'var(--c-success-100, #dcfce7)', mid: 'var(--c-warning-100, #fef3c7)', full: 'var(--c-warning-300, #fcd34d)', over: 'var(--c-danger-300, #fca5a5)',
};

function DayHeader({ days }: { days: string[] }) {
  return (
    <Box sx={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2, background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
      <Box sx={{ width: LABEL_W, flex: 'none', position: 'sticky', left: 0, background: 'var(--c-surface)', zIndex: 3 }} />
      {days.map((d) => (
        <Box key={d} title={d} sx={{ width: COL, flex: 'none', textAlign: 'center', fontSize: 10.5, lineHeight: 1.2, py: 0.25, color: ['Sat', 'Sun'].includes(weekday(d)) ? 'var(--c-text-3)' : 'var(--c-text-2)', borderLeft: d.endsWith('-01') ? '1px solid var(--c-border-strong, #999)' : '1px solid var(--c-border-subtle, transparent)' }}>
          <div>{Number(d.slice(8, 10))}</div>
          <div>{weekday(d).slice(0, 2)}</div>
        </Box>
      ))}
    </Box>
  );
}

function OrderRow({ o, days, mode, selected, canEdit, onSelect, onInput, onOpen, commitIndex }: {
  o: PlanOrder; days: string[]; mode: PlanMode; selected: boolean; canEdit: boolean; commitIndex: number | null;
  onSelect: () => void; onInput: (patch: { rank?: number | null; earliestStart?: string | null; pinned?: boolean }) => void; onOpen: () => void;
}) {
  const bar = barOf(o.start, o.end, days);
  const base = o.baseline?.end ? barOf(o.baseline.end, o.baseline.end, days) : null;
  const slow = slowedText(o);
  return (
    <Box data-testid="plan-order" data-id={o.id} data-selected={selected ? '1' : '0'} onClick={onSelect} onDoubleClick={onOpen}
      sx={{ display: 'flex', minHeight: 52, borderBottom: '1px solid var(--c-border)', background: selected ? 'var(--c-primary-50)' : 'transparent', cursor: 'pointer' }}>
      <Box sx={{ width: LABEL_W, flex: 'none', position: 'sticky', left: 0, zIndex: 1, background: selected ? 'var(--c-primary-50)' : 'var(--c-surface)', px: 1, py: 0.5, display: 'grid', gap: 0.25, borderRight: '1px solid var(--c-border)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', width: 22, textAlign: 'right' }}>{o.rank}</Typography>
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }} title={o.code}>{o.label}</Typography>
          {o.late && <Badge family="danger" noIcon label="Late" title={`Committed ${dayShort(o.committedDate)}`} />}
          {o.state === 'not_released' && <Badge family="neutral" noIcon label="Yet to plan" title="Release it to plan it." />}
          {mode === 'auto' && canEdit && (
            <Tooltip title={o.manual.pinned ? 'Pinned: keeps its rank (P)' : 'Pin its rank (P)'}>
              <IconButton size="small" data-testid="plan-pin" onClick={(e) => { e.stopPropagation(); onInput({ pinned: !o.manual.pinned }); }}>
                {o.manual.pinned ? <PushPinRounded fontSize="inherit" /> : <PushPinOutlined fontSize="inherit" />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', fontSize: 12, color: 'var(--c-text-2)', flexWrap: 'wrap' }}>
          <span title="Planned end">ends {o.end ? dayShort(o.end) : '—'}</span>
          {o.committedDate && <span>· due {dayShort(o.committedDate)}</span>}
          {o.baseline && <span data-testid="plan-slip">· {slipText(o)}</span>}
          {o.money > 0 && <span>· unlocks {rupeeText(o.money)}</span>}
          {mode === 'manual' && canEdit && (
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
              <TextField size="small" type="number" defaultValue={o.manual.rank ?? ''} key={`r${o.manual.rank}`} inputProps={{ 'aria-label': 'Rank', min: 1, style: { width: 44, padding: '2px 4px', fontSize: 12 }, 'data-testid': 'plan-rank' }}
                onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== o.manual.rank) onInput({ rank: v }); }} />
              <TextField size="small" type="date" defaultValue={o.manual.earliestStart ?? ''} key={`s${o.manual.earliestStart}`} inputProps={{ 'aria-label': 'Earliest start', style: { padding: '2px 4px', fontSize: 12 }, 'data-testid': 'plan-start' }}
                onBlur={(e) => { const v = e.target.value || null; if (v !== o.manual.earliestStart) onInput({ earliestStart: v }); }} />
            </Box>
          )}
        </Box>
        {slow && <Typography data-testid="plan-slowed" noWrap title={o.slowedBy.map((s) => s.text).join('\n')} sx={{ fontSize: 12, color: o.unplanned ? 'var(--c-danger-700)' : 'var(--c-warning-800)' }}>{slow}</Typography>}
      </Box>
      <Box sx={{ position: 'relative', flex: 'none', width: days.length * COL }}>
        {commitIndex != null && <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: (commitIndex + 1) * COL - 1, width: 2, background: 'var(--c-danger-400, #f87171)', opacity: 0.6 }} title={`Committed ${dayShort(o.committedDate)}`} />}
        {base && <Box data-testid="plan-baseline" sx={{ position: 'absolute', top: 6, bottom: 6, left: base.left * COL, width: 2, background: 'var(--c-text-3)' }} title={`Baseline end ${dayShort(o.baseline?.end)}`} />}
        {bar && (
          <Box data-testid="plan-bar" title={`${dayShort(o.start)} → ${dayShort(o.end)} · ${minutesText(o.minutesLeft)} of work left`}
            sx={{ position: 'absolute', top: 16, height: 20, left: bar.left * COL, width: bar.width * COL, borderRadius: '4px', background: o.late ? 'var(--c-danger-500, #ef4444)' : o.state === 'in_production' ? 'var(--c-success-500, #22c55e)' : 'var(--c-primary-500, #3b82f6)', opacity: 0.85 }} />
        )}
      </Box>
    </Box>
  );
}

function TypeRow({ t, days, orders }: { t: PlanType; days: string[]; orders: PlanOrder[] }) {
  return (
    <Box data-testid="plan-type" data-key={t.key} sx={{ display: 'flex', minHeight: 44, borderBottom: '1px solid var(--c-border)' }}>
      <Box sx={{ width: LABEL_W, flex: 'none', position: 'sticky', left: 0, zIndex: 1, background: 'var(--c-surface)', px: 1, py: 0.5, borderRight: '1px solid var(--c-border)', display: 'grid', gap: 0.25 }}>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {t.unlimited ? <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No capacity limit</Typography>
            : t.machines.map((m) => (
              <Box key={m.id} component="span" title={m.down ? 'Down — an open fault' : m.hasShifts ? m.name : 'No shifts'}
                sx={{ fontSize: 11, px: 0.5, borderRadius: '4px', background: m.down ? 'var(--c-danger-100)' : m.hasShifts ? 'var(--c-surface-2, #f3f4f6)' : 'var(--c-warning-100)', color: m.down ? 'var(--c-danger-800)' : 'inherit' }}>
                {m.code}{m.down ? ' · down' : ''}
              </Box>
            ))}
        </Box>
      </Box>
      {days.map((d, i) => {
        const p = loadPct(t, i);
        const tone = loadTone(p);
        const list = dayOrders(t, i, orders);
        const tip = `${dayShort(d)} · ${t.unlimited ? '' : `${minutesText(t.capacity[i])} available · `}${minutesText(t.load[i])} planned${list.length ? `\n${list.slice(0, 6).map((x) => `${x.label} — ${minutesText(x.minutes)}`).join('\n')}` : ''}`;
        return (
          <Box key={d} data-testid="plan-cell" data-tone={tone} title={tip}
            sx={{ width: COL, flex: 'none', background: TONE_BG[tone], borderLeft: '1px solid var(--c-border-subtle, transparent)', fontSize: 10, textAlign: 'center', pt: 1.25, color: 'var(--c-text-2)' }}>
            {p == null ? '' : p === Infinity ? '!' : p > 0 ? p : ''}
          </Box>
        );
      })}
    </Box>
  );
}

function StepsDialog({ order, onClose }: { order: PlanOrder | null; onClose: () => void }) {
  const steps = useLoad(() => (order ? getPlan3({ po: order.id }) : Promise.resolve(null)), [order?.id]);
  const rows: PlanStep[] = steps.data?.steps ?? [];
  return (
    <Dialog open={!!order} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{order?.label} — its steps</DialogTitle>
      <DialogContent dividers>
        <ErrorNotice error={steps.error} onRetry={steps.reload} />
        {steps.loading && !steps.data ? <SkeletonRows rows={5} /> : (
          <Box data-testid="plan-steps" sx={{ display: 'grid', gap: 0.25 }}>
            {rows.map((s) => (
              <Box key={s.id} data-testid="plan-step" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 120px 80px', gap: 1, fontSize: 13, alignItems: 'baseline' }}>
                <Typography noWrap sx={{ fontSize: 13 }} title={s.label}>{s.label}{s.state !== 'pending' ? ` · ${s.state.replace('_', ' ')}` : ''}</Typography>
                <span>{s.start ? `${dayShort(s.start)} ${s.start.slice(11, 16)}` : '—'}</span>
                <span>{s.end ? `${dayShort(s.end)} ${s.end.slice(11, 16)}` : s.why ?? '—'}</span>
                <span>{minutesText(s.minutes)}</span>
              </Box>
            ))}
            {!rows.length && <Typography sx={{ fontSize: 13 }}>No steps — release the production order to plan it.</Typography>}
          </Box>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

export default function Planner() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useIsPermitted();
  const canEdit = can('cf_erp_production_manage');
  const fs = useFullScreen('planner3');
  const [view, setView] = useUrlParam('view', 'orders');
  const [look, setLook] = useState<PlanMode | null>(null);   // a look at the other mode, not stored
  const plan = useLoad(() => getPlan3({ mode: look ?? undefined }), [look]);
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState<PlanOrder | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const p: Plan3 | null = plan.data;
  const orders = useMemo(() => [...(p?.productionOrders ?? [])].sort((a, b) => a.rank - b.rank), [p]);
  const days = p?.days ?? [];
  const mode: PlanMode = p?.mode ?? 'auto';
  const scroller = useRef<HTMLDivElement>(null);

  const fail = (e: unknown) => toast.error(e instanceof CfApiError ? e.message : String(e));
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try { await fn(); if (done) toast.success(done); plan.reload(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const setMode = (m: PlanMode) => { if (!canEdit || m === p?.storedMode) { setLook(null); return; } setLook(null); run(() => putPlanMode(m), m === 'auto' ? 'Automatic — planned by AI.' : 'Manual — planned by Management.'); };
  const save = () => canEdit && run(async () => {
    const r = await savePlan(look ?? undefined);
    toast.success(r.baseline?.first ? `Plan saved — baseline v${r.baseline.version} set.` : `Plan saved (${r.saved.productionOrders} production orders).`);
  });
  const input = (o: PlanOrder, patch: { rank?: number | null; earliestStart?: string | null; pinned?: boolean }) => canEdit && run(() => putOrderInputs([{ id: o.id, ...patch }]));
  const move = (by: -1 | 1) => {
    if (!canEdit || mode !== 'manual' || sel == null) return;
    run(() => putOrderInputs(moveRank(orders, sel, by)));
  };
  const pick = (by: -1 | 1) => {
    if (!orders.length) return;
    const i = orders.findIndex((o) => o.id === sel);
    const j = Math.min(orders.length - 1, Math.max(0, i < 0 ? 0 : i + by));
    setSel(orders[j].id);
  };

  // Keys (not while typing or with a dialog open). Alt+↑/↓ moves a rank — plainKey refuses Alt, so it is read here first.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(e.key === 'ArrowUp' ? -1 : 1); return; }
    if (!plainKey(e)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const map: Record<string, () => void> = {
      a: () => setMode('auto'), m: () => setMode('manual'), s: save, r: plan.reload, b: () => canEdit && setAsking(true),
      1: () => setView('orders'), 2: () => setView('types'), f: fs.toggle,
      ArrowUp: () => pick(-1), ArrowDown: () => pick(1),
      p: () => { const o = orders.find((x) => x.id === sel); if (o && mode === 'auto') input(o, { pinned: !o.manual.pinned }); },
      Enter: () => { const o = orders.find((x) => x.id === sel); if (o) setOpen(o); },
    };
    const fn = map[k];
    if (fn) { e.preventDefault(); fn(); }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const words = MODE_WORDS[mode];
  const commitIndex = (o: PlanOrder) => { const i = o.committedDate ? days.indexOf(o.committedDate) : -1; return i >= 0 ? i : null; };
  const h = p?.health;
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
        <PageHeader title="Planner" help={<HelpButton tab={view} />}
          subtitle={<>Every production order, step by step, on the machines' shifts. <b data-testid="plan-madeby">{look ? `${MODE_WORDS[look].made} (a look — not saved)` : words.made}</b>. <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>A auto · M manual · S save · B re-baseline · R re-plan · 1/2 views · ↑↓ pick · Alt+↑↓ rank · P pin · Enter steps · F full screen</Typography></>}
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tooltip title={words.hint}>
                <ToggleButtonGroup size="small" exclusive value={look ?? mode} onChange={(_, v) => v && setMode(v)} aria-label="Plan mode" data-testid="plan-mode">
                  <ToggleButton value="auto" data-testid="plan-mode-auto">Automatic (AI)</ToggleButton>
                  <ToggleButton value="manual" data-testid="plan-mode-manual">Manual</ToggleButton>
                </ToggleButtonGroup>
              </Tooltip>
              {canEdit && p && <Button size="small" variant="text" onClick={() => setLook(look ? null : (p.storedMode === 'auto' ? 'manual' : 'auto'))} data-testid="plan-look">{look ? 'Back to the stored mode' : `Look at ${p.storedMode === 'auto' ? 'manual' : 'automatic'}`}</Button>}
              <Tooltip title="Work the plan out again (R)"><span><Button size="small" variant="outlined" startIcon={<RefreshRounded />} onClick={plan.reload} disabled={plan.loading}>Re-plan</Button></span></Tooltip>
              {canEdit && <Button size="small" variant="contained" startIcon={<SaveRounded />} onClick={save} disabled={busy || !p} data-testid="plan-save">Save plan</Button>}
              {canEdit && p?.baseline && <Button size="small" variant="outlined" startIcon={<FlagRounded />} onClick={() => setAsking(true)} disabled={busy || !!p.pendingRebaseline} data-testid="plan-rebaseline">Re-baseline…</Button>}
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        <ErrorNotice error={plan.error} onRetry={plan.reload} />
        {p && (
          <StatStrip stats={[
            { label: 'Production orders', value: p.counts.productionOrders, icon: <ViewTimelineRounded /> },
            { label: 'Late against committed', value: p.counts.late, tone: 'danger', icon: <EventRounded /> },
            { label: 'Steps that cannot be planned', value: p.counts.unplanned, tone: 'warning', icon: <WarningAmberRounded />, hint: 'Waiting for material with no date, or no machine time.' },
            ...(h ? [{ label: `On time vs baseline v${p.baseline?.version}`, value: h.onTime, display: h.onTimePct == null ? '—' : `${h.onTimePct}%`, tone: 'success' as const, icon: <FlagRounded />, hint: `${h.late} late, ${h.slipDays} days of slip in all.` }] : []),
          ]} />
        )}
        {p && !p.baseline && canEdit && <Typography data-testid="plan-nobaseline" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No baseline yet — the first saved plan becomes the baseline.</Typography>}
        {p?.pendingRebaseline && <Typography data-testid="plan-pending" sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>Re-baseline v{p.pendingRebaseline.version} waits for Management{p.pendingRebaseline.note ? ` — “${p.pendingRebaseline.note}”` : ''}.</Typography>}
        {p?.saved && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Last saved {String(p.saved.at).replace('T', ' ').slice(0, 16)}{p.saved.mode ? ` (${p.saved.mode === 'auto' ? 'by AI' : 'by Management'})` : ''}.</Typography>}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} aria-label="View">
            <ToggleButton value="orders" data-testid="plan-view-orders">By production order (1)</ToggleButton>
            <ToggleButton value="types" data-testid="plan-view-types">By machine type (2)</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => navigate(appPath(company, 'production-orders'))}>Production orders</Button>
        </Box>
        {plan.loading && !p ? <SkeletonRows rows={8} height={52} /> : p && !orders.length ? (
          <EmptyState icon={<ViewTimelineRounded />} title="Nothing to plan." hint="Create production orders on a sales order's Production step and release them." />
        ) : p && (
          <Box ref={scroller} data-testid="plan-grid" sx={{ overflow: 'auto', maxHeight: fs.on ? 'calc(100vh - 260px)' : 'calc(100vh - 340px)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)' }}>
            <Box sx={{ width: LABEL_W + days.length * COL }}>
              <DayHeader days={days} />
              {view === 'types'
                ? p.machineTypes.map((t) => <TypeRow key={t.key} t={t} days={days} orders={orders} />)
                : orders.map((o) => (
                  <OrderRow key={o.id} o={o} days={days} mode={look ?? mode} selected={sel === o.id} canEdit={canEdit && !look} commitIndex={commitIndex(o)}
                    onSelect={() => setSel(o.id)} onOpen={() => setOpen(o)} onInput={(patch) => input(o, patch)} />
                ))}
            </Box>
          </Box>
        )}
        {p && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Today {dayShort(p.today)}. A bar runs from a production order's first planned step to its last; the grey tick is its baseline end, the red line its committed date. <Mono>{p.counts.steps}</Mono> steps planned in minutes.</Typography>}
        <StepsDialog order={open} onClose={() => setOpen(null)} />
        <Dialog open={asking} onClose={() => setAsking(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Ask Management to re-baseline</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 13.5, mb: 1.5 }}>The saved plan becomes the new baseline once Management approves. Save the plan first if you changed it.</Typography>
            <TextField autoFocus fullWidth multiline minRows={2} label="Why should the baseline move?" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ 'data-testid': 'plan-rebaseline-note' }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button variant="contained" disabled={!note.trim() || busy} data-testid="plan-rebaseline-send"
              onClick={() => { setAsking(false); run(() => askRebaseline(note.trim()), 'Sent to Management for approval.'); setNote(''); }}>Ask Management</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </FullScreenFrame>
  );
}
