import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  Alert, Box, Button, CircularProgress, Collapse, Menu, MenuItem, Switch, Tooltip, Typography,
} from '@mui/material';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import PanToolRounded from '@mui/icons-material/PanToolRounded';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import { cfApi, LONG_WRITE_MS, CfApiError } from '../../api/client';
import { fileToBase64 } from '../../api/bomSheet';
import {
  downloadCncZip, downloadLotCnc, downloadNestingSheet, previewNestingSheet, saveNestingSheet,
} from '../../api/nesting';
import type {
  Nest, NestCoverage, NestCutPlate, NestGroup, NestSheetResult, NestingAccepted, NestingPlan,
} from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import {
  ACCEPT_AGAIN, ACCEPT_WHAT_HAPPENS, CAPPED_LINE, EFFORTS, progressLine, LOOK_IS_A_LOOK, MANUAL_HELP, NO_MANAGE,
  acceptBody, adviceSentence, adviceTitle, basisWord, colourIndex, cutOrderSentence, dedupeAdvice, driftWords, kg, marginOf,
  marginSentence, mm, mmPair, pct, pieceColour, platePieceKinds, sequenceOver, steelWord, tonnes,
  NO_LAYOUT, anyImported, hasLayout, isImported, lineOffcuts, verdictOf, wasteBreakdown, wasteTotalKg,
  type Effort, type NestingBudget,
} from '../../lib/nesting';
import {
  Badge, CapsLabel, EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows, Surface,
} from '../ui';
import { useToast } from '../toastContext';
import { PlateDrawing } from './PlateDrawing';
import { WasteBar } from './WasteBar';
import { NestSheetDialog } from './NestSheetDialog';

/**
 * THE NESTING SCREEN — a sales order line's rectangles laid out on real plates.
 *
 * Four rules hold it together, and each of them is a decision somebody already
 * took (CF_ERP_NESTING_PLAN.md):
 *
 *   1. A LOOK IS A LOOK. Opening this reads the saved plan. It never re-packs:
 *      re-solving on every open cost the other system a 36-second spinner, and
 *      a saved plan IS the plan the floor cuts to.
 *   2. SUGGEST, THEN ACCEPT. `Nest everything` (or `Nest the rest`) runs the packer and writes
 *      nothing at all; `Accept` is the only thing on this screen that writes.
 *      Until it is pressed, what is on screen is an argument, not a plan.
 *   3. THE SEQUENCES ARE THE POINT. The floor pierces sequence 1 in full, then
 *      2, then 3 — that ordering is why the plan is divided at all — so every
 *      plate is drawn with its sequences banded and numbered in cut order.
 *   4. THE TWO SIZES ARE BOTH SHOWN. What the layout needs and what is bought
 *      are different numbers on purpose: +100 mm of length and +50 mm of width,
 *      because a mill edge is not straight. Reporting only the difference would
 *      read as waste, which it is not.
 *
 * Counting, in the words the API uses: COUNT LOTS FOR PLATES, SUM PLACEMENTS
 * FOR PIECES. One lot is one physical plate; one placement is one piece on it.
 */

/**
 * How long a proposal may take. The packer stops by iteration count, and each
 * steel group may run up to its effort's cap (Standard 5 min, Deep 10 —
 * nestingPacker EFFORT); production has one CPU, so groups can queue. A
 * proposal writes nothing, but one abandoned at 30 s is a screen that never answers.
 */
const NESTING_PLAN_MS = 11 * 60 * 1000;

/** How many plates a steel group draws before it asks. A line can hold a hundred. */
const FIRST_PLATES = 8;
const MORE_PLATES = 12;

/** How many offcuts the line summary lists before it says "more". */
const SHOWN_OFFCUTS = 24;

/** A tinted note — the same one the order's stage screens use, so the app has one voice. */
function Note({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <Box sx={{
      display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, minWidth: 0, fontSize: 13,
      borderRadius: 'var(--r-md)', background: `var(--c-${tone}-50)`, border: `1px solid var(--c-${tone}-200)`, color: `var(--c-${tone}-800)`,
    }}>
      <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>{children}</Box>
    </Box>
  );
}

/** A label/value pair, tight enough to sit four to a row on a plate card. */
function Cell({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  const body = (
    <Box sx={{ minWidth: 0 }}>
      <CapsLabel>{label}</CapsLabel>
      <Box sx={{ fontSize: 13, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
  return title ? <Tooltip title={title} placement="top-start"><Box sx={{ minWidth: 0 }}>{body}</Box></Tooltip> : body;
}

/** One plate: its drawing, its two sizes, its wastage and what is on it. */
function PlateCard({ nest, group, colourOf, onCnc }: {
  nest: Nest; group: NestGroup; colourOf: (id: number) => string;
  /** Present only when this plate has a saved lot and a layout to cut from. */
  onCnc?: () => Promise<void>;
}) {
  const margin = marginOf(nest, group);
  const kinds = platePieceKinds(nest);
  const over = nest.sequences.filter(sequenceOver);
  const verdict = verdictOf(nest.verdict);
  const laidOut = hasLayout(nest);
  const breakdown = laidOut ? wasteBreakdown(nest, nest.sheetArea) : null;
  const wastage = breakdown?.find((b) => b.key === 'wastage');
  const offcuts = nest.offcuts ?? [];
  const reasons = nest.reasons ?? [];
  const [cncBusy, setCncBusy] = useState(false);
  const [details, setDetails] = useState(false);
  const toast = useToast();
  const cnc = async () => {
    if (!onCnc) return;
    setCncBusy(true);
    try { await onCnc(); } catch (e) { toast.error((e as Error).message || 'Could not get the CNC file.'); } finally { setCncBusy(false); }
  };
  return (
    <Surface e={1} sx={{ p: { xs: 1.5, sm: 2 }, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
        <Mono chip>{nest.lotNo ?? '—'}</Mono>
        <Box sx={{ fontSize: 13.5, fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{nest.plateCode ?? nest.plateName ?? 'Unnamed plate'}</Box>
        {nest.source === 'offcut' && <Badge family="success" label="Offcut" title="Left over from another plate, so it costs no new steel." />}
        {isImported(nest)
          ? <Badge family="info" label="Imported" noIcon title="Brought in from the Excel sheet." />
          : <Badge family="neutral" label="Automatic" noIcon title="Laid out by our packer." />}
        {verdict && <Badge family={verdict.family} label={verdict.label} title={verdict.help} />}
        {nest.forced && <Badge family="warning" label="Saved anyway" noIcon title="Saved although our check did not say it fits." />}
        {onCnc && (
          <Box sx={{ ml: 'auto' }}>
            <Button size="small" onClick={cnc} disabled={cncBusy}
              startIcon={cncBusy ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />}>
              CNC file
            </Button>
          </Box>
        )}
      </Box>

      {(reasons.length > 0 || nest.verdict === 'tight') && (
        <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5, color: 'var(--c-text-2)', display: 'grid', gap: 0.3, overflowWrap: 'anywhere' }}>
          {nest.verdict === 'tight' && !reasons.includes(verdict?.help ?? '') && <li>{verdict?.help}</li>}
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </Box>
      )}

      {laidOut
        ? <PlateDrawing nest={nest} colourOf={colourOf} />
        : <Note tone="warning"><Box>{`${mmPair(nest.length, nest.width)} plate. ${NO_LAYOUT}`}</Box></Note>}

      <Box sx={{
        display: 'grid', gap: 1.25, minWidth: 0,
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
      }}>
        <Cell label="Needs" title="What the layout takes up, with one kerf cut off each rim.">
          <Mono>{mmPair(nest.requiredLength, nest.requiredWidth)}</Mono>
        </Cell>
        <Cell label="Plate bought" title="The stocked plate this lot is cut from. The shop always buys a stocked size, so this IS what is purchased — the spare over what the layout needs is deliberate, because mill edges are not straight.">
          <Mono>{mmPair(nest.length, nest.width)}</Mono>
        </Cell>
        <Cell label="Margin" title={marginSentence(margin)}>
          {margin.length == null ? <Mono muted>—</Mono> : (
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
              <Mono>{`+${mm(margin.length)} / +${mm(margin.width)}`}</Mono>
              {margin.short && <Badge family="danger" label="Too small" noIcon />}
              {!margin.short && margin.thin && <Badge family="warning" label="Thin" noIcon title={`The shop asks for +${mm(margin.wantLength)} length and +${mm(margin.wantWidth)} width.`} />}
            </Box>
          )}
        </Cell>
        {wastage
          ? (
            <Cell label="Wastage" title="Scrap: what is left after the parts, kerf, sequence gaps, rim and offcuts.">
              <Mono>{`${kg(wastage.kg)} kg · ${pct(wastage.pct)}`}</Mono>
            </Cell>
          )
          : (
            <Cell label="Wastage" title="The plate bought, less the rectangles on it.">
              <Mono>{`${kg(wasteTotalKg(nest))} kg · ${pct(nest.wastePct)}`}</Mono>
            </Cell>
          )}
      </Box>

      {breakdown && <WasteBar parts={breakdown} />}

      {offcuts.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.4, minWidth: 0 }}>
          <CapsLabel>{`Offcuts (${offcuts.length})`}</CapsLabel>
          {offcuts.map((o) => (
            <Box key={o.offcutNo} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12.5, minWidth: 0 }}>
              <Mono>{o.offcutNo}</Mono>
              <Box component="span" sx={{ color: 'var(--c-text-2)' }}>
                {o.rect ? `usable ${mmPair(o.rect.length, o.rect.width)}` : 'odd shape'}
              </Box>
              <Mono muted>{`${kg(o.weightKg)} kg`}</Mono>
            </Box>
          ))}
        </Box>
      )}

      {over.length > 0 && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
          {`Sequence ${over.map((s) => s.seqNo).join(', ')} holds more rows than its part size allows — a sequence of small parts holds 2 rows, one with anything big holds 3.`}
        </Typography>
      )}

      <Box sx={{ minWidth: 0 }}>
        <Button size="small" onClick={() => setDetails((d) => !d)} endIcon={details ? <ExpandLessRounded /> : <ExpandMoreRounded />}>
          Details
        </Button>
        <Collapse in={details} unmountOnExit>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0, pt: 0.75 }}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{cutOrderSentence(nest)}</Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
              {kinds.map((k) => (
                <Box key={k.cutPlateId} sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, maxWidth: '100%',
                  background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.25,
                }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: colourOf(k.cutPlateId), flexShrink: 0 }} />
                  <Mono sx={{ overflowWrap: 'anywhere' }}>{k.cutPlateCode}</Mono>
                  <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', flexShrink: 0 }}>{`×${k.count}`}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Collapse>
      </Box>
    </Surface>
  );
}

/** One steel — thickness, grade and material together, never thickness alone. */
function GroupCard({ group, colourOf, open, onToggle, cncFor }: {
  group: NestGroup; colourOf: (id: number) => string; open: boolean; onToggle: () => void;
  cncFor: (nest: Nest) => (() => Promise<void>) | undefined;
}) {
  const [shown, setShown] = useState(FIRST_PLATES);
  const m = group.metrics;
  const breakdown = wasteBreakdown(m, m.areaBought);
  const wastage = breakdown?.find((b) => b.key === 'wastage');
  const plates = group.nests.slice(0, open ? shown : 0);
  return (
    <SectionCard
      title={<Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span>{steelWord(group)}</span>
        <Mono muted>{`${m.plates} ${m.plates === 1 ? 'plate' : 'plates'} · ${m.pieces} pieces`}</Mono>
        <Tooltip title={`Kerf ${mm(group.kerfMm)} mm, charged at the rim as well as between pieces · sequence gap ${mm(group.seqGapMinMm)}–${mm(group.seqGapMaxMm)} mm · ${group.settingsBasis}`}>
          <InfoOutlined aria-label="Cutting settings" sx={{ fontSize: 16, color: 'var(--c-text-3)', alignSelf: 'center' }} />
        </Tooltip>
      </Box>}
      actions={group.nests.length > 0
        ? (
          <Button size="small" onClick={onToggle} endIcon={open ? <ExpandLessRounded /> : <ExpandMoreRounded />}>
            {open ? 'Hide the plates' : `Draw the ${group.nests.length} ${group.nests.length === 1 ? 'plate' : 'plates'}`}
          </Button>
        )
        : undefined}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
        <Box sx={{
          display: 'grid', gap: 1.25, minWidth: 0,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
        }}>
          <Cell label="Steel bought"><Mono>{`${tonnes(m.weightKg)} t`}</Mono></Cell>
          <Cell label="Wastage" title="Every plate of this steel, added up.">
            <Mono>{wastage ? `${kg(wastage.kg)} kg · ${pct(wastage.pct)}` : `${kg(wasteTotalKg(m))} kg · ${pct(m.wastePct)}`}</Mono>
          </Cell>
          <Cell label="Rectangles"><Mono>{group.cutPlates.length}</Mono></Cell>
          {/* Which plates the catalog offered is a fact about the RUN, not about
              the lots, so a saved plan does not have it and must not print 0. */}
          {group.candidates.length > 0 && (
            <Cell label="Plates offered" title="Catalog plates of this thickness whose grade and material do not contradict the rectangles'.">
              <Mono>{group.candidates.length}</Mono>
            </Cell>
          )}
        </Box>

        {breakdown && <WasteBar parts={breakdown} compact />}

        {group.unplaced.length > 0 && (
          <Note tone="warning">
            <Box><strong>{`${group.unplaced.length} ${group.unplaced.length === 1 ? 'rectangle' : 'rectangles'} could not be placed on this steel.`}</strong></Box>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
              {group.unplaced.map((u) => (
                <li key={`${u.cutPlateId}-${u.reason}`}>
                  <Mono>{u.cutPlateCode}</Mono>{` ×${u.qty} — ${u.reason}`}
                </li>
              ))}
            </Box>
          </Note>
        )}

        {group.nests.length === 0
          ? <EmptyState icon={<GridViewRounded />} title="No plate carries this steel" hint="Nothing was laid out here. The reasons are listed above." />
          : open && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
                {plates.map((n) => <PlateCard key={n.id ?? n.lotNo ?? `${n.plateItemId}`} nest={n} group={group} colourOf={colourOf} onCnc={cncFor(n)} />)}
              </Box>
              {shown < group.nests.length && (
                <Button size="small" variant="outlined" onClick={() => setShown((s) => s + MORE_PLATES)}>
                  {`Draw ${Math.min(MORE_PLATES, group.nests.length - shown)} more — ${group.nests.length - shown} still hidden`}
                </Button>
              )}
            </>
          )}
      </Box>
    </SectionCard>
  );
}

export function NestingPanel({ orderId, lineId, canManage, onChanged }: {
  orderId: number;
  lineId: number;
  /** The sales-order grant. Without it the screen is a look, and says so. */
  canManage: boolean;
  /** Accepting rewrites what the order will buy, so the page around it reloads. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const path = `/orders/${orderId}/lines/${lineId}/nesting`;
  // THE SAVED PLAN, READ ON OPEN. This is the only request the screen makes by
  // itself, and it does not re-pack.
  const saved = useLoad(() => cfApi.get<NestingPlan>(path), [path]);
  const [proposal, setProposal] = useState<NestingPlan | null>(null);
  // true when the proposal re-nests the whole line, imported nests included.
  const [replaceAll, setReplaceAll] = useState(false);
  const [effort, setEffort] = useState<Effort>('standard');
  const [busy, setBusy] = useState<'plan' | 'accept' | null>(null);
  const [manualBusy, setManualBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // THE SHEET. Upload reads it (dryRun) and shows what it would do; only Save writes.
  const [sheet, setSheet] = useState<{ name: string; base64: string; result: NestSheetResult } | null>(null);
  const [fileBusy, setFileBusy] = useState<'download' | 'preview' | 'save' | 'cnc' | null>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const [effortAnchor, setEffortAnchor] = useState<HTMLElement | null>(null);
  // The run being waited for; Cancel bumps it so a late answer is ignored.
  const runId = useRef(0);
  const [waited, setWaited] = useState(0);
  const [packing, setPacking] = useState<number | null>(null);
  const [capped, setCapped] = useState(false);
  useEffect(() => {
    if (busy !== 'plan') return undefined;
    setWaited(0);
    const t0 = Date.now();
    const timer = window.setInterval(() => setWaited(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [offcutsOpen, setOffcutsOpen] = useState(false);

  const plan = proposal ?? saved.data;
  const lineName = plan ? `${plan.line.orderCode}_line${plan.line.lineNo}` : `line${lineId}`;

  const downloadSheet = async () => {
    setFileBusy('download'); setActionError(null);
    try { await downloadNestingSheet(orderId, lineId, lineName); } catch (e) { setActionError(e as CfApiError); } finally { setFileBusy(null); }
  };

  const downloadCnc = async () => {
    setFileBusy('cnc'); setActionError(null);
    try { await downloadCncZip(orderId, lineId, lineName); } catch (e) { setActionError(e as CfApiError); } finally { setFileBusy(null); }
  };

  /** A cell problem comes back as a 422 with a problems list — shown in the dialog like any other. */
  const blockedBy = (e: unknown): NestSheetResult | null => (e instanceof CfApiError && e.problems.length
    ? { applied: false, canSave: false, needsForce: false, problems: e.problems, nests: [], coverage: [] }
    : null);

  const chooseSheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileBusy('preview'); setActionError(null);
    let base64 = '';
    try {
      base64 = await fileToBase64(file);
      const result = await previewNestingSheet(orderId, lineId, base64, file.name);
      setSheet({ name: file.name, base64, result });
    } catch (e) {
      const result = blockedBy(e);
      if (result) setSheet({ name: file.name, base64, result });
      else setActionError(e as CfApiError);
    } finally { setFileBusy(null); }
  };

  const saveSheet = async (force: boolean) => {
    if (!sheet) return;
    setFileBusy('save');
    try {
      await saveNestingSheet(orderId, lineId, sheet.base64, sheet.name, force);
      setSheet(null);
      setProposal(null);
      saved.reload();
      onChanged?.();
      toast.success('Sheet saved. Its plates replace the ones this line had.');
    } catch (e) {
      const result = blockedBy(e);
      if (result) setSheet({ ...sheet, result });
      else { setSheet(null); setActionError(e as CfApiError); }
    } finally { setFileBusy(null); }
  };

  /**
   * A plate's own DXF — only for a saved lot that says it has a layout. The
   * route answers NO_LAYOUT otherwise, and an older API (no hasLayout) has no route.
   */
  const cncFor = (n: Nest) => (!proposal && plan?.saved && n.id != null && n.hasLayout === true
    ? () => downloadLotCnc(orderId, lineId, n.id as number, n.lotNo)
    : undefined);
  const colours = useMemo(() => (plan ? colourIndex(plan) : new Map<number, number>()), [plan]);
  const colourOf = useCallback((id: number) => pieceColour(colours.get(id) ?? id), [colours]);

  const propose = async (replaceImported = false) => {
    const mine = ++runId.current;
    setBusy('plan'); setActionError(null); setCapped(false);
    setPacking(plan ? (plan.groups.reduce((a, g) => a + g.cutPlates.reduce((b, c) => b + (c.pieces ?? 0), 0), 0) || null) : null);
    try {
      const out = await cfApi.post<NestingPlan>(`${path}/plan`, { effort, ...(replaceImported ? { replaceImported: true } : {}) }, { timeoutMs: NESTING_PLAN_MS });
      if (mine !== runId.current) return;
      setCapped(!!(out as NestingPlan & { budget?: NestingBudget }).budget?.capped);
      setProposal(out);
      setReplaceAll(replaceImported);
      setOpenGroup(out.groups.find((g) => g.nests.length)?.key ?? null);
      toast.success(`${out.totals.plates} plates, ${out.totals.pieces} pieces. Nothing is written until you accept it.`);
    } catch (e) { if (mine === runId.current) setActionError(e as CfApiError); } finally { if (mine === runId.current) setBusy(null); }
  };

  const cancelPlan = () => {
    runId.current += 1;
    setBusy(null);
    toast.info('Stopped waiting. The server may still finish, but nothing is written.');
  };

  const accept = async () => {
    if (!proposal) return;
    setBusy('accept'); setActionError(null);
    try {
      const out = await cfApi.post<NestingAccepted>(`${path}/accept`, { ...acceptBody(proposal), ...(replaceAll ? { replaceImported: true } : {}) }, { timeoutMs: LONG_WRITE_MS });
      setProposal(null);
      saved.reload();
      onChanged?.();
      toast.success(`${out.plates} plates and ${out.pieces} pieces written${out.replacedLots ? `, replacing ${out.replacedLots}` : ''}.`);
    } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };

  /**
   * NEST_MANUAL is a specification value on the cut plate itself, written the
   * way every other value on this app is written. It only takes a rectangle out
   * of the pack — it changes nothing that is already saved — so the proposal on
   * screen is dropped rather than left describing a world that has moved.
   */
  const setManual = async (cp: NestCutPlate, next: boolean) => {
    setManualBusy(cp.id); setActionError(null);
    try {
      await cfApi.put(`/records/${cp.id}/values`, { values: [{ specCode: 'NEST_MANUAL', value: next }] });
      setProposal(null);
      saved.reload();
      toast.success(next
        ? `${cp.code ?? cp.name} is left out of automatic nesting. Bring it in with the Excel sheet.`
        : `${cp.code ?? cp.name} goes back into automatic nesting. Nest again to place it.`);
    } catch (e) { setActionError(e as CfApiError); } finally { setManualBusy(null); }
  };

  if (saved.error) return <ErrorNotice error={saved.error} onRetry={saved.reload} />;
  if (!plan) {
    return (
      <SectionCard title="Nesting" subtitle="Laying this line's rectangles out on the plates they are cut from.">
        <SkeletonRows rows={4} height={52} />
      </SectionCard>
    );
  }

  const basis = basisWord(plan);
  const t = plan.totals;
  const everyCutPlate: NestCutPlate[] = [
    ...plan.groups.flatMap((g) => g.cutPlates),
    ...plan.manual,
  ].filter((cp, i, all) => all.findIndex((x) => x.id === cp.id) === i)
    .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
  const manualIds = new Set(plan.manual.map((cp) => cp.id));
  const unplaced = plan.groups.flatMap((g) => g.unplaced);
  const advice = dedupeAdvice(plan.sizeAdvice);
  // Drift only means something against a plan that EXISTS. The API answers it
  // for an empty line too, where every rectangle is "needs n, placed 0" — which
  // is not drift, it is simply not nested yet, and saying so would be a lie.
  const drift = plan.saved ? (plan.drift ?? []) : [];

  const imported = anyImported(plan);
  // The CNC routes arrived with hasLayout; an API that does not send it has neither.
  const cncKnown = plan.groups.some((g) => g.nests.some((n) => n.hasLayout != null));
  const nestLabel = imported ? 'Nest the rest' : 'Nest everything';
  const breakdown = wasteBreakdown(t, t.areaBought);
  const wastage = breakdown?.find((b) => b.key === 'wastage');
  const cuts = lineOffcuts(plan);
  const allOffcuts = plan.groups.flatMap((g) => g.nests.flatMap((n) => (n.offcuts ?? []).map((o) => ({ ...o, lotNo: n.lotNo }))));
  const wasteKgNow = wastage ? wastage.kg : wasteTotalKg(t);
  const wastePctNow = wastage ? wastage.pct : t.wastePct;

  const covered = ((plan as NestingPlan & { coverage?: NestCoverage[] }).coverage ?? []);
  const shortPieces = covered.reduce((a, c) => a + (c.diff < 0 ? -c.diff : 0), 0);
  const showShort = !proposal && plan.saved && imported && shortPieces > 0;
  const summary = [
    `${t.plates} ${t.plates === 1 ? 'plate' : 'plates'}`,
    `${t.pieces} ${t.pieces === 1 ? 'piece' : 'pieces'}`,
    `${tonnes(t.weightKg)} t`,
    breakdown ? `${pct(wastePctNow)} wastage` : `${kg(wasteKgNow)} kg wastage`,
    ...(breakdown ? [`${cuts.count} ${cuts.count === 1 ? 'offcut' : 'offcuts'}`] : []),
  ].join(' · ');

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <SectionCard
        title="Nesting"
        subtitle={`Line ${plan.line.lineNo} of ${plan.line.orderCode} · plate → sequence → row → part, and the floor cuts in that order.`}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title="The nests as a sheet. Fill it from your nesting program and upload it back.">
              <span>
                <Button variant="outlined" disabled={fileBusy != null || busy != null} onClick={downloadSheet}
                  startIcon={fileBusy === 'download' ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />}>
                  Download Excel
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={canManage ? 'Bring in nests from your nesting program. You see a check before anything is saved.' : NO_MANAGE}>
              <span>
                <Button variant="outlined" disabled={!canManage || fileBusy != null || busy != null} onClick={() => sheetInput.current?.click()}
                  startIcon={fileBusy === 'preview' ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}>
                  Upload Excel
                </Button>
              </span>
            </Tooltip>
            <input ref={sheetInput} type="file" accept=".xlsx" hidden onChange={chooseSheet} />
            <Tooltip title={imported
              ? 'Lays out what the imported nests do not cover. Imported plates stay. Nothing is written until you accept.'
              : 'Lays out every cut plate on the line. Nothing is written until you accept.'}>
              <span>
                <Button variant={proposal ? 'outlined' : 'contained'} disabled={busy != null || fileBusy != null}
                  startIcon={busy === 'plan' ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded />}
                  onClick={() => propose(false)}>
                  {nestLabel}
                </Button>
              </span>
            </Tooltip>
            <Button size="small" variant="outlined" aria-label="Effort" disabled={busy != null || fileBusy != null}
              onClick={(e) => setEffortAnchor(e.currentTarget)} endIcon={<ExpandMoreRounded />}
              sx={{ borderRadius: 999, px: 1.25, py: 0.25, fontSize: 12.5 }}>
              {EFFORTS.find((x) => x.value === effort)?.label}
            </Button>
            <Menu anchorEl={effortAnchor} open={!!effortAnchor} onClose={() => setEffortAnchor(null)}>
              {EFFORTS.map((e) => (
                <MenuItem key={e.value} selected={e.value === effort} onClick={() => { setEffort(e.value); setEffortAnchor(null); }}>
                  <Box>
                    <Box sx={{ fontSize: 13.5, fontWeight: 500 }}>{e.label}</Box>
                    <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{e.help}</Box>
                  </Box>
                </MenuItem>
              ))}
            </Menu>
            {imported && (
              <Tooltip title="Lays out the whole line again, automatically. Accepting it replaces the imported nests too.">
                <span>
                  <Button variant="text" disabled={busy != null || fileBusy != null} onClick={() => propose(true)}>
                    Redo all automatically
                  </Button>
                </span>
              </Tooltip>
            )}
            {plan.saved && !proposal && t.plates > 0 && cncKnown && (
              <Tooltip title="One DXF per plate, for the CNC nesting software, in a zip.">
                <span>
                  <Button variant="outlined" disabled={fileBusy != null || busy != null} onClick={downloadCnc}
                    startIcon={fileBusy === 'cnc' ? <CircularProgress size={14} color="inherit" /> : <PrecisionManufacturingRounded />}>
                    Download CNC files
                  </Button>
                </span>
              </Tooltip>
            )}
          </Box>
        )}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge family={basis.family} label={basis.label} title={basis.help} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 260px', minWidth: 0 }}>
              {proposal ? 'Nothing here is written down yet. Read it, then accept it or nest again.' : LOOK_IS_A_LOOK}
            </Typography>
          </Box>
          {plan.settingsNote && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{plan.settingsNote}</Typography>}
          {busy === 'plan' && (
            <Box role="status" sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
              <span>{progressLine(packing, waited, effort)}</span>
              <Button size="small" variant="text" onClick={cancelPlan}>Cancel</Button>
              <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>Cancel only stops waiting; the server may finish anyway.</span>
            </Box>
          )}
          {proposal && capped && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{CAPPED_LINE}</Typography>}
          <ErrorNotice error={actionError} sx={{ mb: 0 }} />
          {/*
            The commitment is laid out BEFORE the button that makes it, not
            after — and the button sits here rather than in the card's header so
            it wraps with the words instead of running off a narrow screen.
          */}
          {proposal && (
            <>
              <Note>
                <Box><strong>Accepting writes it down.</strong></Box>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4 }}>
                  {ACCEPT_WHAT_HAPPENS.map((x) => <li key={x}>{x}</li>)}
                </Box>
                <Box>{ACCEPT_AGAIN}</Box>
              </Note>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                <Tooltip title={canManage ? 'Writes this layout down. It becomes what the shop cuts to and what the order buys.' : NO_MANAGE}>
                  <span>
                    <Button variant="contained" color="primary" disabled={!canManage || busy != null || t.plates === 0}
                      startIcon={busy === 'accept' ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
                      onClick={accept}>
                      Accept this layout
                    </Button>
                  </span>
                </Tooltip>
                <Button size="small" startIcon={<UndoRounded />} onClick={() => { setProposal(null); setActionError(null); }} disabled={busy != null}>
                  Back to what is saved
                </Button>
              </Box>
            </>
          )}
          {!canManage && <Note tone="warning"><Box>{NO_MANAGE}</Box></Note>}
        </Box>
      </SectionCard>

      {showShort && (
        <Note tone="warning">
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
              <strong>{`${shortPieces} ${shortPieces === 1 ? 'piece is' : 'pieces are'} not nested yet.`}</strong>
            </Box>
            <Button variant="contained" color="warning" disabled={!canManage || busy != null || fileBusy != null}
              startIcon={busy === 'plan' ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded />}
              onClick={() => propose(false)}>
              {`Nest the ${shortPieces} short ${shortPieces === 1 ? 'piece' : 'pieces'} now`}
            </Button>
          </Box>
        </Note>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 14, fontWeight: 500 }}>
          {summary}
          {t.unplaced > 0 && <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>{` · ${t.unplaced} not placed`}</Box>}
        </Box>
        {breakdown && <WasteBar parts={breakdown} />}
        {allOffcuts.length > 0 && (
          <Box sx={{ minWidth: 0 }}>
            <Button size="small" onClick={() => setOffcutsOpen((o) => !o)} endIcon={offcutsOpen ? <ExpandLessRounded /> : <ExpandMoreRounded />}>
              {`Offcuts (${allOffcuts.length})`}
            </Button>
            <Collapse in={offcutsOpen} unmountOnExit>
              <Box sx={{ display: 'grid', gap: 0.4, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, minWidth: 0, pt: 0.5 }}>
                {allOffcuts.slice(0, SHOWN_OFFCUTS).map((o) => (
                  <Box key={o.offcutNo} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12.5, minWidth: 0 }}>
                    <Mono>{o.offcutNo}</Mono>
                    <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{o.rect ? mmPair(o.rect.length, o.rect.width) : 'odd shape'}</Box>
                    <Mono muted>{`${kg(o.weightKg)} kg`}</Mono>
                  </Box>
                ))}
              </Box>
              {allOffcuts.length > SHOWN_OFFCUTS && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', pt: 0.5 }}>
                  {`${allOffcuts.length - SHOWN_OFFCUTS} more — each is listed on its plate.`}
                </Typography>
              )}
            </Collapse>
          </Box>
        )}
      </Box>

      {plan.problems.length > 0 && (
        <Alert severity="warning">
          <Box sx={{ fontWeight: 600, mb: 0.5 }}>Some rectangles were left out of the pack.</Box>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
            {plan.problems.map((p) => <li key={p}>{p}</li>)}
          </Box>
        </Alert>
      )}

      {drift.length > 0 && (
        <SectionCard title="This layout is out of date"
          subtitle="The structure changed after this layout was accepted, so these rectangles no longer match it. The layout is still exactly what was agreed — nest the line again so the plates it buys match what it cuts.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
            {drift.map((d) => (
              <Box key={d.cutPlateId} sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                <Mono>{d.code ?? 'A cut piece'}</Mono>{driftWords(d)}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}

      {unplaced.length > 0 && (
        <SectionCard title={`${unplaced.length} ${unplaced.length === 1 ? 'rectangle' : 'rectangles'} could not be placed`}
          subtitle="Each one says why. A layout cannot be accepted while anything the line needs is missing from it.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
            {unplaced.map((u) => (
              <Box key={`${u.cutPlateId}-${u.reason}`} sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                <Mono>{u.cutPlateCode}</Mono>{` ×${u.qty} — ${u.reason}`}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}

      {/* Which rectangles the packer is allowed to touch. */}
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
        <Tooltip title={MANUAL_HELP}>
          <span>{`${plan.manual.length} left out of automatic nesting`}</span>
        </Tooltip>
        <span>·</span>
        <Button size="small" onClick={() => setLeaveOpen((o) => !o)}>{leaveOpen ? 'Hide' : 'Change'}</Button>
      </Box>
      <Collapse in={leaveOpen} unmountOnExit>
      <SectionCard title="Leave out of automatic nesting" subtitle={MANUAL_HELP}
        actions={<Badge family={plan.manual.length ? 'warning' : 'neutral'} label={`${plan.manual.length} left out`} noIcon />}>
        {everyCutPlate.length === 0
          ? (
            <EmptyState icon={<PanToolRounded />}
              title={plan.saved ? 'No cut plates on this line' : 'Nothing to list yet'}
              hint={plan.saved
                ? 'A line has rectangles to nest once its structure has plate parts under it.'
                : 'The cut plates appear here once the line has been nested, each with a switch.'} />
          )
          : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0, minWidth: 0 }}>
              {everyCutPlate.map((cp) => {
                const isManual = manualIds.has(cp.id);
                return (
                  <Box key={cp.id} sx={{
                    display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(0, 1fr) 150px auto' },
                    alignItems: 'center', columnGap: 1.5, rowGap: 0.25, py: 1, borderBottom: '1px solid var(--c-divider)', minWidth: 0,
                  }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', minWidth: 0 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: colourOf(cp.id), flexShrink: 0 }} />
                        <Mono sx={{ overflowWrap: 'anywhere' }}>{cp.code ?? cp.name}</Mono>
                      </Box>
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                        {`${mmPair(cp.length, cp.width)} · ${mm(cp.thickness)} mm ${cp.grade ?? ''} ${cp.material ?? ''}`.trim()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 12.5, color: 'var(--c-text-2)' }}>
                      <Mono>{cp.pieces}</Mono>{cp.pieces === 1 ? ' piece' : ' pieces'}
                    </Box>
                    <Tooltip title={canManage
                      ? (isManual ? 'Put it back into automatic nesting.' : 'Leave it out of automatic nesting.')
                      : NO_MANAGE}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: 'end' }}>
                        {manualBusy === cp.id && <CircularProgress size={14} />}
                        <Switch size="small" checked={isManual} disabled={!canManage || manualBusy != null}
                          slotProps={{ input: { 'aria-label': `Leave ${cp.code ?? cp.name} out of automatic nesting` } }}
                          onChange={(e) => setManual(cp, e.target.checked)} />
                      </Box>
                    </Tooltip>
                  </Box>
                );
              })}
            </Box>
          )}
      </SectionCard>
      </Collapse>

      {plan.groups.length === 0
        ? (
          <SectionCard title="Nothing is laid out yet">
            <EmptyState icon={<GridViewRounded />} title={plan.saved ? 'This line has no plates' : 'No layout has been proposed'}
              hint={plan.saved
                ? 'Nothing was written for this line.'
                : 'Nest everything, or upload a sheet from your nesting program. Nothing is written until you accept or save.'} />
          </SectionCard>
        )
        : plan.groups.map((g) => (
          <GroupCard key={g.key} group={g} colourOf={colourOf} cncFor={cncFor}
            open={openGroup === g.key}
            onToggle={() => setOpenGroup((k) => (k === g.key ? null : g.key))} />
        ))}

      {plan.sizeAdvice.length > 0 && (
        <SectionCard title="The size the catalogue should have offered"
          subtitle="Waste that belongs to the plate list rather than to the layout: a size nobody stocks that would have fitted, or a stocked plate too tight to carry the ordering margin.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
            {advice.slice(0, 20).map(({ advice: a, count }, i) => (
              <Box key={`${a.kind ?? 'catalog'}-${a.plateCode ?? a.sheetKey ?? i}-${i}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', minWidth: 0 }}>
                <LightbulbOutlined sx={{ fontSize: 17, mt: '2px', color: 'var(--c-warning-600)', flexShrink: 0 }} aria-hidden />
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>
                    {adviceTitle(a)}{count > 1 ? ` · on ${count} plates` : ''}
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{adviceSentence(a)}</Typography>
                </Box>
              </Box>
            ))}
            {advice.length > 20 && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                {`${advice.length - 20} more plates have advice of their own.`}
              </Typography>
            )}
          </Box>
        </SectionCard>
      )}

      <NestSheetDialog open={!!sheet} fileName={sheet?.name ?? ''} result={sheet?.result ?? null}
        busy={fileBusy === 'save'} onClose={() => setSheet(null)} onSave={saveSheet} />
    </Box>
  );
}
