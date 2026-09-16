/**
 * OrderProductionPlan — the production step: buy, cut, make.
 *
 * Three pieces, top to bottom, because they are three answers to one question —
 * how does this order get built:
 *
 *   Buy          each bought item against the shelf. Take what you want from
 *                stock for this order; the rest goes on one purchase request.
 *   Cutting      the production order that cuts plate into blanks.
 *   Fabrication  the production order that makes everything else.
 *
 * A PRODUCTION ORDER IS SHOWN AS ITS BOM. The table on the left is the BOM,
 * row for row, in BOM order. Beside each row runs its flow, one box per step,
 * like carriages behind an engine: the operation, and the time worked out for
 * one piece. Click a time to type over it; it applies to every piece on that
 * row. This replaced a diagram that showed the same steps and let nobody change
 * anything.
 *
 * The order is raised as a DRAFT — times can still change and the tasks follow
 * — and DEPLOYED to the shop with a button on the order. Deploying writes the
 * codes: each BOM row's, and each task's (row code + step + operation), all from
 * the code generator's rules.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, MenuItem, Stack, TextField,
  Tooltip, Typography,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import NoteAddRounded from '@mui/icons-material/NoteAddRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';

import {
  getProductionPlan, setStepTime, raiseDraft, deployProductionOrder,
  requestProcurement, sendPurchaseRequest, requestSubcontract,
  type ProductionPlan, type PlanSection, type PlanRow, type PlanStep, type BuyLine,
  type FieldsMissingDetail, type SubcontractGroup,
} from '../api/productionPlan';
import type { OrderReadiness } from '../api/readiness';
import { backendMessage, ConfirmDialog, Mono, useToast, ListSkeleton } from '../components';
import { statusLabel, chipColorForStatus } from '../statusMap';
import { codeRangeLabel } from '../utils/codeRange';

// ── formatting ──────────────────────────────────────────────────────────────

/** Per-piece times read best in minutes; anything over an hour in h + m. */
const perPiece = (m: number | null) => {
  if (m == null) return '—';
  if (m < 59.5) return `${m < 10 ? m.toFixed(1) : Math.round(m)} min`;
  // Round the whole first, or 119.7 min reads "1 h 60 m".
  const whole = Math.round(m);
  const h = Math.floor(whole / 60);
  const r = whole - h * 60;
  return r ? `${h} h ${r} m` : `${h} h`;
};
/** The same, compact enough for a step box: 12m, 1h 45m. The tooltip keeps the long form. */
const shortTime = (m: number | null) => {
  if (m == null) return '—';
  if (m < 59.5) return `${m < 10 ? m.toFixed(1) : Math.round(m)}m`;
  const whole = Math.round(m);
  const h = Math.floor(whole / 60);
  const r = whole - h * 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};
/**
 * What every code in a section starts with, cut at a dash — shown once in the
 * header instead of on every row. `KLPT-SO-20260910-0066-` on 82 rows was most
 * of what the column said.
 */
const commonPrefix = (codes: (string | null)[]) => {
  const list = codes.filter((c): c is string => !!c);
  if (list.length < 2) return '';
  let pre = list[0];
  for (const c of list) { while (!c.startsWith(pre)) pre = pre.slice(0, -1); }
  const cut = pre.lastIndexOf('-');
  return cut > 0 ? pre.slice(0, cut + 1) : '';
};
const hours = (m: number) => `${Math.round(m / 60).toLocaleString()} h`;
const qty = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// ── the screen ──────────────────────────────────────────────────────────────

export default function OrderProductionPlan({
  orderId, canManage, onChanged, isEstimate, orderStatus, onGoToParams,
}: {
  orderId: number | string;
  canManage: boolean;
  /** Fired after any write, with the readiness the write returned when the endpoint sends one. */
  onChanged?: (readiness?: OrderReadiness) => void;
  /** A quote's Production step (EU-13): the figures are real, but nothing here can be raised or bought. */
  isEstimate?: boolean;
  /** The SALES order's own status (not a production order's) — gates the "Re-deploy after revision" action. */
  orderStatus?: string;
  /** Jump the wizard to the Parameters step — used by the raise-draft FIELDS_MISSING error. */
  onGoToParams?: () => void;
}) {
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setPlan(await getProductionPlan(orderId));
      setError('');
    } catch (e) {
      setError(backendMessage(e, 'Could not read the production plan.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  // Every write below returns the wizard's own readiness now (REPAIR-E) —
  // passed straight through so `onChanged` can skip its own re-fetch.
  const reload = useCallback(async (readiness?: OrderReadiness) => { await load(); onChanged?.(readiness); }, [load, onChanged]);

  /** A time changed: update in place rather than re-reading the whole order. */
  const patchStep = useCallback((key: 'cutting' | 'fabrication', rowId: number, stepId: number, min: number | null) => {
    setPlan((p) => {
      if (!p) return p;
      const section = p[key];
      const rows = section.rows.map((r) => {
        if (r.id !== rowId) return r;
        const steps = r.steps.map((s) => {
          if (s.stepId !== stepId) return s;
          const minutes = min ?? s.formulaMinutes;
          return {
            ...s, overrideMinutes: min, minutes,
            totalMinutes: Math.round((s.setupMinutes ?? 0) + (minutes ?? 0) * r.totalQty),
          };
        });
        return { ...r, steps, totalMinutes: steps.reduce((n, s) => n + s.totalMinutes, 0) };
      });
      return { ...p, [key]: { ...section, rows, totalMinutes: rows.reduce((n, r) => n + r.totalMinutes, 0) } };
    });
  }, []);

  if (loading) {
    // §5.7-5: the shape of the three sections to come, not a spinner.
    return (
      <Stack spacing={2}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Working out every step…</Typography>
        <ListSkeleton rows={3} />
        <ListSkeleton rows={5} />
      </Stack>
    );
  }
  if (!plan) return <Alert severity="error">{error || 'Nothing to show.'}</Alert>;

  const canAct = canManage && !isEstimate;
  // Nesting readiness isn't visible here (it lives on a different wizard step)
  // — the plan itself already says which it is: zero rows because nothing on
  // the order is a blank at all, or zero rows despite blanks existing because
  // none of them have a plate yet.
  const hasBlanks = plan.buy.lines.some((l) => l.procurementType === 'make')
    || plan.cutting.rows.length > 0;

  return (
    <Stack spacing={2.5}>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      {isEstimate && (
        <Alert severity="info">
          This is a quote — these figures are an estimate. Nothing can be raised, bought or
          deployed until it is converted to a sales order.
        </Alert>
      )}

      <BuySection orderId={orderId} plan={plan} canManage={canAct} onDone={reload} onError={setError} />

      <SubcontractSection orderId={orderId} groups={plan.subcontract.groups} suppliers={plan.buy.suppliers} canManage={canAct} onDone={reload} onError={setError} />

      <ProductionSection
        title="Cutting" hint="Plate into blanks" orderNumber={plan.orderNumber}
        purpose="cutting" orderId={orderId} section={plan.cutting} canManage={canAct}
        onReload={reload} onChanged={onChanged} onError={setError} hasBlanks={hasBlanks} orderStatus={orderStatus}
        onGoToParams={onGoToParams}
        onStep={(rowId, stepId, m) => patchStep('cutting', rowId, stepId, m)}
      />

      <ProductionSection
        title="Fabrication" hint="Parts, assemblies and finishing" orderNumber={plan.orderNumber}
        purpose="fabrication" orderId={orderId} section={plan.fabrication} canManage={canAct}
        onReload={reload} onChanged={onChanged} onError={setError} hasBlanks orderStatus={orderStatus}
        onGoToParams={onGoToParams}
        onStep={(rowId, stepId, m) => patchStep('fabrication', rowId, stepId, m)}
      />
    </Stack>
  );
}

// ── shared section frame ────────────────────────────────────────────────────

/**
 * Each section folds away, because the three answer different questions and
 * you are usually working on one: the fabrication table alone is 82 rows, and
 * scrolling past it to reach the buying half is the whole navigation problem.
 *
 * What it is folded or open is remembered per order, so coming back lands
 * where you left it.
 */
function SectionHead({ title, hint, children, right, open, onToggle }: {
  title: string; hint: string; children?: React.ReactNode; right?: React.ReactNode;
  open: boolean; onToggle: () => void;
}) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
      px: 1.25, py: 1.25, borderBottom: open ? '1px solid var(--c-divider)' : undefined,
      background: 'var(--c-surface-2)',
    }}>
      <Tooltip title={open ? 'Fold this away' : 'Open this'}>
        <IconButton size="small" onClick={onToggle} aria-label={open ? `Collapse ${title}` : `Expand ${title}`}>
          {open ? <ExpandLessRounded sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Tooltip>
      <Box
        role="button" tabIndex={0} onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        sx={{ minWidth: 0, cursor: 'pointer' }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{hint}</Typography>
      </Box>
      {children}
      <Box sx={{ flex: 1 }} />
      {right}
    </Box>
  );
}

/** Folded or open, per order, kept across visits. */
function useFolded(orderId: number | string, key: string) {
  const store = `fab_erp_prod_section_${orderId}_${key}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(store) !== 'closed'; } catch { return true; }
  });
  const toggle = useCallback(() => setOpen((v) => {
    try { localStorage.setItem(store, v ? 'closed' : 'open'); } catch { /* private window */ }
    return !v;
  }), [store]);
  return [open, toggle] as const;
}

const frame = {
  border: '1px solid var(--c-border)', borderRadius: 'var(--r-md, 10px)',
  background: 'var(--c-surface)', overflow: 'hidden',
};

// ── BUY ─────────────────────────────────────────────────────────────────────

function BuySection({ orderId, plan, canManage, onDone, onError }: {
  orderId: number | string; plan: ProductionPlan; canManage: boolean;
  onDone: (readiness?: OrderReadiness) => Promise<void>; onError: (m: string) => void;
}) {
  const { toast } = useToast();
  const { purchases, suppliers, unmatched } = plan.buy;
  // Free-issue material is supplied BY the customer — this order never buys
  // it, whatever the shelf holds (EU-14). Rendered as its own read-only list
  // rather than mixed into the interactive table with a Take box that would
  // do nothing (its `inStock` is null and `stillNeeded`/`suggestedTake` are
  // always 0).
  const lines = useMemo(() => plan.buy.lines.filter((l) => l.procurementType !== 'free_issue'), [plan.buy.lines]);
  const freeIssueLines = useMemo(() => plan.buy.lines.filter((l) => l.procurementType === 'free_issue'), [plan.buy.lines]);

  /**
   * How much to take off the shelf, per item — the server's own suggestion
   * (EU-9's `suggestedTake`: what this order already holds, else all that is
   * free), not re-derived here.
   */
  const [take, setTake] = useState<Record<number, string>>({});
  useEffect(() => {
    setTake(Object.fromEntries(lines.map((l) => [l.catalogItemId, String(l.suggestedTake)])));
  }, [lines]);
  const takeOf = (l: BuyLine) => Math.min(Math.max(0, Number(take[l.catalogItemId]) || 0), l.inStock ?? 0, l.required);
  const toBuy = (l: BuyLine) => Math.max(0, l.required - takeOf(l) - l.onOrder);

  const [busy, setBusy] = useState(false);
  const [sendTo, setSendTo] = useState<Record<number, number | ''>>({});
  const openRequest = purchases.find((p) => p.status === 'requested');
  const anythingToBuy = lines.some((l) => toBuy(l) > 0);

  async function submit() {
    setBusy(true);
    try {
      const res = await requestProcurement(orderId, lines.map((l) => ({ catalogItemId: l.catalogItemId, take: takeOf(l) })));
      toast(anythingToBuy ? 'Stock held and the rest requested' : 'Stock held for this order', 'success');
      await onDone(res.readiness);
    } catch (e) {
      onError(backendMessage(e, 'Could not request the material.'));
    } finally { setBusy(false); }
  }

  async function send(poId: number) {
    const sup = sendTo[poId];
    if (!sup) return;
    try {
      const res = await sendPurchaseRequest(poId, Number(sup));
      toast('Sent to the supplier', 'success');
      await onDone(res.readiness);
    } catch (e) { onError(backendMessage(e, 'Could not send the request.')); }
  }

  const [open, toggleOpen] = useFolded(orderId, 'buy');
  const cell = { fontSize: 12.5, px: 1.25, py: 0.75, borderBottom: '1px solid var(--c-divider)', whiteSpace: 'nowrap' } as const;
  const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;
  const head = { ...cell, fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.04em' } as const;

  return (
    <Box sx={frame}>
      <SectionHead
        title="Buy" hint="Take from stock for this order, request the rest"
        open={open} onToggle={toggleOpen}
        right={canManage && open && lines.length > 0 && (
          <Button size="small" variant="contained" disabled={busy} onClick={() => void submit()}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
            {anythingToBuy ? (openRequest ? 'Hold stock and update the request' : 'Hold stock and request the rest') : 'Hold stock'}
          </Button>
        )}
      >
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {lines.length} item{lines.length === 1 ? '' : 's'}
          {lines.length > 0 && ` · ${lines.filter((l) => l.stillNeeded === 0).length} covered`}
        </Typography>
      </SectionHead>

      {!open ? null : lines.length === 0 ? (
        <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-2)' }}>Nothing on this order is bought in.</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <Box component="th" sx={{ ...head, textAlign: 'left', position: 'sticky', top: 0, background: 'var(--c-surface)' }}>Item</Box>
                {['Needed', 'In stock', 'Take for this order', 'On order', 'To buy'].map((h) => (
                  <Box component="th" key={h} sx={{ ...head, textAlign: 'right', position: 'sticky', top: 0, background: 'var(--c-surface)' }}>{h}</Box>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.catalogItemId}>
                  <Box component="td" sx={{ ...cell, whiteSpace: 'normal', minWidth: 240 }}>
                    <Typography sx={{ fontSize: 12.5 }}>{l.name ?? '—'}</Typography>
                    <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', fontFamily: 'monospace' }}>{l.code}</Typography>
                  </Box>
                  <Box component="td" sx={num}>{qty(l.required)} <Unit u={l.unit} /></Box>
                  <Box component="td" sx={{ ...num, color: (l.inStock ?? 0) > 0 ? 'inherit' : 'var(--c-text-3)' }}>{qty(l.inStock ?? 0)}</Box>
                  <Box component="td" sx={num}>
                    <TextField
                      size="small" type="number" value={take[l.catalogItemId] ?? ''}
                      disabled={!canManage || (l.inStock ?? 0) <= 0}
                      onChange={(e) => setTake((t) => ({ ...t, [l.catalogItemId]: e.target.value }))}
                      inputProps={{ min: 0, max: Math.min(l.inStock ?? 0, l.required), style: { textAlign: 'right', fontSize: 12.5, padding: '4px 8px' } }}
                      sx={{ width: 110 }}
                    />
                  </Box>
                  <Box component="td" sx={{ ...num, color: l.onOrder > 0 ? 'inherit' : 'var(--c-text-3)' }}>{qty(l.onOrder)}</Box>
                  <Box component="td" sx={{ ...num, fontWeight: 600, color: toBuy(l) > 0 ? 'var(--c-warning-600)' : 'var(--c-success-600)' }}>
                    {toBuy(l) > 0 ? qty(toBuy(l)) : '✓'}
                  </Box>
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      )}

      {open && freeIssueLines.length > 0 && (
        <Box sx={{ borderTop: '1px solid var(--c-divider)', p: 1.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.04em', mb: 1 }}>
            Supplied by customer
          </Typography>
          <Stack spacing={0.5}>
            {freeIssueLines.map((l) => (
              <Stack key={l.catalogItemId} direction="row" spacing={1} alignItems="baseline">
                <Typography sx={{ fontSize: 12.5 }}>{l.name ?? l.code ?? '—'}</Typography>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {qty(l.required)} <Unit u={l.unit} /> — free issue, not on this order's buy list
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {open && unmatched.length > 0 && (
        <Alert severity="warning" sx={{ m: 1.5 }}>
          {unmatched.length} bought-in row(s) name no catalog item, so they cannot be checked against stock or requested:
          {' '}{unmatched.map((u) => u.name).filter(Boolean).join(', ')}
        </Alert>
      )}

      {open && purchases.length > 0 && (
        <Box sx={{ borderTop: '1px solid var(--c-divider)', p: 1.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.04em', mb: 1 }}>
            Purchase requests and orders
          </Typography>
          <Stack spacing={0.75}>
            {purchases.map((po) => (
              <Stack key={po.id} direction="row" spacing={1.25} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Mono>{po.orderNumber}</Mono>
                <Chip size="small" label={statusLabel(po.status)} color={chipColorForStatus(po.status)} variant="outlined" />
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                  {po.lineCount} line{po.lineCount === 1 ? '' : 's'}
                  {po.supplierName ? ` · ${po.supplierName}` : ''}
                  {po.qtyReceived > 0 ? ` · ${qty(po.qtyReceived)} of ${qty(po.qtyOrdered)} received` : ''}
                </Typography>
                {po.status === 'requested' && canManage && (<>
                  <Box sx={{ flex: 1 }} />
                  <TextField select size="small" label="Supplier" value={sendTo[po.id] ?? ''} sx={{ minWidth: 200 }}
                    onChange={(e) => setSendTo((s) => ({ ...s, [po.id]: e.target.value === '' ? '' : Number(e.target.value) }))}>
                    <MenuItem value="">— choose —</MenuItem>
                    {suppliers.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </TextField>
                  <Button size="small" disabled={!sendTo[po.id]} onClick={() => void send(po.id)}>Send to supplier</Button>
                </>)}
              </Stack>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

const Unit = ({ u }: { u: string | null }) =>
  (u ? <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11 }}>{u}</Box> : null);

// ── SUBCONTRACT (EU-14 / X2) ─────────────────────────────────────────────────

/**
 * Steps sent, or sendable, to an outside supplier — welding, galvanising,
 * whatever this shop names `is_subcontract` on the operation. Grouped by
 * supplier because that is the unit a real send happens in: one delivery
 * note, one supplier, whatever tasks are ready to go with it.
 */
function SubcontractSection({ orderId, groups, suppliers, canManage, onDone, onError }: {
  orderId: number | string; groups: SubcontractGroup[]; suppliers: { id: number; name: string }[];
  canManage: boolean; onDone: () => Promise<void>; onError: (m: string) => void;
}) {
  const { toast } = useToast();
  const [open, toggleOpen] = useFolded(orderId, 'subcontract');
  const [supplierPick, setSupplierPick] = useState<Record<string, number | ''>>({});
  const [sending, setSending] = useState<string | null>(null);
  const totalSteps = groups.reduce((n, g) => n + g.steps.length, 0);
  if (totalSteps === 0) return null;

  async function send(group: SubcontractGroup, key: string) {
    const supplierId = group.supplierId ?? supplierPick[key];
    if (!supplierId) return;
    const taskIds = group.steps.filter((s) => !s.requested && !s.sentOutAt).map((s) => s.taskId).filter((id): id is number => id != null);
    if (!taskIds.length) return;
    setSending(key);
    try {
      const res = await requestSubcontract(orderId, Number(supplierId), taskIds);
      toast(`${res.order.lineCount} step(s) sent to ${res.order.supplierName ?? 'the supplier'}`, 'success');
      await onDone();
    } catch (e) {
      onError(backendMessage(e, 'Could not send those steps to the supplier.'));
    } finally { setSending(null); }
  }

  return (
    <Box sx={frame}>
      <SectionHead
        title="Subcontract" hint="Steps sent out to a supplier"
        open={open} onToggle={toggleOpen}
      >
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {totalSteps} step{totalSteps === 1 ? '' : 's'} · {groups.length} supplier{groups.length === 1 ? '' : 's'}
        </Typography>
      </SectionHead>
      {open && (
        <Stack spacing={1.5} sx={{ p: 1.5 }}>
          {groups.map((g, i) => {
            const key = String(g.supplierId ?? `none-${i}`);
            const unsent = g.steps.filter((s) => !s.requested && !s.sentOutAt);
            return (
              <Box key={key} sx={{ border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm)', p: 1.25 }}>
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexWrap: 'wrap', mb: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                    {g.supplierName ?? 'No default supplier'}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                    {g.steps.length} step{g.steps.length === 1 ? '' : 's'}
                    {unsent.length !== g.steps.length ? ` · ${g.steps.length - unsent.length} already sent` : ''}
                  </Typography>
                  {canManage && unsent.length > 0 && (<>
                    <Box sx={{ flex: 1 }} />
                    {!g.supplierId && (
                      <TextField select size="small" label="Supplier" value={supplierPick[key] ?? ''} sx={{ minWidth: 180 }}
                        onChange={(e) => setSupplierPick((s) => ({ ...s, [key]: e.target.value === '' ? '' : Number(e.target.value) }))}>
                        <MenuItem value="">— choose —</MenuItem>
                        {suppliers.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                      </TextField>
                    )}
                    <Button
                      size="small" variant="contained" startIcon={<LocalShippingRounded />}
                      disabled={sending === key || (!g.supplierId && !supplierPick[key])}
                      onClick={() => void send(g, key)}
                    >
                      Send to supplier
                    </Button>
                  </>)}
                </Stack>
                <Stack spacing={0.5}>
                  {g.steps.map((s) => (
                    <Stack key={`${s.itemId}-${s.taskId ?? s.operationName}`} direction="row" spacing={1} sx={{ fontSize: 12 }}>
                      <Mono sx={{ fontSize: 11 }}>{s.itemCode ?? '—'}</Mono>
                      <Typography sx={{ fontSize: 12 }}>{s.itemName}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                        {s.operationName} · ×{qty(s.qty)}
                        {s.sentOutAt ? ` · sent ${s.sentOutAt.slice(0, 10)}` : s.returnedAt ? ` · returned ${s.returnedAt.slice(0, 10)}` : s.requested ? ' · requested' : ''}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

// ── A PRODUCTION ORDER ──────────────────────────────────────────────────────

/**
 * Sized so the longest chain — 17 steps on a Segment — fits a 1920 px screen:
 * 320 + 17 × (70 + 6) ≈ 1,640 px plus the row total.
 */
const LEFT = 320;
const CAR = 70;
const LINK = 6;

function ProductionSection({
  title, hint, purpose, orderId, section, canManage, onReload, onChanged, onError, onStep, orderNumber,
  hasBlanks, orderStatus, onGoToParams,
}: {
  title: string; hint: string; purpose: 'cutting' | 'fabrication'; orderNumber: string;
  orderId: number | string; section: PlanSection; canManage: boolean;
  onReload: (readiness?: OrderReadiness) => Promise<void>; onError: (m: string) => void;
  /** Fired after a step time change — narrower than `onReload`, no local re-fetch. */
  onChanged?: (readiness?: OrderReadiness) => void;
  onStep: (rowId: number, stepId: number, minutes: number | null) => void;
  /** Cutting only: is there any blank on this order at all, distinct from "not nested yet". */
  hasBlanks?: boolean;
  /** The sales order's own status — gates "Re-deploy after revision". */
  orderStatus?: string;
  onGoToParams?: () => void;
}) {
  const { toast } = useToast();
  const mo = section.productionOrder;
  const editable = canManage && section.editable;
  const [busy, setBusy] = useState<'draft' | 'deploy' | null>(null);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  /** X2: raiseDraft's structured 409s, rendered instead of a plain message. */
  const [raiseError, setRaiseError] = useState<{
    message: string; missingValues?: FieldsMissingDetail['missingValues']; blocking?: { message: string }[];
  } | null>(null);

  // Collapsing a row hides everything under it.
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const hasKids = useMemo(() => new Set(section.rows.map((r) => r.parentId).filter((x): x is number => x != null)), [section.rows]);
  const visible = useMemo(() => {
    const hidden = new Set<number>();
    return section.rows.filter((r) => {
      if (r.parentId != null && (closed.has(r.parentId) || hidden.has(r.parentId))) { hidden.add(r.id); return false; }
      return true;
    });
  }, [section.rows, closed]);
  const toggle = (id: number) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function draft(force = false) {
    setBusy('draft'); setRaiseError(null);
    try {
      const res = await raiseDraft(orderId, purpose, force);
      toast(mo ? 'Draft brought up to date' : 'Draft production order created', 'success');
      await onReload(res.readiness);
    } catch (e) {
      const ax = e as { response?: { data?: {
        code?: string; message?: string;
        detail?: FieldsMissingDetail | { blocking?: { message: string }[] };
      } } };
      const data = ax.response?.data;
      if (data?.code === 'FIELDS_MISSING') {
        setRaiseError({
          message: data.message ?? 'Some parts are missing values.',
          missingValues: (data.detail as FieldsMissingDetail | undefined)?.missingValues,
        });
      } else if (data?.code === 'NESTING_INVALID') {
        setRaiseError({
          message: data.message ?? 'This nesting has problems.',
          blocking: (data.detail as { blocking?: { message: string }[] } | undefined)?.blocking,
        });
      } else {
        onError(backendMessage(e, 'Could not create the draft.'));
      }
    } finally { setBusy(null); }
  }

  async function deploy() {
    if (!mo) return;
    setBusy('deploy');
    try {
      const res = await deployProductionOrder(mo.id);
      toast(`${mo.orderNumber} deployed to production`, 'success');
      await onReload(res.readiness);
    } catch (e) { onError(backendMessage(e, 'Could not deploy.')); } finally { setBusy(null); }
  }

  /** X2: re-plan a NON-draft production order after a revision, without regressing its status (EU-12). */
  async function redeploy() {
    if (!mo) return;
    setBusy('deploy');
    try {
      const res = await deployProductionOrder(mo.id, { redeploy: true });
      toast(`${mo.orderNumber} re-deployed`, 'success');
      await onReload(res.readiness);
    } catch (e) { onError(backendMessage(e, 'Could not re-deploy.')); } finally { setBusy(null); }
  }

  const rowsWithSteps = section.rows.filter((r) => r.steps.length > 0).length;
  const [open, toggleOpen] = useFolded(orderId, purpose);
  const prefix = useMemo(() => commonPrefix(section.rows.map((r) => r.code)), [section.rows]);

  return (
    <Box sx={frame}>
      <SectionHead
        title={title} hint={hint}
        open={open} onToggle={toggleOpen}
        right={open && (
          <Stack direction="row" spacing={1} alignItems="center">
            {section.rows.length > 0 && (
              <Tooltip title={expanded ? 'Show step codes' : 'Show full step names'}>
                <IconButton size="small" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Show step codes' : 'Show full step names'}>
                  {expanded ? <UnfoldLessRounded sx={{ fontSize: 16 }} /> : <UnfoldMoreRounded sx={{ fontSize: 16 }} />}
                </IconButton>
              </Tooltip>
            )}
            {canManage && (!mo || mo.status === 'draft') && section.stepCount > 0 && (
              <Button size="small" disabled={!!busy} onClick={() => void draft()}
                startIcon={busy === 'draft' ? <CircularProgress size={14} color="inherit" /> : mo ? <RefreshRounded /> : <NoteAddRounded />}>
                {mo ? 'Update draft' : 'Create draft production order'}
              </Button>
            )}
            {canManage && mo?.status === 'draft' && (
              <Button size="small" variant="contained" disabled={!!busy} onClick={() => setConfirmDeploy(true)}
                startIcon={busy === 'deploy' ? <CircularProgress size={14} color="inherit" /> : <RocketLaunchRounded />}>
                Deploy to production
              </Button>
            )}
            {/* P2/X2: a revision's structure edits reach a deployed production
                order without regressing its status — this is how the shop
                picks up the change. Also offered, as the primary action, the
                moment the server says the BOM moved under a deployed order
                (`stale`, from its deploy signature) — a length typed on a
                draft order's Line items step after deploying is the same
                situation as a revision, and used to have no button at all. */}
            {canManage && mo && mo.status !== 'draft' && (mo.stale || (orderStatus && orderStatus !== 'draft')) && (
              <Button size="small" variant={mo.stale ? 'contained' : 'text'} color={mo.stale ? 'warning' : 'primary'}
                disabled={!!busy} onClick={() => void redeploy()}
                startIcon={busy === 'deploy' ? <CircularProgress size={14} color="inherit" /> : <RefreshRounded />}>
                {mo.stale ? 'Re-deploy — BOM changed' : 'Re-deploy after revision'}
              </Button>
            )}
          </Stack>
        )}
      >
        {mo ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Mono>{mo.orderNumber}</Mono>
            <Chip size="small" label={statusLabel(mo.status)} color={chipColorForStatus(mo.status)} variant="outlined" />
            {mo.stale && (
              <Tooltip title="The BOM changed after this order was deployed — the shop is still working to the old plan until it is re-deployed.">
                <Chip size="small" label="Changed since deploy" color="warning" variant="outlined" />
              </Tooltip>
            )}
          </Stack>
        ) : (
          <Chip size="small" label="No production order yet" variant="outlined" />
        )}
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {rowsWithSteps} row{rowsWithSteps === 1 ? '' : 's'} · {section.stepCount} steps · {hours(section.totalMinutes)}
        </Typography>
        {/* UAT 21: every time "—" and "0 h" read as broken. Say where a time comes from. */}
        {section.stepCount > 0 && section.totalMinutes === 0 && (
          <Tooltip title="A step's time comes from its operation's formula or standard time (Setup › Operations). Until one is set, you can click any time here and type it for this order.">
            <Chip size="small" variant="outlined" label="No times yet — set them on the operations, or click a time" />
          </Tooltip>
        )}
        {prefix && (
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
            Codes start <Box component="span" sx={{ fontFamily: 'monospace' }}>{prefix}</Box>
          </Typography>
        )}
      </SectionHead>

      {open && raiseError && (
        <Alert severity="warning" sx={{ m: 1.5 }} onClose={() => setRaiseError(null)}>
          <Typography sx={{ fontSize: 13, mb: 0.5 }}>{raiseError.message}</Typography>
          {raiseError.missingValues && raiseError.missingValues.length > 0 && (
            <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.5, fontSize: 12.5 }}>
              {raiseError.missingValues.slice(0, 8).map((m) => (
                <li key={m.itemId}>{m.itemName ?? m.itemCode ?? m.itemId} — {m.missing.join(', ')}</li>
              ))}
              {raiseError.missingValues.length > 8 && <li>…and {raiseError.missingValues.length - 8} more</li>}
            </Box>
          )}
          {raiseError.blocking && raiseError.blocking.length > 0 && (
            <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.5, fontSize: 12.5 }}>
              {raiseError.blocking.slice(0, 8).map((b, i) => <li key={i}>{b.message}</li>)}
            </Box>
          )}
          <Stack direction="row" spacing={1}>
            {raiseError.missingValues && onGoToParams && (
              <Button size="small" onClick={onGoToParams}>Go to Parameters</Button>
            )}
            {canManage && (
              <Button size="small" color="warning" onClick={() => setConfirmForce(true)}>
                Build the tasks anyway
              </Button>
            )}
          </Stack>
        </Alert>
      )}

      {!open ? null : section.rows.length === 0 ? (
        <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-2)' }}>
          {purpose === 'cutting'
            ? (hasBlanks ? 'Nothing to cut yet — accept a nesting plan first.' : 'No blanks on this order — nothing needs cutting.')
            : 'Nothing to make yet.'}
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto', maxHeight: purpose === 'cutting' ? 420 : 640 }}>
          <Box sx={{ minWidth: 'max-content' }}>
            {/* column heads */}
            <Box sx={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: 'var(--c-surface)', borderBottom: '1px solid var(--c-divider)' }}>
              <HeadCell sx={{ width: LEFT, position: 'sticky', left: 0, zIndex: 4, background: 'var(--c-surface)', borderRight: '1px solid var(--c-divider)' }}>
                {purpose === 'cutting' ? 'Blank' : 'BOM'}
              </HeadCell>
              <HeadCell sx={{ px: 1.5 }}>
                Steps — time per piece{editable ? ' · click a time to change it' : ''}
              </HeadCell>
            </Box>

            {visible.map((r) => (
              <PlanRowView
                key={r.id} row={r} editable={editable} codePrefix={prefix} orderNumber={orderNumber}
                expanded={expanded}
                open={!closed.has(r.id)} canOpen={hasKids.has(r.id)} onToggle={() => toggle(r.id)}
                onSave={async (s, m) => {
                  try {
                    const res = await setStepTime(orderId, r.id, s.stepId, m);
                    onStep(r.id, s.stepId, m);
                    onChanged?.(res.readiness);
                  } catch (e) { onError(backendMessage(e, 'Could not change that time.')); }
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      <ConfirmDialog
        open={confirmDeploy}
        title={`Deploy ${mo?.orderNumber ?? ''} to production?`}
        body={(
          <Typography sx={{ fontSize: 13 }}>
            This writes the codes — every BOM row and every one of its {section.stepCount} tasks — and sends the
            order to the shop floor. Times can't be changed after this.
          </Typography>
        )}
        confirmLabel="Deploy"
        onClose={() => setConfirmDeploy(false)}
        onConfirm={async () => { setConfirmDeploy(false); await deploy(); }}
      />

      {/* The `force` escape `raiseDraft` already accepted but this screen never sent. */}
      <ConfirmDialog
        open={confirmForce}
        title="Build the tasks anyway?"
        body="Parts short a value will be estimated as taking no time for that step. You can fix the value and rebuild later — this does not lock anything in."
        confirmLabel="Build anyway"
        onClose={() => setConfirmForce(false)}
        onConfirm={async () => { setConfirmForce(false); await draft(true); }}
      />
    </Box>
  );
}

function HeadCell({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={{
      fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase',
      letterSpacing: '.04em', py: 0.75, px: 1.25, flexShrink: 0, ...sx,
    }}>
      {children}
    </Box>
  );
}

/** One BOM row: the row on the left, its flow as a train of steps on the right. */
function PlanRowView({ row, editable, open, canOpen, onToggle, onSave, codePrefix, orderNumber, expanded }: {
  row: PlanRow; editable: boolean; open: boolean; canOpen: boolean; onToggle: () => void;
  codePrefix: string; orderNumber: string; expanded: boolean;
  onSave: (s: PlanStep, minutes: number | null) => Promise<void>;
}) {
  const bought = row.procurement === 'buy';
  // Inside the order, the order number on a blank's name says nothing.
  const tail = ` — ${orderNumber}`;
  const name = row.name.endsWith(tail) ? row.name.slice(0, -tail.length) : row.name;
  // A qty-4 row is pieces 1…4 under each parent: SPAN1-L1-1…4.
  const code = codeRangeLabel(row.code, row.codeLast, codePrefix);
  return (
    <Box sx={{
      display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--c-divider)',
      '&:hover .pp-left': { background: 'var(--c-surface-2)' },
    }}>
      <Box className="pp-left" sx={{
        width: LEFT, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2,
        background: 'var(--c-surface)', borderRight: '1px solid var(--c-divider)',
        display: 'flex', alignItems: 'center', gap: 0.5, py: 0.6, pr: 1.25, pl: 0.5 + row.depth * 1.6,
      }}>
        <Box sx={{ width: 24, flexShrink: 0 }}>
          {canOpen && (
            <IconButton size="small" onClick={onToggle} sx={{ p: 0.25 }} aria-label={open ? 'Collapse' : 'Expand'}>
              {open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          )}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: row.depth === 0 ? 600 : 500, color: bought ? 'var(--c-text-2)' : 'inherit' }}>
            {name}
          </Typography>
          <Tooltip title={`${row.code ?? 'No code — bought in'}${row.code && !row.codeSaved ? ' (written when the order is deployed)' : ''}`}>
            <Typography noWrap sx={{
              fontSize: 10.5, fontFamily: 'monospace',
              color: row.codeSaved ? 'var(--c-text-2)' : 'var(--c-text-3)',
              fontStyle: row.codeSaved ? 'normal' : 'italic',
            }}>
              {code ?? '—'}
            </Typography>
          </Tooltip>
        </Box>
        <Tooltip title={row.qty === row.totalQty ? `${qty(row.totalQty)} pieces` : `${qty(row.qty)} per parent · ${qty(row.totalQty)} across the order`}>
          <Box sx={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>×{qty(row.qty)}</Typography>
            {row.qty !== row.totalQty && (
              <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>{qty(row.totalQty)} total</Typography>
            )}
          </Box>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.25, py: 0.6, gap: 0 }}>
        {row.steps.length === 0 ? (
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
            {bought
              ? 'Bought in'
              : canOpen
                ? 'No steps — groups the rows under it'
                // A LEAF with no steps is a part nobody gave a flow — it will
                // never reach the shop. Say so, and say where the fix is.
                : 'No flow yet — choose one on the Line items step (Set flow on all leaves)'}
          </Typography>
        ) : (<>
          {row.steps.map((s, i) => (
            <Box key={s.stepId} sx={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <Box sx={{ width: LINK, height: 2, background: 'var(--c-border)', flexShrink: 0 }} />}
              <StepCar step={s} pieces={row.totalQty} editable={editable} expanded={expanded} onSave={(m) => onSave(s, m)} />
            </Box>
          ))}
          <Tooltip title="All steps, all pieces on this row">
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', ml: 1.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              = {hours(row.totalMinutes)}
            </Typography>
          </Tooltip>
        </>)}
      </Box>
    </Box>
  );
}

/** One step: the operation, and one piece's time — which can be typed over. */
function StepCar({ step, pieces, editable, expanded, onSave }: {
  step: PlanStep; pieces: number; editable: boolean; expanded: boolean;
  onSave: (minutes: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  // EU-9: the server's own answer, not a locally re-derived 0.005-minute
  // tolerance compare — typing the formula's own number back is the same as
  // never having typed over it at all, and the server already knows that.
  const changed = step.overrideMinutes != null && !step.overrideIsFormula;
  const hasError = !!step.formulaError;

  async function commit() {
    const raw = value.trim();
    setEditing(false);
    const n = raw === '' ? null : Number(raw);
    if (n != null && !(Number.isFinite(n) && n >= 0)) return;
    // Typing the formula's own number back is the same as clearing it — a
    // save-time simplification, distinct from `overrideIsFormula` (which is
    // about how an EXISTING override displays, not what gets sent here).
    const next = n != null && step.formulaMinutes != null && Math.abs(n - step.formulaMinutes) < 0.005 ? null : n;
    if (next === step.overrideMinutes) return;
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  }

  const tip = (
    <Box sx={{ fontSize: 12 }}>
      <b>{step.operationName ?? step.operationCode}</b>
      <div>Worked out: {perPiece(step.formulaMinutes)} per piece</div>
      {changed && <div>Changed to: {perPiece(step.overrideMinutes)} per piece</div>}
      {(step.setupMinutes ?? 0) > 0 && <div>Setup: {perPiece(step.setupMinutes)} once</div>}
      <div>× {qty(pieces)} pieces = {hours(step.totalMinutes)}</div>
      {step.taskCode && <div style={{ fontFamily: 'monospace', marginTop: 4 }}>{step.taskCode}{step.taskCodeSaved ? '' : ' (on deploy)'}</div>}
      {/* EU-8: "—" used to be the whole story. A formula error means this task
          is estimated at zero time until it's fixed — worth saying, not just
          showing as a dash. */}
      {hasError && (
        <div style={{ color: 'var(--c-danger-400, #f88)', marginTop: 4 }}>
          {step.formulaError!.message ?? `Formula problem: ${step.formulaError!.code}`}
        </div>
      )}
      {step.warnings.length > 0 && (
        <div style={{ color: 'var(--c-warning-400, #fc6)', marginTop: 4 }}>
          {step.warnings.map((w) => w.code).join(', ')}
        </div>
      )}
    </Box>
  );

  return (
    <Tooltip title={tip} placement="top" disableHoverListener={editing}>
      <Box sx={{
        width: CAR, flexShrink: 0, borderRadius: 'var(--r-sm)', px: 0.6, py: 0.35,
        // One property, not `border` + `borderColor` (React warns on the mix).
        border: `1px solid ${hasError ? 'var(--c-danger-600)' : changed ? 'var(--c-primary-200)' : 'var(--c-border)'}`,
        background: changed ? 'var(--c-primary-50)' : 'var(--c-surface)',
        boxShadow: 'var(--e-1)',
        transition: 'box-shadow var(--t-fast) var(--ease)',
        '&:hover': { boxShadow: 'var(--e-2)' },
      }}>
        {/*
          The step's number is the same small circled numeral the wizard rail
          draws for the order's steps, so "step 3 of this row" and "step 3 of
          the order" read as the same kind of thing.
        */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <Box aria-hidden sx={{
            width: 15, height: 15, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 9, lineHeight: 1,
            color: hasError ? 'var(--c-danger-600)' : 'var(--c-text-3)',
            border: `1px solid ${hasError ? 'var(--c-danger-600)' : 'var(--c-border)'}`,
          }}>
            {step.stepNo}
          </Box>
          <Typography noWrap sx={{ fontSize: 10, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)', lineHeight: 1.3, minWidth: 0 }}>
            {expanded ? (step.operationName ?? step.operationCode ?? '?') : (step.operationCode ?? '?')}
          </Typography>
          {hasError && <ErrorOutlineRounded sx={{ fontSize: 11, color: 'var(--c-danger-600)', flexShrink: 0 }} />}
        </Box>
        {editing ? (
          /*
           * A TIME IS FOR ONE PIECE. The box reads "11h 55m" and the editor
           * opened on "715.48", which is the same number in minutes and looks
           * like a total — so while typing it says whose time it is and what
           * it comes to across the row.
           */
          <Box sx={{ position: 'relative' }}>
            <TextField
              autoFocus size="small" type="number" value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  // Leaves the cell, not the wizard (the dialog closes on an
                  // unhandled Escape).
                  e.stopPropagation();
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              placeholder={step.formulaMinutes != null ? String(step.formulaMinutes) : ''}
              inputProps={{ min: 0, step: 0.5, style: { fontSize: 11.5, padding: '1px 4px' } }}
              sx={{ width: '100%' }}
            />
            <Box sx={{
              position: 'absolute', top: '100%', left: 0, zIndex: 5, mt: 0.5, px: 1, py: 0.5,
              whiteSpace: 'nowrap', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)',
              background: 'var(--c-surface)', boxShadow: 'var(--e-3)',
            }}>
              <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-2)' }}>
                minutes <b>per piece</b>
              </Typography>
              <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
                × {qty(pieces)} = {hours((step.setupMinutes ?? 0) + (Number(value) || 0) * pieces)}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Stack direction="row" alignItems="center" spacing={0.25} className="pp-stepval" sx={{ position: 'relative' }}>
            <Box
              component={editable ? 'button' : 'span'}
              onClick={editable ? () => { setValue(step.minutes != null ? String(step.minutes) : ''); setEditing(true); } : undefined}
              sx={{
                all: 'unset', cursor: editable ? 'text' : 'default', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums', color: changed ? 'var(--c-primary-700)' : 'var(--c-text)',
                // A per-piece override used to look exactly like a disabled
                // button — `all: 'unset'` erases every native affordance a
                // clickable thing has. The dotted underline is the one that
                // survives a value NOT being changed, so an editable cell
                // reads as editable even before you touch it; a genuinely
                // disabled one (deployed, or a quote) drops it and dims.
                borderBottom: editable ? '1px dotted var(--c-border)' : 'none',
                opacity: editable ? 1 : 0.55,
                '&:hover': editable ? { borderBottomColor: 'var(--c-primary-400, #8b7cf6)' } : undefined,
                '&:focus-visible': { outline: '2px solid var(--c-primary-400, #8b7cf6)', borderRadius: '3px' },
              }}
            >
              {saving ? '…' : shortTime(step.minutes)}
            </Box>
            {editable && !saving && (
              <EditRounded className="pp-pencil" sx={{
                fontSize: 11, color: 'var(--c-text-3)', opacity: 0, transition: 'opacity var(--t-fast, .12s)',
                '.pp-stepval:hover &': { opacity: 1 },
              }} />
            )}
            {changed && editable && (
              <Tooltip title={`Back to the worked-out ${perPiece(step.formulaMinutes)}`}>
                <IconButton size="small" sx={{ p: 0, ml: 'auto' }} onClick={() => void onSave(null)} aria-label="Undo change">
                  <UndoRounded sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}
      </Box>
    </Tooltip>
  );
}
