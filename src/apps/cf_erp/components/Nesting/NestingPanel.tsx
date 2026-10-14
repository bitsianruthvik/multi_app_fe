import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import {
  Alert, Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Switch, Tooltip, Typography,
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
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import { cfApi, LONG_WRITE_MS, CfApiError } from '../../api/client';
import { fileToBase64 } from '../../api/bomSheet';
import {
  discardNestRun, downloadCncZip, downloadCustomerFile, downloadLotCnc, downloadNestingSheet, getNestFiles, getNestRun, getNestingChoices,
  removeNestLot, setNestPlates, startNestRun, stopNestRun,
  type NestExtras, type NestFileCoverage, type NestFileUpload, type NestFilesInfo, type NestFilesResult,
} from '../../api/nesting';
import type {
  Nest, NestCutPlate, NestGroup, NestRunSnapshot, NestingAccepted, NestingChoices, NestingPlan, PlateChoice,
} from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import {
  ACCEPT_AGAIN, ACCEPT_WHAT_HAPPENS, CAPPED_LINE, offlineLine, LOOK_IS_A_LOOK, MANUAL_HELP, NO_MANAGE, PLATES_NOT_CHOSEN, STEEL_BLOCKED,
  acceptBody, adviceSentence, choicesLine, adviceTitle, basisWord, colourIndex, cutOrderSentence, dedupeAdvice, driftWords, kg, marginOf,
  marginSentence, mm, mmPair, RUN_INTERRUPTED, runSummary, pct, pieceColour, platePieceKinds, sequenceOver, steelWord, tonnes,
  NO_LAYOUT, isFreeLayout, anyImported, hasLayout, isImported, lineOffcuts, verdictOf, wasteBreakdown, wasteTotalKg, wasteShown, wasteShownWord, WASTE_SHOWN_HELP,
  dropOnly, isCustomerPlate, isNestFile, isProNestPlate, nestAccept, nestKinds, originLine, ourPieceCount, pieceCounts, plateSource, restOf,
  SHAPE_SOURCE_WORDS, shapeSourceOnPlate, shapeSources, startSentence,
  type Effort, type NestingBudget, type ShapeSource, type StartMode,
} from '../../lib/nesting';
import {
  Badge, CapsLabel, EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows, Surface,
} from '../ui';
import { useToast } from '../toastContext';
import { PlateDiagram, PlateRuleBadge, PlateThumb } from './PlateDiagram';
import { NestChoices } from './NestChoices';
import { WasteBar } from './WasteBar';
import { NestFilesDialog } from './NestFilesDialog';
import { Additions, RestSummary } from './NestRest';
import { NestMoney } from './NestMoney';
import { CutPiecesButton } from './CutPiecesDialog';
import { NestRunCard, NestRunLog } from './NestRunCard';
import { NestDoors } from './NestDoors';
import { NestStartDialog, PlatesToUse } from './NestStartDialog';
import { NestMoreMenu, type MoreAction } from './NestMoreMenu';
import { LeftOverBanner, NestSummaryStrip, type LeftOverRow, type SummaryFigure } from './NestSummary';
import { SectionNestingPanel } from './SectionNestingPanel';
import { CutPlateDrawingButton } from '../Drawings/RowDrawingViewer';
import { LineDrawingContext } from '../../hooks/lineDrawingContext';

/**
 * THE NESTING SCREEN — a sales order line's cut pieces laid out on real plates.
 *
 * TWO WAYS IN, AND ONLY TWO (2026-10-13): the shop's own nesting is uploaded —
 * ProNest job files (.nif) or DXFs, the main door, NestFilesDialog checks them —
 * or we nest it ourselves (NestStartDialog starts the run). The comparison of
 * the two was taken off the screen the same day (NestCompareDialog is kept,
 * unmounted). While nothing is nested the screen is those two doors
 * (NestDoors); once something is, it is one summary strip and the plates, with
 * a banner for what is left over. Everything else is in the More menu. The Excel
 * sheet upload was retired from this screen the same day (its download stays,
 * for reference); NestSheetDialog and the API helpers are kept, unused.
 *
 * Four rules hold it together, and each of them is a decision somebody already
 * took (CF_ERP_NESTING_PLAN.md):
 *
 *   1. A LOOK IS A LOOK. Opening this reads the saved plan. It never re-packs:
 *      re-solving on every open cost the other system a 36-second spinner, and
 *      a saved plan IS the plan the floor cuts to.
 *   2. SUGGEST, THEN ACCEPT. A run of ours packs and writes nothing at all;
 *      `Use this nesting` (accept) and the upload's Save are the only things that write.
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

/** How often the screen asks the server how the run is getting on. */
const POLL_MS = 1500;

/** Which run this browser last saw going on a line — so a restart that lost it can be told apart from "never ran". */
const seenKey = (lineId: number) => `cf_erp_nest_run_seen_${lineId}`;
const rememberRun = (lineId: number, runId: string | null) => {
  try { if (runId) localStorage.setItem(seenKey(lineId), runId); else localStorage.removeItem(seenKey(lineId)); } catch { /* storage may be blocked */ }
};
const recallRun = (lineId: number): string | null => {
  try { return localStorage.getItem(seenKey(lineId)); } catch { return null; }
};
const isRun = (a: unknown): a is NestRunSnapshot => {
  const st = (a as { status?: string } | null)?.status;
  return st === 'running' || st === 'done' || st === 'failed';
};

/**
 * How many plate THUMBNAILS a steel group shows before it asks. Only the open
 * plate is drawn in full — a line can hold a hundred plates.
 */
const FIRST_THUMBS = 36;
const MORE_THUMBS = 48;

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
function PlateCard({ nest, group, colourOf, shapeOf, jobName, onCnc, onRemove, onCustomerFile, fresh = false }: {
  nest: Nest; group: NestGroup; colourOf?: (id: number) => string;
  /** Where a cut piece's shape came from, as the answer says it (`shapeFrom`), with the note when it has one. */
  shapeOf?: (nest: Nest, cutPlateId: number) => { from: ShapeSource; note: string | null } | null;
  /** A ProNest plate's job name, when the files route gave it. */
  jobName?: string | null;
  /** Present only when this plate has a saved lot and a layout to cut from. */
  onCnc?: () => Promise<void>;
  /** Present only on a saved plate the customer's file made, when the role may change the line. */
  onRemove?: () => void;
  onCustomerFile?: () => Promise<void>;
  /** A proposal's new plate, beside the customer's. */
  fresh?: boolean;
}) {
  const margin = marginOf(nest, group);
  const kinds = platePieceKinds(nest);
  const free = isFreeLayout(nest);
  const over = free ? [] : (nest.sequences ?? []).filter(sequenceOver);
  const verdict = verdictOf(nest.verdict);
  const laidOut = hasLayout(nest);
  const breakdown = laidOut ? wasteBreakdown(nest, nest.sheetArea) : null;
  const waste = wasteShown(breakdown, { kg: wasteTotalKg(nest), pct: nest.wastePct });
  const offcuts = nest.offcuts ?? [];
  const reasons = nest.reasons ?? [];
  // Where the plate came from, and whether a drawing changed under it since it was saved.
  const from = plateSource(nest, jobName);
  const stale = nest as Nest & NestExtras;
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
        <Box component="span" data-testid="plate-source" data-source={from.kind} sx={{ display: 'inline-flex' }}>
          <Badge family={from.kind === 'ours' ? 'neutral' : 'info'} label={fresh && from.kind === 'ours' ? 'New plate' : from.label} noIcon title={from.help} />
        </Box>
        {ourPieceCount(nest) > 0 && <Badge family="info" label={`${ourPieceCount(nest)} added by us`} noIcon title="Parts our packer put in the space the customer left." />}
        {verdict && <Badge family={verdict.family} label={verdict.label} title={verdict.help} />}
        {nest.forced && <Badge family="warning" label="Saved anyway" noIcon title="Saved although our check did not say it fits." />}
        {stale.stale === true && (
          <Box component="span" data-testid="plate-stale-chip" sx={{ display: 'inline-flex' }}>
            <Badge family="warning" label={stale.staleInvalid ? 'Nest again' : 'Drawing changed'} title={stale.staleReason ?? 'A drawing changed after this plate was nested.'} />
          </Box>
        )}
        {(onCnc || onRemove || onCustomerFile) && (
          <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {onCustomerFile && (
              <Button size="small" data-testid="plate-source-file" onClick={() => { void onCustomerFile().catch((e) => toast.error((e as Error).message || 'Could not get the file.')); }} startIcon={<FolderOpenRounded />}>
                {isProNestPlate(nest) ? 'Download job file (.nif)' : 'Customer’s file'}
              </Button>
            )}
            {onCnc && (
              <Button size="small" onClick={cnc} disabled={cncBusy}
                startIcon={cncBusy ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />}>
                CNC file
              </Button>
            )}
            {onRemove && (
              <Button size="small" color="error" onClick={onRemove} startIcon={<DeleteOutlineRounded />}>Remove plate</Button>
            )}
          </Box>
        )}
      </Box>
      <Box data-testid="plate-origin" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{originLine(nest)}</Box>
      {/* The reason is written out, not only on the chip: a tooltip cannot be read on a tablet. */}
      {stale.stale === true && stale.staleReason && (
        <Box data-testid="plate-stale" role="note" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', overflowWrap: 'anywhere' }}>{stale.staleReason}</Box>
      )}

      {(reasons.length > 0 || nest.verdict === 'tight') && (
        <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5, color: 'var(--c-text-2)', display: 'grid', gap: 0.3, overflowWrap: 'anywhere' }}>
          {nest.verdict === 'tight' && !reasons.includes(verdict?.help ?? '') && <li>{verdict?.help}</li>}
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </Box>
      )}

      {nest.rules && <PlateRuleBadge rules={nest.rules} />}

      {laidOut
        ? <PlateDiagram nest={nest} kerfMm={group.kerfMm} />
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
        <Cell label="Wastage" title={WASTE_SHOWN_HELP}>
          <Mono>{wasteShownWord(waste)}</Mono>
        </Cell>
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
              {kinds.map((k) => {
                const shape = shapeOf?.(nest, k.cutPlateId) ?? null;
                return (
                <Box key={k.cutPlateId} sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, maxWidth: '100%',
                  background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.25,
                }}>
                  {colourOf && <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: colourOf(k.cutPlateId), flexShrink: 0 }} />}
                  <Mono sx={{ overflowWrap: 'anywhere' }}>{k.cutPlateCode}</Mono>
                  <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', flexShrink: 0 }}>{`×${k.count}`}</Box>
                  {shape && !shape.note && (
                    <Box data-testid="shape-from" data-shape={shape.from} sx={{ fontSize: 11.5, color: 'var(--c-text-3)', flexShrink: 0 }}>{SHAPE_SOURCE_WORDS[shape.from]}</Box>
                  )}
                  {/* Nested as its rectangle although a drawing exists: the server's reason is the marker's tooltip. */}
                  {shape?.note && (
                    <Tooltip title={shape.note} describeChild>
                      <Box data-testid="shape-from" data-shape={shape.from} tabIndex={0}
                        sx={{ fontSize: 11.5, color: 'var(--c-text-3)', flexShrink: 0, textDecoration: 'underline dotted', cursor: 'help' }}>
                        {SHAPE_SOURCE_WORDS[shape.from]}
                      </Box>
                    </Tooltip>
                  )}
                  <CutPlateDrawingButton cutPlateId={k.cutPlateId} label={k.cutPlateCode} />
                </Box>
                );
              })}
            </Box>
          </Box>
        </Collapse>
      </Box>
    </Surface>
  );
}

/** One steel — thickness, grade and material together, never thickness alone. */
function GroupCard({ group, open, onToggle, cncFor, removeFor, fileFor, shapeOf, jobNameFor, fresh = false }: {
  group: NestGroup; open: boolean; onToggle: () => void;
  shapeOf?: (nest: Nest, cutPlateId: number) => { from: ShapeSource; note: string | null } | null;
  jobNameFor?: (nest: Nest) => string | null;
  cncFor: (nest: Nest) => (() => Promise<void>) | undefined;
  removeFor?: (nest: Nest) => (() => void) | undefined;
  fileFor?: (nest: Nest) => (() => Promise<void>) | undefined;
  fresh?: boolean;
}) {
  const [shown, setShown] = useState(FIRST_THUMBS);
  const [picked, setPicked] = useState(0);
  const m = group.metrics;
  const breakdown = wasteBreakdown(m, m.areaBought);
  const waste = wasteShown(breakdown, { kg: wasteTotalKg(m), pct: m.wastePct });
  const thumbs = group.nests.slice(0, open ? shown : 0);
  const current = group.nests[Math.min(picked, Math.max(0, group.nests.length - 1))] ?? null;
  const warned = group.nests.filter((n) => n.rules?.status === 'warn').length;
  const staleCount = group.nests.filter((n) => (n as Nest & NestExtras).stale === true).length;
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
          <Cell label="Wastage" title={`Every plate of this steel, added up. ${WASTE_SHOWN_HELP}`}>
            <Mono>{wasteShownWord(waste)}</Mono>
          </Cell>
          <Cell label="Cut pieces"><Mono>{group.cutPlates.length}</Mono></Cell>
          {/* Which plates the catalog offered is a fact about the RUN, not about
              the lots, so a saved plan does not have it and must not print 0. */}
          {group.candidates.length > 0 && (
            <Cell label="Plates offered" title="Catalog plates of this thickness whose grade and material do not contradict the cut pieces'.">
              <Mono>{group.candidates.length}</Mono>
            </Cell>
          )}
        </Box>

        {breakdown && <WasteBar parts={breakdown} compact />}

        {group.unplaced.length > 0 && (
          <Note tone="warning">
            <Box><strong>{`${group.unplaced.length} cut ${group.unplaced.length === 1 ? 'piece' : 'pieces'} could not be placed on this steel.`}</strong></Box>
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
              {/* Every plate as a cheap thumbnail; the one picked is drawn in full below. */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--c-text-2)' }}>
                <span>{`${group.nests.length} ${group.nests.length === 1 ? 'plate' : 'plates'} — pick one to open it`}</span>
                {warned > 0 && <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>{`· ⚠ ${warned} break a rule`}</Box>}
                {staleCount > 0 && <Box component="span" data-testid="group-stale" sx={{ color: 'var(--c-warning-800)' }}>{`· ${staleCount} nested before a drawing changed`}</Box>}
              </Box>
              <Box data-testid="plate-thumbs" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
                {thumbs.map((n, i) => {
                  const on = current === n;
                  const mark = n.rules?.status === 'warn' ? '⚠' : n.rules?.status === 'ok' ? '✓' : '';
                  return (
                    <Box key={n.id ?? n.lotNo ?? `${n.plateItemId}-${i}`} component="button" type="button" onClick={() => setPicked(i)}
                      aria-pressed={on} aria-label={`Open plate ${n.lotNo ?? i + 1}`}
                      sx={{
                        display: 'grid', gap: 0.25, p: 0.5, cursor: 'pointer', background: 'var(--c-surface)', font: 'inherit', textAlign: 'left',
                        border: on ? '2px solid var(--c-primary-600)' : '1px solid var(--c-border)', borderRadius: 'var(--r-sm)',
                      }}>
                      <PlateThumb nest={n} width={116} />
                      <Box sx={{ display: 'flex', gap: 0.5, fontSize: 11.5, color: 'var(--c-text-2)', alignItems: 'baseline' }}>
                        <Mono>{n.lotNo ?? `#${i + 1}`}</Mono>
                        {n.rules?.utilisationPct != null && <span>{`${n.rules.utilisationPct.toFixed(0)}%`}</span>}
                        {mark && <Box component="span" sx={{ ml: 'auto', fontWeight: 700, color: mark === '⚠' ? 'var(--c-warning-600)' : 'var(--c-success-600)' }}>{mark}</Box>}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
              {shown < group.nests.length && (
                <Button size="small" variant="outlined" onClick={() => setShown((s) => s + MORE_THUMBS)}>
                  {`Show ${Math.min(MORE_THUMBS, group.nests.length - shown)} more — ${group.nests.length - shown} still hidden`}
                </Button>
              )}
              {current && <PlateCard key={current.id ?? current.lotNo ?? `${current.plateItemId}`} nest={current} group={group} shapeOf={shapeOf} jobName={jobNameFor?.(current)} onCnc={cncFor(current)}
                onRemove={removeFor?.(current)} onCustomerFile={fileFor?.(current)} fresh={fresh} />}
            </>
          )}
      </Box>
    </SectionCard>
  );
}

function PlateNestingPanel({ orderId, lineId, canManage, canEditCatalog = false, onChanged }: {
  orderId: number;
  lineId: number;
  /** The sales-order grant. Without it the screen is a look, and says so. */
  canManage: boolean;
  /** The catalog grant: lets a plate be marked Standard / Custom from Step B. */
  canEditCatalog?: boolean;
  /** Accepting rewrites what the order will buy, so the page around it reloads. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const path = `/orders/${orderId}/lines/${lineId}/nesting`;
  // THE SAVED PLAN, READ ON OPEN. This is the only request the screen makes by
  // itself, and it does not re-pack.
  const saved = useLoad(() => cfApi.get<NestingPlan>(path), [path]);
  // THE NESTING CHOICES (Steps A and B, init.sql §40). An API without them
  // answers an error; the screen then simply has no steps.
  const choicesLoad = useLoad(() => getNestingChoices(orderId, lineId).catch(() => null), [orderId, lineId]);
  const [choicesSaved, setChoicesSaved] = useState<NestingChoices | null>(null);
  const choices = choicesSaved ?? choicesLoad.data ?? null;
  // What the customer's files did to the line: may it be changed, and what is left over. An older API has none.
  const filesLoad = useLoad<NestFilesInfo | null>(() => getNestFiles(orderId, lineId).catch(() => null), [orderId, lineId]);
  const filesInfo = filesLoad.data;
  const [choicesOpen, setChoicesOpen] = useState<boolean | null>(null);
  const [proposal, setProposal] = useState<NestingPlan | null>(null);
  // true when the proposal re-nests the whole line, imported nests included.
  const [replaceAll, setReplaceAll] = useState(false);
  const [effort, setEffort] = useState<Effort>('standard');
  const [busy, setBusy] = useState<'plan' | 'accept' | null>(null);
  // THE SERVER'S RUN for this line (null = none). `runAt` is when the snapshot arrived, so the clock can tick between polls.
  const [run, setRun] = useState<NestRunSnapshot | null>(null);
  const [runAt, setRunAt] = useState(() => Date.now());
  const [interrupted, setInterrupted] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const running = run?.status === 'running';
  const [manualBusy, setManualBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // DOOR 1's dialog: which kind of run it is about to start (null = shut).
  const [start, setStart] = useState<StartMode | null>(null);
  // The kind last opened, so the heading does not change under the eye while the dialog fades out.
  const [startKind, setStartKind] = useState<StartMode>('all');
  const [fileBusy, setFileBusy] = useState<'download' | 'preview' | 'cnc' | null>(null);
  // THE CUSTOMER'S FILES (nesting v2, door 2). Many DXFs at once, by button or by dropping them on the panel.
  const filesInput = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<NestFileUpload[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<Nest | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  /** Take a snapshot from the server: remember it, and act on how it ended. */
  const adopt = useCallback((snap: NestRunSnapshot) => {
    setRun(snap); setRunAt(Date.now());
    if (snap.status === 'running') rememberRun(lineId, snap.runId); else rememberRun(lineId, null);
  }, [lineId]);
  /** A finished run's proposal is fetched whole, once. */
  const takeProposal = useCallback(async () => {
    const full = await getNestRun(orderId, lineId, { plan: true });
    if (!isRun(full) || !full.plan) return;
    setRun(full); setRunAt(Date.now());
    setProposal(full.plan);
    // A 'Redo all' run replaces the imported nests on accept too — the server says so, even after a reload.
    if (full.replaceImported != null) setReplaceAll(full.replaceImported);
    setOpenGroup(full.plan.groups.find((g) => g.nests.length)?.key ?? null);
  }, [orderId, lineId]);
  /** What a snapshot means for the screen. */
  const settle = useCallback(async (snap: NestRunSnapshot) => {
    adopt(snap);
    if (snap.status === 'done') await takeProposal();
    else if (snap.status === 'failed' && snap.error) {
      setActionError(new CfApiError(422, snap.error.message, snap.error.code, snap.error.problems ?? []));
      if (snap.error.code === 'PLATES_NOT_CHOSEN') getNestingChoices(orderId, lineId).then(setChoicesSaved).catch(() => undefined);
    }
  }, [adopt, takeProposal, orderId, lineId]);
  // ON OPEN, ALWAYS ASK THE SERVER FIRST: a run may be going, or finished while this page was away.
  useEffect(() => {
    let alive = true;
    getNestRun(orderId, lineId).then(async (a) => {
      if (!alive) return;
      if (isRun(a)) { setInterrupted(false); await settle(a); }
      else if (recallRun(lineId)) { setInterrupted(true); rememberRun(lineId, null); }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [orderId, lineId, settle]);
  // WHILE IT RUNS, ASK AGAIN. Stops on unmount, and starts again on mount through the effect above.
  useEffect(() => {
    if (!running) return undefined;
    let alive = true;
    let timer = 0;
    const tick = async () => {
      try {
        const a = await getNestRun(orderId, lineId);
        if (!alive) return;
        if (isRun(a)) await settle(a);
        else { setRun(null); setInterrupted(true); rememberRun(lineId, null); return; }
      } catch { /* a missed poll is not a failed run */ }
      if (alive) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [running, orderId, lineId, settle]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [offcutsOpen, setOffcutsOpen] = useState(false);

  const plan = proposal ?? saved.data;
  // While the server runs nesting nothing else on the screen may change what it is reading.
  const locked = busy != null || running;
  // A steel with every plate unticked cannot be nested: Nest waits, and says why.
  const blocked = choices?.blocked ?? [];
  // The line's plate setting. null = never chosen, and no run may start (an older API sends nothing: no gate).
  const plateChoice: PlateChoice | null | undefined = choices ? choices.plateChoice : saved.data?.line.plateChoice;
  const platesUnset = plateChoice === null;
  const [platesBusy, setPlatesBusy] = useState(false);
  const reloadAll = () => { saved.reload(); filesLoad.reload(); onChanged?.(); };
  const lineName = plan ? `${plan.line.orderCode}_line${plan.line.lineNo}` : `line${lineId}`;

  const downloadSheet = async () => {
    setFileBusy('download'); setActionError(null);
    try { await downloadNestingSheet(orderId, lineId, lineName); } catch (e) { setActionError(e as CfApiError); } finally { setFileBusy(null); }
  };

  const downloadCnc = async () => {
    setFileBusy('cnc'); setActionError(null);
    try { await downloadCncZip(orderId, lineId, lineName); } catch (e) { setActionError(e as CfApiError); } finally { setFileBusy(null); }
  };

  // ---- the customer's files ------------------------------------------------
  const uploadWhy = !canManage ? NO_MANAGE : filesInfo?.canUpload === false ? (filesInfo.readOnlyReason ?? 'This line cannot take nesting files now.') : null;

  // WHATEVER KIND OF FILE IS DROPPED, USE IT: ProNest job files (.nif) and DXFs go in the same request, in any mix.
  const kinds = nestKinds(filesInfo?.limits.kinds);
  const withJobs = kinds.includes('nif');

  /** Read the chosen files into base64; the dialog sends them in ONE request. */
  const takeFiles = async (list: File[]) => {
    const good = list.filter((f) => isNestFile(f.name, kinds));
    if (!good.length) { setActionError(new CfApiError(0, dropOnly(kinds))); return; }
    setFileBusy('preview'); setActionError(null);
    try {
      const read = await Promise.all(good.map(async (f) => ({ filename: f.name, file: await fileToBase64(f) })));
      if (good.length < list.length) toast.info(`${list.length - good.length} ${list.length - good.length === 1 ? 'file was' : 'files were'} not a nesting file and left out.`);
      setUploads(read);
    } catch (e) { setActionError(e as CfApiError); } finally { setFileBusy(null); }
  };
  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const list = [...(event.target.files ?? [])];
    event.target.value = '';
    if (list.length) void takeFiles(list);
  };
  const dragOk = (e: DragEvent<HTMLElement>) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const onDragOver = (e: DragEvent<HTMLElement>) => { if (dragOk(e)) { e.preventDefault(); if (!dragging) setDragging(true); } };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!dragOk(e)) return;
    e.preventDefault(); setDragging(false);
    if (uploadWhy || locked || fileBusy != null) { setActionError(new CfApiError(0, uploadWhy ?? 'Wait for the current work to finish.')); return; }
    void takeFiles([...e.dataTransfer.files]);
  };

  /** Take one uploaded plate off the line; its pieces go back to left over. */
  const confirmRemove = async () => {
    if (removing?.id == null) return;
    setRemoveBusy(true);
    try {
      const out = await removeNestLot(orderId, lineId, removing.id);
      setRemoving(null); setProposal(null);
      reloadAll();
      toast.success(out.message || `${removing.lotNo ?? 'The plate'} is off the line.`);
    } catch (e) { setRemoving(null); setActionError(e as CfApiError); } finally { setRemoveBusy(false); }
  };
  const removeFor = (n: Nest) => (!proposal && plan?.saved && n.id != null && isImported(n) && isCustomerPlate(n) && canManage && !uploadWhy && !running
    ? () => setRemoving(n) : undefined);
  const fileFor = (n: Nest) => (!proposal && n.id != null && isCustomerPlate(n)
    ? () => downloadCustomerFile(orderId, lineId, n.id as number, (n as Nest & { sourceFile?: string | null }).sourceFile ?? null)
    : undefined);

  /**
   * A plate's own DXF — only for a saved lot that says it has a layout. The
   * route answers NO_LAYOUT otherwise, and an older API (no hasLayout) has no route.
   */
  const cncFor = (n: Nest) => (!proposal && plan?.saved && n.id != null && n.hasLayout === true
    ? () => downloadLotCnc(orderId, lineId, n.id as number, n.lotNo)
    : undefined);
  const colours = useMemo(() => (plan ? colourIndex(plan) : new Map<number, number>()), [plan]);
  const colourOf = useCallback((id: number) => pieceColour(colours.get(id) ?? id), [colours]);
  // Where each cut piece's shape came from, as the answer says it: the pieces ON the plate first (a ProNest
  // plate keeps the nesting file's outline whatever the cut piece has), then the cut piece's own entry.
  const sources = useMemo(() => (plan ? shapeSources(plan) : new Map<number, { from: ShapeSource; note: string | null }>()), [plan]);
  const shapeOf = useCallback((nest: Nest, id: number): { from: ShapeSource; note: string | null } | null => {
    const own = sources.get(id) ?? null;
    const onPlate = shapeSourceOnPlate(nest.pieces, id);
    return onPlate ? { from: onPlate, note: own && own.from === onPlate ? own.note : null } : own;
  }, [sources]);
  // A ProNest plate's job name: the files route keeps it as the file's nest number.
  const jobNameFor = (n: Nest): string | null => (isProNestPlate(n)
    ? filesInfo?.plates.find((x) => x.lotId === n.id)?.file?.nestNo ?? null : null);

  /** A saved change of choices: the proposal on screen was made without it, so it goes. */
  const choicesChanged = (next: NestingChoices) => {
    setChoicesSaved(next);
    if (proposal) { setProposal(null); setRun(null); toast.info('Your choices changed, so the proposal was dropped. Nest again to use them.'); }
  };

  const pickPlates = async (next: PlateChoice) => {
    setPlatesBusy(true); setActionError(null);
    try {
      await setNestPlates(orderId, lineId, next);
      const fresh = await getNestingChoices(orderId, lineId);
      setChoicesSaved(fresh);
    } catch (e) { setActionError(e as CfApiError); } finally { setPlatesBusy(false); }
  };

  /** Start a run. True when the server took it (the dialog then shuts); false leaves the refusal on screen. */
  const propose = async (replaceImported = false): Promise<boolean> => {
    setBusy('plan'); setActionError(null); setInterrupted(false); setProposal(null); setLogOpen(false);
    try {
      const snap = await startNestRun(orderId, lineId, { effort, ...(replaceImported ? { replaceImported: true } : {}) });
      setReplaceAll(replaceImported);
      await settle(snap);
      if (snap.status === 'done') toast.success('Nesting finished. Nothing is written until you use it.');
      return true;
    } catch (e) { setActionError(e as CfApiError); return false; } finally { setBusy(null); }
  };

  /** Forget the finished run on the server and go back to what is saved. */
  const discard = async () => {
    setActionError(null);
    try { await discardNestRun(orderId, lineId); } catch (e) { setActionError(e as CfApiError); return; }
    setProposal(null); setRun(null); rememberRun(lineId, null);
  };

  /** "Stop and use this": the run ends within a second or two with the best layout it has. The poll picks the finished proposal up. */
  const stopRun = async () => {
    setActionError(null);
    try { adopt(await stopNestRun(orderId, lineId)); } catch (e) { setActionError(e as CfApiError); }
  };

  /** Cancel: the run is gone at once and a new one may start. */
  const cancelRun = async () => {
    setActionError(null);
    try { await discardNestRun(orderId, lineId); } catch (e) { setActionError(e as CfApiError); return; }
    setRun(null); setProposal(null); rememberRun(lineId, null);
  };

  const accept = async () => {
    if (!proposal) return;
    setBusy('accept'); setActionError(null);
    try {
      const out = await cfApi.post<NestingAccepted>(`${path}/accept`, { ...acceptBody(proposal), ...(replaceAll ? { replaceImported: true } : {}) }, { timeoutMs: LONG_WRITE_MS });
      setProposal(null); setRun(null); rememberRun(lineId, null);
      saved.reload(); filesLoad.reload();
      onChanged?.();
      const added = (out as NestingAccepted & { additions?: { lots: number; pieces: number } }).additions;
      toast.success(`${out.plates} plates and ${out.pieces} pieces written${out.replacedLots ? `, replacing ${out.replacedLots}` : ''}.${added?.pieces ? ` ${added.pieces} pieces added to ${added.lots} of the customer’s plates.` : ''}`);
    } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };

  /**
   * NEST_MANUAL is a specification value on the cut plate itself, written the
   * way every other value on this app is written. It only takes a cut piece out
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
        ? `${cp.code ?? cp.name} is left out of automatic nesting. Bring it in with a nesting file.`
        : `${cp.code ?? cp.name} goes back into automatic nesting. Nest again to place it.`);
    } catch (e) { setActionError(e as CfApiError); } finally { setManualBusy(null); }
  };

  if (saved.error) return <ErrorNotice error={saved.error} onRetry={saved.reload} />;
  if (!plan) {
    return (
      <SectionCard title="Nesting" subtitle="Laying this line's cut pieces out on the plates they are cut from.">
        <SkeletonRows rows={4} height={52} />
      </SectionCard>
    );
  }

  const capped = !!(proposal as (NestingPlan & { budget?: NestingBudget }) | null)?.budget?.capped;
  const basis = basisWord(plan);
  const t = plan.totals;
  const everyCutPlate: NestCutPlate[] = [
    ...plan.groups.flatMap((g) => g.cutPlates),
    ...plan.manual,
  ].filter((cp, i, all) => all.findIndex((x) => x.id === cp.id) === i)
    .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
  const manualIds = new Set(plan.manual.map((cp) => cp.id));
  // How many cut pieces the line has, for the toolbar's "Cut pieces (N)": the saved plan only knows the
  // ones it laid out, so the pieces "What to nest" lists (left out ones included) count too.
  const cutPieceCount = new Set([
    ...everyCutPlate.map((cp) => cp.id),
    ...(choices?.groups.flatMap((g) => g.pieces.map((x) => x.cutPlateId)) ?? []),
    ...(choices?.unusable.map((x) => x.cutPlateId) ?? []),
    ...(choices?.manual.map((cp) => cp.id) ?? []),
  ]).size;
  const unplaced = plan.groups.flatMap((g) => g.unplaced);
  const advice = dedupeAdvice(plan.sizeAdvice);
  // Drift only means something against a plan that EXISTS. The API answers it
  // for an empty line too, where every cut piece is "needs n, placed 0" — which
  // is not drift, it is simply not nested yet, and saying so would be a lie.
  const drift = plan.saved ? (plan.drift ?? []) : [];

  // ---- where the line stands ------------------------------------------------
  // Everything below is told apart by two facts: are plates SAVED on the line, and is a proposal waiting.
  const savedNests = (saved.data?.groups ?? []).flatMap((g) => g.nests);
  const hasPlates = savedNests.length > 0;
  // The line holds imported plates (the customer's files, or an old Excel sheet): a run of ours then nests only what they leave over.
  const imported = saved.data ? anyImported(saved.data) : false;
  // The doors are the whole screen only while there is nothing else to show.
  const showDoors = !hasPlates && !proposal && !running;
  const showPlan = !!proposal || hasPlates;
  // The CNC routes arrived with hasLayout; an API that does not send it has neither.
  const cncKnown = plan.groups.some((g) => g.nests.some((n) => n.hasLayout != null));
  const breakdown = wasteBreakdown(t, t.areaBought);
  const waste = wasteShown(breakdown, { kg: wasteTotalKg(t), pct: t.wastePct });
  const cuts = lineOffcuts(plan);
  const allOffcuts = plan.groups.flatMap((g) => g.nests.flatMap((n) => (n.offcuts ?? []).map((o) => ({ ...o, lotNo: n.lotNo }))));
  const wasteKgNow = waste.kg;
  const wastePctNow = waste.pct;

  // WHAT IS LEFT OVER. The saved plan counts needed against nested per cut piece; an API
  // without that answers through the files route instead. Never from a proposal.
  const covered = ((saved.data as (NestingPlan & { coverage?: NestFileCoverage[] }) | null)?.coverage ?? []);
  const leftRows: LeftOverRow[] = covered.length
    ? covered.filter((c) => c.diff < 0).map((c) => ({ cutPlateId: c.cutPlateId, code: c.cutPlateCode, qty: -c.diff, heldBack: !!c.manual || !!c.leftOut }))
    : (filesInfo?.leftOver ?? []).map((l) => ({ cutPlateId: l.cutPlateId, code: l.cutPlateCode, qty: l.qty, heldBack: !!l.manual || !!l.leftOut }));
  const leftPieces = leftRows.reduce((a, r) => a + r.qty, 0);
  const heldBack = leftRows.reduce((a, r) => a + (r.heldBack ? r.qty : 0), 0);
  const showLeft = !proposal && hasPlates && leftPieces > 0;
  // "37 of 39": the line's pieces that are on a plate, of the pieces it needs.
  const needPieces = covered.length ? covered.reduce((a, c) => a + c.needed, 0) : filesInfo?.totals ? filesInfo.totals.pieces + filesInfo.totals.leftOverPieces : 0;
  const gotPieces = covered.length ? covered.reduce((a, c) => a + Math.min(c.nested, c.needed), 0) : filesInfo?.totals?.pieces ?? 0;

  const withOurs = !!proposal && restOf(proposal) != null;

  const figures: SummaryFigure[] = [
    { key: 'plates', label: proposal ? (withOurs ? 'New plates' : 'Plates proposed') : 'Plates', value: `${t.plates}` },
    { key: 'steel', label: 'Steel bought', value: `${tonnes(t.weightKg)} t` },
    {
      key: 'waste', label: 'Waste', value: pct(wastePctNow),
      hint: `${kg(wasteKgNow)} kg. ${waste.offcutKg >= 0.5 ? `${kg(waste.offcutKg)} kg of it offcut. ` : ''}${WASTE_SHOWN_HELP}`,
    },
    !proposal && needPieces > 0
      ? { key: 'pieces', label: 'Cut pieces nested', value: `${gotPieces} of ${needPieces}`, warn: gotPieces < needPieces, hint: 'Pieces on a plate, of the pieces this line needs.' }
      : { key: 'pieces', label: proposal ? 'Pieces on these plates' : 'Cut pieces nested', value: `${t.pieces}` },
  ];

  // ---- the two doors, and what stands behind each ---------------------------
  const waiting = locked || fileBusy != null;
  const pickFiles = () => filesInput.current?.click();
  const openStart = (mode: StartMode) => { setActionError(null); setStartKind(mode); setStart(mode); };
  const startRun = async () => {
    if (!start) return;
    // Only "Start again" on a line with imported plates replaces those too; every other run leaves them be.
    if (await propose(start === 'again' && imported)) setStart(null);
  };
  // What a second run from the proposal would be: the same kind as the one on screen.
  const againMode: StartMode = replaceAll ? 'again' : imported ? 'rest' : 'all';

  const waitWhy = running ? 'Wait for the nesting run to finish.' : waiting ? 'Wait for the current work to finish.' : null;
  const more: MoreAction[] = [
    ...(hasPlates ? [{
      key: 'upload', label: 'Upload nesting files', icon: <UploadFileRounded fontSize="small" />,
      // The way to bring in a replacement: a file uploaded again lands on its own plates.
      help: `${withJobs ? 'ProNest job files (.nif) or one DXF per plate' : 'One DXF per plate'}${filesInfo?.limits.maxPlates ? `, up to ${filesInfo.limits.maxPlates} plates in one go` : ''}. A file uploaded again replaces its own plates. You see a check before anything is saved.`,
      why: uploadWhy ?? waitWhy, onClick: pickFiles,
    }] : []),
    {
      key: 'cnc', label: 'Download CNC files (zip)', icon: <PrecisionManufacturingRounded fontSize="small" />,
      help: 'One DXF per plate, for the CNC nesting software, in a zip.',
      why: proposal ? 'Use or discard the proposal first.' : !(plan.saved && t.plates > 0) ? 'Nothing is nested yet.' : !cncKnown ? 'These plates have no layout to cut from.' : waitWhy,
      busy: fileBusy === 'cnc', onClick: downloadCnc,
    },
    {
      key: 'sheet', label: 'Download nesting sheet', icon: <TableChartOutlined fontSize="small" />,
      help: 'The nests as an Excel sheet. For reference only.',
      why: waitWhy, busy: fileBusy === 'download', onClick: downloadSheet,
    },
    {
      key: 'again', label: 'Start again', icon: <RestartAltRounded fontSize="small" />,
      help: startSentence('again', imported),
      why: !hasPlates ? 'Nothing is nested yet.' : proposal ? 'Use or discard the proposal first.' : waitWhy,
      onClick: () => openStart('again'),
    },
  ];

  return (
    <Box data-testid="nest-drop-zone" onDragOver={onDragOver} onDragLeave={() => setDragging(false)} onDrop={onDrop}
      sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0, borderRadius: 'var(--r-md)', outline: dragging && !showDoors ? '2px dashed var(--c-primary-600)' : 'none', outlineOffset: 4 }}>
      {dragging && <Alert severity="info" data-testid="nest-drop-hint">Drop the nesting files to read them. Nothing is saved yet.</Alert>}
      <input ref={filesInput} data-testid="nest-files-input" type="file" accept={nestAccept(kinds)} multiple hidden onChange={chooseFiles}
        aria-label={withJobs ? 'Nesting files (ProNest job files or DXF)' : 'Nesting files (DXF)'} />
      {running && run && <NestRunCard run={run} receivedAt={runAt} onStop={stopRun} onCancel={cancelRun} />}
      {interrupted && !running && <Alert severity="warning" data-testid="nest-run-interrupted">{RUN_INTERRUPTED}</Alert>}
      {run?.status === 'failed' && !running && (
        <Alert severity="error" data-testid="nest-run-failed">
          <Box sx={{ fontWeight: 600 }}>{run.error?.message ?? 'The nesting run failed.'}</Box>
          {(run.error?.problems?.length ?? 0) > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
              {run.error?.problems?.map((x) => <li key={x}>{x}</li>)}
            </Box>
          )}
          <Box sx={{ mt: 0.5 }}>
            <Button size="small" variant="outlined" color="inherit" onClick={() => { void propose(false); }} disabled={locked || platesUnset}>Try again</Button>
          </Box>
          {run.log.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              <Button size="small" color="inherit" onClick={() => setLogOpen((o) => !o)}>{logOpen ? 'Hide run log' : 'Show run log'}</Button>
              <Collapse in={logOpen} unmountOnExit><NestRunLog log={run.log} /></Collapse>
            </Box>
          )}
        </Alert>
      )}
      <SectionCard
        title="Nesting"
        subtitle={showDoors
          ? `Line ${plan.line.lineNo} of ${plan.line.orderCode} · two ways to lay this line's cut pieces out on plates. Pick one.`
          : `Line ${plan.line.lineNo} of ${plan.line.orderCode} · each part on the plate it is cut from, in the order it is cut.`}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* The cut pieces are not a stage (2026-10-02): their list opens here, over the layout. */}
            <CutPiecesButton lineId={lineId} lineNo={plan.line.lineNo} count={cutPieceCount} canManage={canManage} variant="text"
              onChanged={() => { saved.reload(); onChanged?.(); }} />
            <NestMoreMenu actions={more} busy={fileBusy === 'cnc' || fileBusy === 'download'} />
          </Box>
        )}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0, py: showDoors ? 1 : 0 }}>
          {/* A refusal to START is said in the start dialog while that is open; here once it is shut. */}
          {!start && (actionError?.code === 'PLATES_NOT_CHOSEN'
            ? <Alert severity="warning" data-testid="plates-not-chosen-error">{actionError.message}</Alert>
            : actionError?.code === 'CHANGED_MEANWHILE'
              ? (
                <Alert severity="warning" data-testid="changed-meanwhile" action={(
                  <Button color="inherit" size="small" onClick={() => { setActionError(null); setProposal(null); reloadAll(); }}>Reload</Button>
                )}>{actionError.message}</Alert>
              )
              : <ErrorNotice error={actionError} sx={{ mb: 0 }} />)}

          {showDoors && (
            <NestDoors dropping={dragging} withJobs={withJobs}
              ours={{
                disabled: waiting,
                busy: busy === 'plan',
                onOpen: () => openStart('all'),
                // Both of these are settled behind the door, so it stays open and says what is waiting.
                notes: (platesUnset || blocked.length > 0) ? (
                  <>
                    {platesUnset && <Note tone="warning"><Box data-testid="door-plates-not-chosen">{PLATES_NOT_CHOSEN}</Box></Note>}
                    {blocked.length > 0 && (
                      <Note tone="warning">
                        <Box data-testid="door-steel-blocked"><strong>{STEEL_BLOCKED}</strong></Box>
                        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
                          {blocked.map((b) => <li key={b}>{b}</li>)}
                        </Box>
                      </Note>
                    )}
                  </>
                ) : undefined,
              }}
              upload={{ blocked: uploadWhy, disabled: waiting, busy: fileBusy === 'preview', onOpen: pickFiles }} />
          )}

          {!showDoors && !proposal && running && !hasPlates && (
            <Typography data-testid="nest-waiting" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              The layout appears here when the run finishes. Nothing is written until you use it.
            </Typography>
          )}

          {!showDoors && !proposal && hasPlates && (
            <>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge family={basis.family} label={basis.label} title={basis.help} />
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 260px', minWidth: 0 }}>{LOOK_IS_A_LOOK}</Typography>
              </Box>
              {plan.settingsNote && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{plan.settingsNote}</Typography>}
            </>
          )}

          {/*
            The commitment is laid out BEFORE the button that makes it, not
            after — and the button sits here rather than in the card's header so
            it wraps with the words instead of running off a narrow screen.
          */}
          {proposal && (
            <>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge family={basis.family} label={basis.label} title={basis.help} />
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 260px', minWidth: 0 }}>
                  Nothing here is written down yet. Read it, then use it or discard it.
                </Typography>
              </Box>
              {plan.settingsNote && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{plan.settingsNote}</Typography>}
              {capped && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{CAPPED_LINE}</Typography>}
              {(proposal as NestingPlan & { budget?: { stopped?: boolean } }).budget?.stopped && (
                <Typography data-testid="nest-stopped" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>You stopped the run early. This is the best layout it had found.</Typography>
              )}
              {run?.status === 'done' && run.summary && (
                <Alert severity="success" data-testid="nest-run-done">
                  {runSummary(run)}
                  {offlineLine(run.startedBy, run.finishedAt ?? run.startedAt) && (
                    <Box data-testid="nest-run-offline" sx={{ fontSize: 12.5, mt: 0.25 }}>{offlineLine(run.startedBy, run.finishedAt ?? run.startedAt)}</Box>
                  )}
                </Alert>
              )}
              {run?.status === 'done' && run.log.length > 0 && (
                <Box>
                  <Button size="small" onClick={() => setLogOpen((o) => !o)} endIcon={logOpen ? <ExpandLessRounded /> : <ExpandMoreRounded />}>
                    {logOpen ? 'Hide run log' : 'Show run log'}
                  </Button>
                  <Collapse in={logOpen} unmountOnExit><NestRunLog log={run.log} /></Collapse>
                </Box>
              )}
              <Note>
                <Box><strong>Using it writes it down.</strong></Box>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4 }}>
                  {ACCEPT_WHAT_HAPPENS.map((x) => <li key={x}>{x}</li>)}
                </Box>
                <Box>{ACCEPT_AGAIN}</Box>
              </Note>
              <RestSummary plan={proposal} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                <Tooltip title={canManage ? 'Writes this layout down. It becomes what the shop cuts to and what the order buys.' : NO_MANAGE}>
                  <span>
                    <Button variant="contained" color="primary" data-testid="nest-use" disabled={!canManage || locked || t.plates === 0}
                      startIcon={busy === 'accept' ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
                      onClick={accept}>
                      Use this nesting
                    </Button>
                  </span>
                </Tooltip>
                <Button variant="outlined" startIcon={<UndoRounded />} onClick={discard} disabled={locked}>
                  Discard
                </Button>
                <Tooltip title="Run it again — with more time, other plates or other pieces. This proposal is dropped when the new run starts.">
                  <span>
                    <Button size="small" startIcon={<AutoAwesomeRounded />} onClick={() => openStart(againMode)} disabled={waiting}>
                      Nest again
                    </Button>
                  </span>
                </Tooltip>
              </Box>
              {t.plates === 0 && (
                <Typography data-testid="nest-nothing-proposed" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
                  The run put nothing on a plate, so there is nothing to use. The reasons are listed below.
                </Typography>
              )}
            </>
          )}
          {!canManage && !showDoors && <Note tone="warning"><Box>{NO_MANAGE}</Box></Note>}
        </Box>
      </SectionCard>

      {proposal && <Additions plan={proposal} saved={saved.data} />}

      {showLeft && (
        <LeftOverBanner pieces={leftPieces} rows={leftRows} heldBack={heldBack}
          oursLabel={imported ? 'Nest the rest ourselves' : 'Nest the line again ourselves'}
          oursWhy={!canManage ? NO_MANAGE : null} oursBusy={waiting}
          onOurs={() => openStart(imported ? 'rest' : 'again')}
          uploadWhy={uploadWhy} uploadBusy={waiting} onUpload={pickFiles} />
      )}

      {showPlan && (
        <NestSummaryStrip figures={figures}>
          <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {[
              `${t.pieces} ${t.pieces === 1 ? 'piece' : 'pieces'} on ${t.plates} ${t.plates === 1 ? 'plate' : 'plates'}`,
              `${kg(wasteKgNow)} kg wastage${waste.offcutKg >= 0.5 ? `, ${kg(waste.offcutKg)} kg of it offcut` : ''}`,
              ...(breakdown ? [`${cuts.count} ${cuts.count === 1 ? 'offcut' : 'offcuts'}`] : []),
            ].join(' · ')}
            {t.unplaced > 0 && <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>{` · ${t.unplaced} not placed`}</Box>}
            {plan.choices && (plan.choices.piecesLeftOut > 0 || plan.choices.platesExcluded > 0) && (
              <Box component="span" data-testid="plan-choices">{` · ${choicesLine({ summary: plan.choices })}`}</Box>
            )}
          </Box>
          {plan.saved && !proposal && <NestMoney key={`${t.plates}-${t.weightKg}`} orderId={orderId} lineId={lineId} />}
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
        </NestSummaryStrip>
      )}

      {plan.problems.length > 0 && (
        <Alert severity="warning">
          <Box sx={{ fontWeight: 600, mb: 0.5 }}>{showPlan ? 'Some cut pieces were left out of the pack.' : 'Some cut pieces cannot be nested as they are.'}</Box>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
            {plan.problems.map((p) => <li key={p}>{p}</li>)}
          </Box>
        </Alert>
      )}

      {showPlan && drift.length > 0 && (
        <SectionCard title="This layout is out of date"
          subtitle="The structure changed after this layout was accepted, so these cut pieces no longer match it. The layout is still exactly what was agreed — nest the line again (More › Start again) so the plates it buys match what it cuts.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
            {drift.map((d) => (
              <Box key={d.cutPlateId} sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                <Mono>{d.code ?? 'A cut piece'}</Mono>{driftWords(d)}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}

      {showPlan && unplaced.length > 0 && (
        <SectionCard title={`${unplaced.length} cut ${unplaced.length === 1 ? 'piece' : 'pieces'} could not be placed`}
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

      {/* Which cut pieces the packer is allowed to touch. */}
      {showPlan && (
        <>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
        <Tooltip title={MANUAL_HELP}>
          <span>{`${plan.manual.length} left out of automatic nesting`}</span>
        </Tooltip>
        <span>·</span>
        <Button size="small" aria-expanded={leaveOpen} aria-label={leaveOpen ? 'Hide the cut pieces left out of automatic nesting' : 'Change which cut pieces are left out of automatic nesting'}
          onClick={() => setLeaveOpen((o) => !o)}>{leaveOpen ? 'Hide' : 'Change'}</Button>
      </Box>
      <Collapse in={leaveOpen} unmountOnExit>
      <SectionCard title="Leave out of automatic nesting" subtitle={MANUAL_HELP}
        actions={<Badge family={plan.manual.length ? 'warning' : 'neutral'} label={`${plan.manual.length} left out`} noIcon />}>
        {everyCutPlate.length === 0
          ? (
            <EmptyState icon={<PanToolRounded />}
              title={plan.saved ? 'No cut pieces on this line' : 'Nothing to list yet'}
              hint={plan.saved
                ? 'A line has cut pieces to nest once its structure has plate parts under it.'
                : 'The cut pieces appear here once the line has been nested, each with a switch.'} />
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
                        <CutPlateDrawingButton cutPlateId={cp.id} label={cp.code ?? cp.name} />
                      </Box>
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                        {`${mmPair(cp.length, cp.width)} · ${mm(cp.thickness)} mm ${cp.grade ?? ''} ${cp.material ?? ''}`.trim()}
                        {sources.get(cp.id) ? ` · shape ${SHAPE_SOURCE_WORDS[sources.get(cp.id)!.from]}` : ''}
                      </Typography>
                      {sources.get(cp.id)?.note && (
                        <Typography data-testid="shape-note" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', overflowWrap: 'anywhere' }}>{sources.get(cp.id)!.note}</Typography>
                      )}
                    </Box>
                    <Box sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 12.5, color: 'var(--c-text-2)' }}>
                      <Mono>{cp.pieces}</Mono>{cp.pieces === 1 ? ' piece' : ' pieces'}
                    </Box>
                    <Tooltip title={canManage
                      ? (isManual ? 'Put it back into automatic nesting.' : 'Leave it out of automatic nesting.')
                      : NO_MANAGE}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: 'end' }}>
                        {manualBusy === cp.id && <CircularProgress size={14} />}
                        <Switch size="small" checked={isManual} disabled={!canManage || manualBusy != null || running}
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
        </>
      )}

      {showPlan && (plan.groups.length === 0
        ? (
          <SectionCard title="Nothing is laid out yet">
            <EmptyState icon={<GridViewRounded />} title={plan.saved ? 'This line has no plates' : 'No layout has been proposed'}
              hint={plan.saved ? 'Nothing was written for this line.' : 'The run put nothing on a plate. Discard it, then nest again or upload nesting files.'} />
          </SectionCard>
        )
        : plan.groups.map((g) => (
          <GroupCard key={g.key} group={g} cncFor={cncFor} removeFor={removeFor} fileFor={fileFor} shapeOf={shapeOf} jobNameFor={jobNameFor} fresh={withOurs}
            open={openGroup === g.key}
            onToggle={() => setOpenGroup((k) => (k === g.key ? null : g.key))} />
        )))}

      {showPlan && plan.sizeAdvice.length > 0 && (
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

      {/* DOOR 1: how hard to try, which plates, which pieces — then Start. */}
      <NestStartDialog open={!!start} mode={start ?? startKind} imported={imported} effort={effort} onEffort={setEffort}
        busy={busy === 'plan'} onClose={() => setStart(null)} onStart={() => { void startRun(); }}
        blocked={blocked} platesUnset={platesUnset} error={start ? actionError : null}
        plates={plateChoice !== undefined ? (
          <PlatesToUse choice={plateChoice} kinds={choices?.plateKinds} editable={canManage && (choices?.canSave ?? true) && !running} busy={platesBusy} onPick={pickPlates} />
        ) : undefined}
        choices={choices ? (
          <Box data-testid="nest-choices-wrap" sx={{ minWidth: 0 }}>
            <NestChoices orderId={orderId} lineId={lineId} choices={choices} canManage={canManage && !running} canEditCatalog={canEditCatalog && !running} onChange={choicesChanged}
              open={choicesOpen ?? blocked.length > 0} onOpenChange={setChoicesOpen} />
          </Box>
        ) : undefined} />

      {/* THE UPLOAD DOOR: the shop's own files, checked before anything is saved. */}
      <NestFilesDialog open={!!uploads} orderId={orderId} lineId={lineId} uploads={uploads ?? []} canEditCatalog={canEditCatalog}
        onClose={() => setUploads(null)}
        onSaved={(out: NestFilesResult) => { setProposal(null); setRun(null); reloadAll(); toast.success(out.message || 'The nesting is saved.'); }} />

      <Dialog open={!!removing} onClose={removeBusy ? undefined : () => setRemoving(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{`Remove ${removing?.lotNo ?? 'this plate'}?`}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14 }} data-testid="remove-text">
            {removing
              ? `The plate comes off the line. Its ${removing.pieces.length} ${removing.pieces.length === 1 ? 'piece goes' : 'pieces go'} back to left over (${pieceCounts(removing.pieces).map((c) => `${c.code} ×${c.qty}`).join(', ')}), ready to be nested again.${isProNestPlate(removing) ? ' The other plates of its ProNest job stay.' : ' The customer’s file stays on record.'}`
              : ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)} disabled={removeBusy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmRemove} disabled={removeBusy}
            startIcon={removeBusy ? <CircularProgress size={14} color="inherit" /> : undefined}>Remove plate</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * The Nesting stage: plates first, then the Sections part (parts cut to length
 * from stock bars — CF_ERP_CUT_FROM_PLAN.md §4). The sections part reads its own
 * answer and says so in one line when the line has no section parts.
 */
export function NestingPanel(props: {
  orderId: number;
  lineId: number;
  canManage: boolean;
  canEditCatalog?: boolean;
  onChanged?: () => void;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <LineDrawingContext.Provider value={{ orderId: props.orderId, lineId: props.lineId }}>
        <PlateNestingPanel {...props} />
      </LineDrawingContext.Provider>
      <SectionNestingPanel orderId={props.orderId} lineId={props.lineId} canManage={props.canManage} onChanged={props.onChanged} />
    </Box>
  );
}
