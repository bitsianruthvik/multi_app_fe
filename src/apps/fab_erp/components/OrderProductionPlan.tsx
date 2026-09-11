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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import NoteAddRounded from '@mui/icons-material/NoteAddRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';

import {
  getProductionPlan, setStepTime, raiseDraft, deployProductionOrder,
  requestProcurement, sendPurchaseRequest,
  type ProductionPlan, type PlanSection, type PlanRow, type PlanStep, type BuyLine,
} from '../api/productionPlan';
import { backendMessage, ConfirmDialog, Mono, useToast } from '../components';

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
const hours = (m: number) => `${Math.round(m / 60).toLocaleString()} h`;
const qty = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', waiting: 'Deployed · waiting for material', in_production: 'In production',
  completed: 'Completed', requested: 'Requested', ordered: 'Ordered',
  partially_received: 'Partly received', received: 'Received', cancelled: 'Cancelled',
};
const statusColor = (s: string): 'default' | 'warning' | 'info' | 'success' =>
  (s === 'draft' || s === 'requested' ? 'warning' : s === 'completed' || s === 'received' ? 'success' : 'info');

// ── the screen ──────────────────────────────────────────────────────────────

export default function OrderProductionPlan({
  orderId, canManage, onChanged,
}: {
  orderId: number | string;
  canManage: boolean;
  onChanged?: () => void;
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

  const reload = useCallback(async () => { await load(); onChanged?.(); }, [load, onChanged]);

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
    return (
      <Stack alignItems="center" spacing={1} sx={{ p: 6 }}>
        <CircularProgress size={22} />
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Working out every step…</Typography>
      </Stack>
    );
  }
  if (!plan) return <Alert severity="error">{error || 'Nothing to show.'}</Alert>;

  return (
    <Stack spacing={2.5}>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <BuySection orderId={orderId} plan={plan} canManage={canManage} onDone={reload} onError={setError} />

      <ProductionSection
        title="Cutting" hint="Plate into blanks"
        purpose="cutting" orderId={orderId} section={plan.cutting} canManage={canManage}
        onReload={reload} onError={setError}
        onStep={(rowId, stepId, m) => patchStep('cutting', rowId, stepId, m)}
      />

      <ProductionSection
        title="Fabrication" hint="Parts, assemblies and finishing"
        purpose="fabrication" orderId={orderId} section={plan.fabrication} canManage={canManage}
        onReload={reload} onError={setError}
        onStep={(rowId, stepId, m) => patchStep('fabrication', rowId, stepId, m)}
      />
    </Stack>
  );
}

// ── shared section frame ────────────────────────────────────────────────────

function SectionHead({ title, hint, children, right }: {
  title: string; hint: string; children?: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
      px: 2, py: 1.25, borderBottom: '1px solid var(--c-divider)', background: 'var(--c-surface-2)',
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{hint}</Typography>
      </Box>
      {children}
      <Box sx={{ flex: 1 }} />
      {right}
    </Box>
  );
}

const frame = {
  border: '1px solid var(--c-border)', borderRadius: 'var(--r-md, 10px)',
  background: 'var(--c-surface)', overflow: 'hidden',
};

// ── BUY ─────────────────────────────────────────────────────────────────────

function BuySection({ orderId, plan, canManage, onDone, onError }: {
  orderId: number | string; plan: ProductionPlan; canManage: boolean;
  onDone: () => Promise<void>; onError: (m: string) => void;
}) {
  const { toast } = useToast();
  const { lines, purchases, suppliers, unmatched } = plan.buy;

  /** How much to take off the shelf, per item. Starts at what is held, else all that is free. */
  const initialTake = useCallback((l: BuyLine) => (l.held > 0 ? l.held : Math.min(l.required, l.inStock)), []);
  const [take, setTake] = useState<Record<number, string>>({});
  useEffect(() => {
    setTake(Object.fromEntries(lines.map((l) => [l.catalogItemId, String(initialTake(l))])));
  }, [lines, initialTake]);
  const takeOf = (l: BuyLine) => Math.min(Math.max(0, Number(take[l.catalogItemId]) || 0), l.inStock, l.required);
  const toBuy = (l: BuyLine) => Math.max(0, l.required - takeOf(l) - l.onOrder);

  const [busy, setBusy] = useState(false);
  const [sendTo, setSendTo] = useState<Record<number, number | ''>>({});
  const openRequest = purchases.find((p) => p.status === 'requested');
  const anythingToBuy = lines.some((l) => toBuy(l) > 0);

  async function submit() {
    setBusy(true);
    try {
      await requestProcurement(orderId, lines.map((l) => ({ catalogItemId: l.catalogItemId, take: takeOf(l) })));
      toast(anythingToBuy ? 'Stock held and the rest requested' : 'Stock held for this order', 'success');
      await onDone();
    } catch (e) {
      onError(backendMessage(e, 'Could not request the material.'));
    } finally { setBusy(false); }
  }

  async function send(poId: number) {
    const sup = sendTo[poId];
    if (!sup) return;
    try {
      await sendPurchaseRequest(poId, Number(sup));
      toast('Sent to the supplier', 'success');
      await onDone();
    } catch (e) { onError(backendMessage(e, 'Could not send the request.')); }
  }

  const cell = { fontSize: 12.5, px: 1.25, py: 0.75, borderBottom: '1px solid var(--c-divider)', whiteSpace: 'nowrap' } as const;
  const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;
  const head = { ...cell, fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.04em' } as const;

  return (
    <Box sx={frame}>
      <SectionHead
        title="Buy" hint="Take from stock for this order, request the rest"
        right={canManage && lines.length > 0 && (
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

      {lines.length === 0 ? (
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
                  <Box component="td" sx={{ ...num, color: l.inStock > 0 ? 'inherit' : 'var(--c-text-3)' }}>{qty(l.inStock)}</Box>
                  <Box component="td" sx={num}>
                    <TextField
                      size="small" type="number" value={take[l.catalogItemId] ?? ''}
                      disabled={!canManage || l.inStock <= 0}
                      onChange={(e) => setTake((t) => ({ ...t, [l.catalogItemId]: e.target.value }))}
                      inputProps={{ min: 0, max: Math.min(l.inStock, l.required), style: { textAlign: 'right', fontSize: 12.5, padding: '4px 8px' } }}
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

      {unmatched.length > 0 && (
        <Alert severity="warning" sx={{ m: 1.5 }}>
          {unmatched.length} bought-in row(s) name no catalog item, so they cannot be checked against stock or requested:
          {' '}{unmatched.map((u) => u.name).filter(Boolean).join(', ')}
        </Alert>
      )}

      {purchases.length > 0 && (
        <Box sx={{ borderTop: '1px solid var(--c-divider)', p: 1.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.04em', mb: 1 }}>
            Purchase requests and orders
          </Typography>
          <Stack spacing={0.75}>
            {purchases.map((po) => (
              <Stack key={po.id} direction="row" spacing={1.25} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Mono>{po.orderNumber}</Mono>
                <Chip size="small" label={STATUS_LABEL[po.status] ?? po.status} color={statusColor(po.status)} variant="outlined" />
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

// ── A PRODUCTION ORDER ──────────────────────────────────────────────────────

const LEFT = 360;

function ProductionSection({
  title, hint, purpose, orderId, section, canManage, onReload, onError, onStep,
}: {
  title: string; hint: string; purpose: 'cutting' | 'fabrication';
  orderId: number | string; section: PlanSection; canManage: boolean;
  onReload: () => Promise<void>; onError: (m: string) => void;
  onStep: (rowId: number, stepId: number, minutes: number | null) => void;
}) {
  const { toast } = useToast();
  const mo = section.productionOrder;
  const editable = canManage && section.editable;
  const [busy, setBusy] = useState<'draft' | 'deploy' | null>(null);
  const [confirmDeploy, setConfirmDeploy] = useState(false);

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

  async function draft() {
    setBusy('draft');
    try {
      await raiseDraft(orderId, purpose);
      toast(mo ? 'Draft brought up to date' : 'Draft production order created', 'success');
      await onReload();
    } catch (e) { onError(backendMessage(e, 'Could not create the draft.')); } finally { setBusy(null); }
  }

  async function deploy() {
    if (!mo) return;
    setBusy('deploy');
    try {
      await deployProductionOrder(mo.id);
      toast(`${mo.orderNumber} deployed to production`, 'success');
      await onReload();
    } catch (e) { onError(backendMessage(e, 'Could not deploy.')); } finally { setBusy(null); }
  }

  const rowsWithSteps = section.rows.filter((r) => r.steps.length > 0).length;

  return (
    <Box sx={frame}>
      <SectionHead
        title={title} hint={hint}
        right={canManage && (
          <Stack direction="row" spacing={1}>
            {(!mo || mo.status === 'draft') && section.stepCount > 0 && (
              <Button size="small" disabled={!!busy} onClick={() => void draft()}
                startIcon={busy === 'draft' ? <CircularProgress size={14} color="inherit" /> : mo ? <RefreshRounded /> : <NoteAddRounded />}>
                {mo ? 'Update draft' : 'Create draft production order'}
              </Button>
            )}
            {mo?.status === 'draft' && (
              <Button size="small" variant="contained" disabled={!!busy} onClick={() => setConfirmDeploy(true)}
                startIcon={busy === 'deploy' ? <CircularProgress size={14} color="inherit" /> : <RocketLaunchRounded />}>
                Deploy to production
              </Button>
            )}
          </Stack>
        )}
      >
        {mo ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Mono>{mo.orderNumber}</Mono>
            <Chip size="small" label={STATUS_LABEL[mo.status] ?? mo.status} color={statusColor(mo.status)} variant="outlined" />
          </Stack>
        ) : (
          <Chip size="small" label="No production order yet" variant="outlined" />
        )}
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {rowsWithSteps} row{rowsWithSteps === 1 ? '' : 's'} · {section.stepCount} steps · {hours(section.totalMinutes)}
        </Typography>
      </SectionHead>

      {section.rows.length === 0 ? (
        <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-2)' }}>
          {purpose === 'cutting' ? 'Nothing to cut yet — accept a nesting plan first.' : 'Nothing to make yet.'}
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
                key={r.id} row={r} editable={editable}
                open={!closed.has(r.id)} canOpen={hasKids.has(r.id)} onToggle={() => toggle(r.id)}
                onSave={async (s, m) => {
                  try {
                    await setStepTime(orderId, r.id, s.stepId, m);
                    onStep(r.id, s.stepId, m);
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
function PlanRowView({ row, editable, open, canOpen, onToggle, onSave }: {
  row: PlanRow; editable: boolean; open: boolean; canOpen: boolean; onToggle: () => void;
  onSave: (s: PlanStep, minutes: number | null) => Promise<void>;
}) {
  const bought = row.procurement === 'buy';
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
            {row.name}
          </Typography>
          <Tooltip title={row.codeSaved ? 'Code' : 'Code it will get when the order is deployed'}>
            <Typography noWrap sx={{
              fontSize: 10.5, fontFamily: 'monospace',
              color: row.codeSaved ? 'var(--c-text-2)' : 'var(--c-text-3)',
              fontStyle: row.codeSaved ? 'normal' : 'italic',
            }}>
              {row.code ?? '—'}
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
            {bought ? 'Bought in' : 'No steps — groups the rows under it'}
          </Typography>
        ) : (<>
          {row.steps.map((s, i) => (
            <Box key={s.stepId} sx={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <Box sx={{ width: 10, height: 2, background: 'var(--c-border)', flexShrink: 0 }} />}
              <StepCar step={s} pieces={row.totalQty} editable={editable} onSave={(m) => onSave(s, m)} />
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
function StepCar({ step, pieces, editable, onSave }: {
  step: PlanStep; pieces: number; editable: boolean; onSave: (minutes: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const changed = step.overrideMinutes != null;

  async function commit() {
    const raw = value.trim();
    setEditing(false);
    const n = raw === '' ? null : Number(raw);
    if (n != null && !(Number.isFinite(n) && n >= 0)) return;
    // Typing the formula's own number back is the same as clearing it.
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
    </Box>
  );

  return (
    <Tooltip title={tip} placement="top" disableHoverListener={editing}>
      <Box sx={{
        width: 84, flexShrink: 0, borderRadius: '6px', px: 0.75, py: 0.4,
        border: '1px solid', borderColor: changed ? 'var(--c-primary-400, #8b7cf6)' : 'var(--c-border)',
        background: changed ? 'var(--c-primary-50)' : 'var(--c-surface)',
      }}>
        <Typography noWrap sx={{ fontSize: 10, color: 'var(--c-text-3)', fontFamily: 'monospace', lineHeight: 1.3 }}>
          {String(step.stepNo).padStart(2, '0')} {step.operationCode ?? '?'}
        </Typography>
        {editing ? (
          <TextField
            autoFocus size="small" type="number" value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder={step.formulaMinutes != null ? String(step.formulaMinutes) : ''}
            inputProps={{ min: 0, step: 0.5, style: { fontSize: 11.5, padding: '1px 4px' } }}
            sx={{ width: '100%' }}
          />
        ) : (
          <Stack direction="row" alignItems="center" spacing={0.25}>
            <Box
              component={editable ? 'button' : 'span'}
              onClick={editable ? () => { setValue(step.minutes != null ? String(step.minutes) : ''); setEditing(true); } : undefined}
              sx={{
                all: 'unset', cursor: editable ? 'text' : 'default', fontSize: 12, fontWeight: 600,
                fontVariantNumeric: 'tabular-nums', color: changed ? 'var(--c-primary-700)' : 'var(--c-text)',
                '&:focus-visible': { outline: '2px solid var(--c-primary-400, #8b7cf6)', borderRadius: '3px' },
              }}
            >
              {saving ? '…' : perPiece(step.minutes)}
            </Box>
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
