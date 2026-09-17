/**
 * Month — what the plant can put out in what is left of the month.
 *
 * The question before the Board's. The Board says when each operation runs;
 * this says which orders, and which pieces of them, belong in the month at all,
 * which station is deciding that, and what another machine or shift would buy.
 *
 * TWO COLUMNS, because that is the decision. Everything open is either "this
 * month" or "later", and moving a piece is pressing the one button on its row.
 * A girder split across the two appears in BOTH, saying how much of it is on
 * each side — so pushing one piece of an order out is visible as exactly that,
 * rather than as a parent row that has quietly turned a different colour.
 *
 * The engine fills whatever nobody has decided (fitModel.ts has the rules). A
 * row a person moved is theirs until they hand it back; marks are saved per
 * month. The machine and shift steppers are a WHAT-IF and are never saved — the
 * real plant is changed in Setup, and this screen's job is to say whether that
 * is worth doing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, LinearProgress, Stack, Switch, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';

import { getMonthFit, saveMonthMarks, type MarkState, type MonthFitResponse } from '../api/monthFit';
import {
  PageHeader, Surface, EmptyState, ListSkeleton, Mono, useToast, backendMessage,
} from '../components';
import {
  buildModel, runFit, suggest, isIn, hours, tonnes, poMarkId, MAX_SHIFTS, TIGHT_AT,
  type AtomState, type FitResult, type ModelNode, type ModelOrder, type ModelPo, type NodeSum,
  type StationView, type Suggestion, type Tweaks,
} from '../components/monthfit/fitModel';

type Side = 'in' | 'out';
const AUTO_KEY = 'fab_erp.monthFit.auto';

const PURPOSE_LABEL = { cutting: 'Cutting', fabrication: 'Fabrication', unreleased: 'Not released yet' } as const;

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function nextMonthOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}
function dayLabel(ymd: string | null): string {
  if (!ymd) return 'No date';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
}
function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

// ── small pieces ─────────────────────────────────────────────────────────────

function Tile({ label, value, hint, tone = 'plain' }: {
  label: string; value: string; hint?: string; tone?: 'plain' | 'danger' | 'success';
}) {
  const bg = tone === 'danger' ? 'var(--c-danger-50)' : tone === 'success' ? 'var(--c-success-50)' : 'var(--c-surface)';
  const fg = tone === 'danger' ? 'var(--c-danger-800)' : tone === 'success' ? 'var(--c-success-800)' : 'var(--c-text)';
  return (
    <Surface e={0} sx={{ flex: 1, minWidth: 180, px: 2, py: 1.5, background: bg }}>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: tone === 'plain' ? 'var(--c-text-2)' : fg }}>{label}</Typography>
      <Mono tabular sx={{ fontSize: 24, fontWeight: 500, color: fg, display: 'block', lineHeight: 1.3 }}>{value}</Mono>
      {hint && <Typography sx={{ fontSize: 12, color: tone === 'plain' ? 'var(--c-text-2)' : fg }}>{hint}</Typography>}
    </Surface>
  );
}

function Stepper({ value, changed, onDown, onUp, canDown, canUp, label }: {
  value: number; changed: boolean; onDown: () => void; onUp: () => void; canDown: boolean; canUp: boolean; label: string;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.25}>
      <IconButton size="small" onClick={onDown} disabled={!canDown} aria-label={`Fewer ${label}`}><RemoveRounded sx={{ fontSize: 16 }} /></IconButton>
      <Mono tabular sx={{ width: 22, textAlign: 'center', fontSize: 13.5, fontWeight: 500, color: changed ? 'var(--c-primary-700)' : 'var(--c-text)' }}>{value}</Mono>
      <IconButton size="small" onClick={onUp} disabled={!canUp} aria-label={`More ${label}`}><AddRounded sx={{ fontSize: 16 }} /></IconButton>
    </Stack>
  );
}

function StationRow({ st, isBottleneck, onTweak }: {
  st: StationView; isBottleneck: boolean; onTweak: (machines: number, shifts: number) => void;
}) {
  const over = st.util > 1.001;
  const alsoFull = !isBottleneck && st.blockedMin > 0;
  const tight = !isBottleneck && !alsoFull && !st.unbounded && st.util >= TIGHT_AT;
  const bar = over ? 'var(--c-danger-600)' : isBottleneck ? 'var(--c-primary-500)' : alsoFull ? 'var(--c-primary-400)' : tight ? 'var(--c-warning-600)' : 'var(--c-text-3)';
  return (
    <Stack
      direction="row" alignItems="center" spacing={2}
      sx={{ px: 2, minHeight: 44, borderTop: '1px solid var(--c-divider)', background: isBottleneck ? 'var(--c-primary-50)' : 'transparent' }}
    >
      <Box sx={{ width: 220, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500 }} noWrap>{st.name}</Typography>
        {st.machinesDown > 0 && (
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-danger-800)' }}>{st.machinesDown} down</Typography>
        )}
      </Box>
      <Box sx={{ width: 92 }}>
        <Stepper
          label="machines" value={st.machines} changed={st.machines !== st.baseMachines}
          canDown={st.machines > 1} canUp={st.machines < 20}
          onDown={() => onTweak(st.machines - 1, st.shifts)} onUp={() => onTweak(st.machines + 1, st.shifts)}
        />
      </Box>
      <Box sx={{ width: 92 }}>
        <Stepper
          label="shifts" value={st.shifts} changed={st.shifts !== st.baseShifts}
          canDown={st.shifts > 1} canUp={st.shifts < MAX_SHIFTS}
          onDown={() => onTweak(st.machines, st.shifts - 1)} onUp={() => onTweak(st.machines, st.shifts + 1)}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 120 }}>
        {st.unbounded ? (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>No shift calendar, so it never limits the month</Typography>
        ) : (
          <>
            <Box sx={{ height: 8, borderRadius: 4, background: 'var(--c-divider)', overflow: 'hidden' }}>
              <Box sx={{ height: 8, borderRadius: 4, width: `${Math.min(100, Math.round(st.util * 100))}%`, background: bar }} />
            </Box>
            <Mono tabular sx={{ fontSize: 11.5, color: over ? 'var(--c-danger-800)' : 'var(--c-text-2)' }}>
              {hours(st.loadMin)} of {hours(st.capMin)}
            </Mono>
          </>
        )}
      </Box>
      <Box sx={{ width: 118, textAlign: 'right' }}>
        {isBottleneck && <Chip size="small" label="Limits output" sx={{ background: 'var(--c-primary-100)', color: 'var(--c-primary-900)', fontWeight: 500 }} />}
        {over && !isBottleneck && <Chip size="small" label="Overloaded" sx={{ background: 'var(--c-danger-50)', color: 'var(--c-danger-800)', fontWeight: 500 }} />}
        {alsoFull && !over && (
          <Tooltip title="It turned work away too. Lifting the main limit alone will not help much until this has room.">
            <Chip size="small" label="Also full" sx={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)', fontWeight: 500 }} />
          </Tooltip>
        )}
        {tight && !over && <Chip size="small" label="Nearly full" sx={{ background: 'var(--c-warning-50)', color: 'var(--c-warning-800)', fontWeight: 500 }} />}
      </Box>
    </Stack>
  );
}

function SuggestionCard({ s, tone, onTry }: { s: Suggestion; tone: 'warning' | 'success'; onTry: () => void }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.25, borderRadius: 'var(--r-sm)', background: `var(--c-${tone}-50)` }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: `var(--c-${tone}-800)` }}>{s.title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: `var(--c-${tone}-800)`, lineHeight: 1.4 }}>{s.effect}</Typography>
      </Box>
      <Button size="small" variant="outlined" color="inherit" onClick={onTry} sx={{ flexShrink: 0, color: `var(--c-${tone}-800)`, borderColor: `var(--c-${tone}-200)`, background: 'var(--c-surface)' }}>
        Try it
      </Button>
    </Stack>
  );
}

// ── the two columns ──────────────────────────────────────────────────────────

const REASON: Partial<Record<AtomState, string>> = {
  'no-room': 'No room',
  waits: 'Waits for its parts',
  'out-forced': 'You moved it',
  'in-forced': 'You pulled it in',
};

interface RowProps {
  side: Side;
  depth: number;
  label: React.ReactNode;
  sub?: string;
  sum: NodeSum;
  tonnesText?: string;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  chips?: React.ReactNode;
  marked: boolean;
  onMove?: () => void;
  onClear?: () => void;
  strong?: boolean;
}

function Row({
  side, depth, label, sub, sum, tonnesText, expandable, expanded, onToggle, chips, marked, onMove, onClear, strong,
}: RowProps) {
  const here = side === 'in' ? sum.inAtoms : sum.outAtoms;
  const total = sum.inAtoms + sum.outAtoms;
  const split = here < total;
  return (
    <Stack
      direction="row" alignItems="center" spacing={1}
      sx={{
        pl: `${8 + depth * 18}px`, pr: 1, minHeight: 40, borderTop: '1px solid var(--c-divider)',
        background: strong ? 'var(--c-surface-2)' : 'transparent',
        '&:hover .mf-move': { opacity: 1 },
      }}
    >
      <Box sx={{ width: 24, flexShrink: 0 }}>
        {expandable && (
          <IconButton size="small" onClick={onToggle} aria-label={expanded ? 'Close' : 'Open'} sx={{ p: 0.25 }}>
            <ChevronRightRounded sx={{ fontSize: 18, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />
          </IconButton>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Box>
        {sub && <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }} noWrap>{sub}</Typography>}
      </Box>
      {split && (
        <Tooltip title={side === 'in' ? 'The rest of it is under Later' : 'The rest of it is under This month'}>
          <Chip size="small" variant="outlined" label={`${here} of ${total} here`} sx={{ fontSize: 11.5 }} />
        </Tooltip>
      )}
      {chips}
      {marked && (
        <Chip
          size="small" label="Yours" onDelete={onClear} deleteIcon={<CloseRounded />}
          sx={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)', fontWeight: 500, '& .MuiChip-deleteIcon': { color: 'var(--c-primary-700)', fontSize: 14 } }}
        />
      )}
      {tonnesText && <Mono tabular sx={{ width: 60, textAlign: 'right', color: 'var(--c-text-2)' }}>{tonnesText}</Mono>}
      <Mono tabular sx={{ width: 56, textAlign: 'right' }}>{hours(side === 'in' ? sum.inMin : sum.outMin)}</Mono>
      <Box sx={{ width: 108, flexShrink: 0, textAlign: 'right' }}>
        {onMove && (
          <Button
            className="mf-move" size="small" variant="outlined" onClick={onMove}
            endIcon={side === 'in' ? <ArrowForwardRounded sx={{ fontSize: 15 }} /> : undefined}
            startIcon={side === 'out' ? <ArrowBackRounded sx={{ fontSize: 15 }} /> : undefined}
            sx={{ fontSize: 12, py: 0.25, px: 1, minWidth: 0, whiteSpace: 'nowrap', opacity: strong ? 1 : 0.55 }}
          >
            {side === 'in' ? 'Later' : 'This month'}
          </Button>
        )}
      </Box>
    </Stack>
  );
}

// ── the page ─────────────────────────────────────────────────────────────────

export default function MonthFit() {
  const { toast } = useToast();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const canView = usePermission('fab_erp_planner_view') || admin;
  const canManage = usePermission('fab_erp_planner_manage') || admin;

  const [data, setData] = useState<MonthFitResponse | null>(null);
  const [thisMonth, setThisMonth] = useState<string | null>(null);
  const [which, setWhich] = useState<'this' | 'next'>('this');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [tweaks, setTweaks] = useState<Tweaks>({});
  const [marks, setMarks] = useState<Map<string, MarkState>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const plantRef = useRef<HTMLSpanElement | null>(null);
  const [auto, setAuto] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; }
  });

  const load = useCallback(async (month?: string) => {
    setLoading(true);
    setFailed(null);
    try {
      const res = await getMonthFit(month ? { month } : {});
      setData(res);
      if (!month) setThisMonth(res.month);
      setMarks(new Map(res.marks.map((m) => [`${m.orderId}:${m.poId}:${m.nodeKey}`, m.state])));
      // Orders open to their production orders; deeper is the planner's choice.
      setExpanded((prev) => (prev.size > 0 ? prev : new Set(res.orders.map((o) => `o${o.id}`))));
    } catch (err) {
      setFailed(backendMessage(err, 'Could not read the month.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const pickMonth = (next: 'this' | 'next') => {
    if (!thisMonth || next === which) return;
    setWhich(next);
    setTweaks({});
    void load(next === 'this' ? thisMonth : nextMonthOf(thisMonth));
  };

  const setAutoSaved = (on: boolean) => {
    setAuto(on);
    try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* private window: the switch still works for the session */ }
  };

  const model = useMemo(() => (data ? buildModel(data) : null), [data]);
  const fit: FitResult | null = useMemo(
    () => (model && data ? runFit(model, data.stations, tweaks, marks, auto) : null),
    [model, data, tweaks, marks, auto],
  );
  const advice = useMemo(
    () => (model && data && fit ? suggest(model, data.stations, tweaks, marks, auto, fit) : { keepFed: [], lift: [] }),
    [model, data, fit, tweaks, marks, auto],
  );

  /**
   * Apply marks. `clearUnder` are the ids beneath the row being marked: a
   * person who moves a girder means the whole girder, so older marks on its
   * parts are dropped rather than left to contradict it.
   */
  const applyMarks = useCallback(async (
    changes: Array<{ id: string; state: MarkState | null }>,
  ) => {
    if (!data || changes.length === 0) return;
    const before = marks;
    const next = new Map(marks);
    for (const c of changes) { if (c.state) next.set(c.id, c.state); else next.delete(c.id); }
    setMarks(next);
    try {
      await saveMonthMarks({
        month: data.month,
        marks: changes.map((c) => {
          const [orderId, poId, nodeKey] = c.id.split(':');
          return { orderId: Number(orderId), poId: Number(poId), nodeKey, state: c.state };
        }),
      });
    } catch (err) {
      setMarks(before);
      toast(backendMessage(err, 'That change was not saved.'), 'error');
    }
  }, [data, marks, toast]);

  const idsUnder = (nodes: ModelNode[]): string[] => {
    const out: string[] = [];
    const walk = (n: ModelNode) => { out.push(n.id); n.children.forEach(walk); };
    nodes.forEach(walk);
    return out;
  };
  const moveNode = (n: ModelNode, to: MarkState) => applyMarks([
    ...idsUnder(n.children).filter((id) => marks.has(id)).map((id) => ({ id, state: null })),
    { id: n.id, state: to },
  ]);
  const movePo = (po: ModelPo, to: MarkState) => applyMarks([
    ...idsUnder(po.roots).filter((id) => marks.has(id)).map((id) => ({ id, state: null })),
    { id: po.id, state: to },
  ]);
  const moveOrder = (o: ModelOrder, to: MarkState) => applyMarks(o.pos.flatMap((po) => [
    ...idsUnder(po.roots).filter((id) => marks.has(id)).map((id) => ({ id, state: null as MarkState | null })),
    { id: po.id, state: to as MarkState | null },
  ]));
  const clearAll = () => applyMarks([...marks.keys()].map((id) => ({ id, state: null })));

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!canView) {
    return <Box sx={{ p: 3 }}><Alert severity="warning">You do not have permission to view the plan.</Alert></Box>;
  }

  const bott = fit?.stations.find((s) => s.id === fit.bottleneckId) ?? null;
  const fullest = fit ? [...fit.stations].filter((s) => !s.unbounded).sort((a, b) => b.util - a.util)[0] : null;
  const tweaked = Object.keys(tweaks).length > 0;
  const daysLeft = data ? daysBetween(which === 'this' ? data.today : `${data.month}-01`, data.monthEnd) : 0;

  const renderNode = (n: ModelNode, side: Side, depth: number, due: boolean): React.ReactNode => {
    const sum = fit!.sums.get(n.id);
    if (!sum || (side === 'in' ? sum.inAtoms : sum.outAtoms) === 0) return null;
    const open = expanded.has(n.id);
    const own = n.ownMin > 0 ? fit!.atomState.get(n.id) : undefined;
    // A leaf's reason is its own; a parent's own work (its assembly) gets a
    // reason only on the side that work actually landed on.
    const ownHere = own && (side === 'in') === isIn(own);
    const reason = ownHere ? REASON[own!] : undefined;
    const marked = marks.has(n.id);
    return (
      <Box key={`${side}-${n.id}`}>
        <Row
          side={side} depth={depth} sum={sum}
          label={n.src.kind === 'item' ? <Mono sx={{ fontSize: 12.5 }}>{n.src.label}</Mono> : n.src.label}
          sub={n.src.sub || undefined}
          tonnesText={n.src.tonnes > 0 ? tonnes(n.src.tonnes) : undefined}
          expandable={n.children.length > 0} expanded={open} onToggle={() => toggle(n.id)}
          marked={marked} onClear={canManage ? () => void applyMarks([{ id: n.id, state: null }]) : undefined}
          onMove={canManage ? () => void moveNode(n, side === 'in' ? 'out' : 'in') : undefined}
          chips={reason && !(marked && (own === 'out-forced' || own === 'in-forced')) ? (
            <Chip
              size="small" label={reason}
              sx={own === 'no-room' && due
                ? { background: 'var(--c-danger-50)', color: 'var(--c-danger-800)', fontWeight: 500 }
                : { background: 'var(--c-neutral-50)', color: 'var(--c-neutral-800)' }}
            />
          ) : undefined}
        />
        {open && n.children.map((c) => renderNode(c, side, depth + 1, due))}
      </Box>
    );
  };

  const renderSide = (side: Side) => {
    if (!model || !fit) return null;
    const blocks = model.orders.map((o) => {
      const os = fit.sums.get(o.id);
      if (!os || (side === 'in' ? os.inAtoms : os.outAtoms) === 0) return null;
      const open = expanded.has(o.id);
      const missed = o.due && os.noRoomMin > 0;
      return (
        <Box key={`${side}-${o.id}`}>
          <Row
            side={side} depth={0} sum={os} strong
            label={<>{o.src.orderNumber}{o.src.customerName ? <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-2)' }}> · {o.src.customerName}</Box> : null}</>}
            expandable expanded={open} onToggle={() => toggle(o.id)}
            marked={false}
            onMove={canManage ? () => void moveOrder(o, side === 'in' ? 'out' : 'in') : undefined}
            chips={(
              <>
                {side === 'out' && missed && (
                  <Chip size="small" label={`${hours(os.noRoomMin)} promised, no room`} sx={{ background: 'var(--c-danger-50)', color: 'var(--c-danger-800)', fontWeight: 500 }} />
                )}
                {side === 'in' && fit.aheadOfCutting.has(o.src.id) && (
                  <Tooltip title="More of the fabrication fits this month than of the cutting it depends on. Check the blanks will be ready.">
                    <Chip size="small" label="Ahead of its cutting" sx={{ background: 'var(--c-warning-50)', color: 'var(--c-warning-800)', fontWeight: 500 }} />
                  </Tooltip>
                )}
                <Chip
                  size="small" variant="outlined"
                  label={`${o.src.committedKind === 'must' ? 'Must finish' : 'Due'} ${dayLabel(o.src.committed)}`}
                  sx={o.due ? { borderColor: 'var(--c-warning-600)', color: 'var(--c-warning-800)' } : undefined}
                />
              </>
            )}
          />
          {open && o.pos.map((po) => {
            const ps = fit.sums.get(po.id);
            if (!ps || (side === 'in' ? ps.inAtoms : ps.outAtoms) === 0) return null;
            const poOpen = expanded.has(po.id);
            const poMarked = marks.has(poMarkId(o.src.id, po.src.id));
            return (
              <Box key={`${side}-${po.id}`}>
                <Row
                  side={side} depth={1} sum={ps}
                  label={<>{PURPOSE_LABEL[po.src.purpose]}{po.src.orderNumber ? <Mono sx={{ ml: 1, color: 'var(--c-text-2)' }}>{po.src.orderNumber}</Mono> : null}</>}
                  expandable expanded={poOpen} onToggle={() => toggle(po.id)}
                  marked={poMarked} onClear={canManage ? () => void applyMarks([{ id: po.id, state: null }]) : undefined}
                  onMove={canManage ? () => void movePo(po, side === 'in' ? 'out' : 'in') : undefined}
                />
                {poOpen && po.roots.map((r) => renderNode(r, side, 2, o.due))}
              </Box>
            );
          })}
        </Box>
      );
    }).filter(Boolean);

    const total = model.orders.reduce((a, o) => a + ((side === 'in' ? fit.sums.get(o.id)?.inMin : fit.sums.get(o.id)?.outMin) ?? 0), 0);
    return (
      <Surface sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ px: 2, py: 1.25, background: 'var(--c-surface-2)' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{side === 'in' ? 'This month' : 'Later'}</Typography>
          <Mono tabular sx={{ color: 'var(--c-text-2)' }}>{hours(total)}</Mono>
        </Stack>
        {blocks.length === 0 ? (
          <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-2)', borderTop: '1px solid var(--c-divider)' }}>
            {side === 'in'
              ? (auto ? 'Nothing fits. Look at the stations above.' : 'Auto-fill is off. Pull work in from the right.')
              : 'Everything open fits this month.'}
          </Typography>
        ) : (
          // Its own scroll, so a girder opened to its forty parts does not push
          // the plant off the bottom of the page.
          <Box sx={{ maxHeight: '62vh', overflowY: 'auto' }}>{blocks}</Box>
        )}
      </Surface>
    );
  };

  const markCount = marks.size;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <PageHeader
        title="Month"
        subtitle={data
          ? `What fits in ${which === 'this' ? 'the rest of ' : ''}${monthLabel(data.month)}. ${daysLeft} day${daysLeft === 1 ? '' : 's'} left, counted from the shift calendar.`
          : 'What fits in the rest of the month.'}
        actions={(
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup size="small" exclusive value={which} onChange={(_, v) => v && pickMonth(v)}>
              <ToggleButton value="this">This month</ToggleButton>
              <ToggleButton value="next">Next month</ToggleButton>
            </ToggleButtonGroup>
            <Tooltip title="Refresh">
              <span>
                <IconButton size="small" onClick={() => void load(data?.month)} disabled={loading}>
                  <RefreshRounded fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )}
      />

      {loading && data && <LinearProgress />}
      {failed && <Alert severity="error">{failed}</Alert>}
      {!data && loading && <ListSkeleton rows={8} />}

      {data && fit && data.stations.length === 0 && (
        <EmptyState icon={<PrecisionManufacturingRounded />} title="No machines set up" hint="Add resource types before planning against them." />
      )}

      {data && fit && data.stations.length > 0 && (
        <>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>
            <Tile label="Output this month" value={tonnes(fit.outputTonnes)} hint="Pieces whose remaining work all fits" />
            <Tile label="Cut this month" value={tonnes(fit.cutTonnes)} hint="Blanks on the cutting orders" />
            <Tile
              label="Promised this month"
              value={fit.missedMin > 0 ? hours(fit.missedMin) : 'All fits'}
              hint={fit.missedMin > 0 ? 'of committed work has no room' : 'Every committed piece has room'}
              tone={fit.missedMin > 0 ? 'danger' : 'success'}
            />
            <Tile label="Pulled ahead" value={tonnes(fit.pulledAheadTonnes)} hint="Due later, fits now" />
          </Stack>

          {/* The orders come first: what is in the month is the decision. The
              plant below it is how you change the answer. */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Switch size="small" checked={auto} onChange={(e) => setAutoSaved(e.target.checked)} slotProps={{ input: { 'aria-label': 'Auto-fill' } }} />
              <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>Auto-fill</Typography>
            </Stack>
            <Typography sx={{ flex: 1, minWidth: 240, fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {auto
                ? 'The engine fills the month: promised work first, in date order, then whatever else fits. Rows you move stay where you put them.'
                : 'Nothing moves by itself. Pull in what you want this month.'}
            </Typography>
            {bott && (
              <Chip
                size="small" clickable onClick={() => plantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                label={`${bott.name} limits output`}
                sx={{ background: 'var(--c-primary-100)', color: 'var(--c-primary-900)', fontWeight: 500 }}
              />
            )}
            {markCount > 0 && canManage && (
              <Button size="small" onClick={() => void clearAll()}>Hand all {markCount} back to the engine</Button>
            )}
          </Stack>

          {data.orders.length === 0 ? (
            <EmptyState title="No open work" hint="Deploy a production order and its work appears here." />
          ) : (
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems="flex-start">
              {renderSide('in')}
              {renderSide('out')}
            </Stack>
          )}

          <Typography ref={plantRef} sx={{ fontSize: 15, fontWeight: 600, mt: 1, scrollMarginTop: 96 }}>The plant this month</Typography>
          <Surface sx={{ overflow: 'hidden' }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 2, py: 1, background: 'var(--c-surface-2)', fontSize: 12, fontWeight: 500, color: 'var(--c-text-2)' }}>
              <Box sx={{ width: 220 }}>Station</Box>
              <Box sx={{ width: 92 }}>Machines</Box>
              <Box sx={{ width: 92 }}>Shifts</Box>
              <Box sx={{ flex: 1 }}>Hours used, of hours left this month</Box>
              <Box sx={{ width: 118 }} />
            </Stack>
            {fit.stations.map((st) => (
              <StationRow
                key={st.id} st={st} isBottleneck={st.id === fit.bottleneckId}
                onTweak={(machines, shifts) => setTweaks((prev) => {
                  const next = { ...prev };
                  if (machines === st.baseMachines && shifts === st.baseShifts) delete next[st.id];
                  else next[st.id] = { machines, shifts };
                  return next;
                })}
              />
            ))}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1, borderTop: '1px solid var(--c-divider)' }}>
              <Typography sx={{ flex: 1, fontSize: 12.5, color: 'var(--c-text-2)' }}>
                Machines and shifts here are a what-if. Nothing is saved, and the real plant is changed in Setup.
              </Typography>
              {tweaked && <Button size="small" onClick={() => setTweaks({})}>Back to the real plant</Button>}
            </Stack>
          </Surface>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems="stretch">
            <Surface e={0} sx={{ width: { lg: 280 }, flexShrink: 0, p: 2, background: 'var(--c-primary-50)', borderColor: 'var(--c-primary-200)' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-primary-700)' }}>1. What limits output</Typography>
              <Typography sx={{ fontSize: 19, fontWeight: 600, color: 'var(--c-primary-900)', my: 0.5 }}>
                {bott ? bott.name : 'Nothing yet'}
              </Typography>
              <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: 'var(--c-primary-900)' }}>
                {bott
                  ? `${hours(fit.blocked[bott.id] ?? 0)} of work was turned away because ${bott.name} was full.`
                  : (auto
                    ? `Nothing is being turned away.${fullest ? ` ${fullest.name} is the fullest station and would fill first.` : ''} There is room to take on more.`
                    : 'Auto-fill is off, so nothing is turned away. Turn it on to see the limit.')}
              </Typography>
            </Surface>
            <Surface e={0} sx={{ flex: 1, minWidth: 0, p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-warning-800)' }}>2. First, never let it wait</Typography>
              {advice.keepFed.length === 0
                ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Every other station has room to spare.</Typography>
                : advice.keepFed.map((s) => (
                  <SuggestionCard key={s.id} s={s} tone="warning" onTry={() => setTweaks((p) => ({ ...p, [s.stationId]: s.tweak }))} />
                ))}
            </Surface>
            <Surface e={0} sx={{ flex: 1, minWidth: 0, p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-success-800)' }}>3. Then make it bigger</Typography>
              {advice.lift.length === 0
                ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nothing to lift while nothing is turned away.</Typography>
                : advice.lift.map((s) => (
                  <SuggestionCard key={s.id} s={s} tone="success" onTry={() => setTweaks((p) => ({ ...p, [s.stationId]: s.tweak }))} />
                ))}
            </Surface>
          </Stack>
        </>
      )}
    </Box>
  );
}
