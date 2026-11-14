import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Box, Button, Checkbox, CircularProgress, Dialog, DialogTitle, FormControlLabel, IconButton, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import FitScreenRounded from '@mui/icons-material/FitScreenRounded';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import WidthFullRounded from '@mui/icons-material/WidthFullRounded';
import NavigateNextRounded from '@mui/icons-material/NavigateNextRounded';
import ViewSidebarRounded from '@mui/icons-material/ViewSidebarRounded';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import ViewInArRounded from '@mui/icons-material/ViewInArRounded';
import { CfApiError } from '../../api/client';
import { blobAsText, downloadDrawing, fetchDrawingBlob, forgetLineModel, getDrawings, getDrawingShapes, getLineModel3d, linePhysics, placeAddedRow, type Drawing, type LineModelEdits, type Model3D, type PhysicsInfo, type PhysicsSource } from '../../api/drawings';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { editsWords } from '../../lib/model3d';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import { litMark, selectionFacts, settleScope, thicknessFromName, type Part3D, type Scope3D, type Selection3D } from '../../lib/model3d';
import { partOfView, pickShape, shapeFacts, shapePath, shapesOf, type Shape, type ShapeFacts } from '../../lib/dxfPick';

// three.js only loads when someone opens the 3D view.
const Model3DView = lazy(() => import('./Model3DView'));
const PhysicsView = lazy(() => import('./PhysicsView'));
import { getDesignUses, type DesignUses } from '../../api/links';
import { piecesWords } from '../../lib/links';
import { DesignUsesDialog } from './DesignUsesDialog';
import { useDialogFullscreen } from '../../hooks/useDialogFullscreen';
import { usePanZoom } from '../../hooks/usePanZoom';
import { fmtCutM, fmtM2, fmtMm, fmtPct, holesTitle, REGISTER_STATUS_FAMILY, rowCodes, sizeText } from '../../lib/drawings';
import { DxfError, parseDxf, type DxfLayer, type DxfView, type LayerRole } from '../../lib/dxfView';
import { inheritedLabel, rowLabel, rowShows, type LevelView } from '../../lib/drawingLevels';
import { levelDrawing, modelHasLevel, modelHasPiece, pieceDrawing, viewToDxf, type ModelFile } from '../../lib/modelDrawing';
import { useToast } from '../toastContext';
import { Badge, CapsLabel, ErrorNotice, InfoTip, Mono } from '../ui';

/**
 * THE DRAWING VIEWER — a pop-up for ONE saved drawing (a DXF drawn as SVG, a PDF in the browser's own viewer).
 *
 * Pan and zoom behave exactly like the HRMS org chart (hooks/usePanZoom.ts lists each behaviour). Full screen uses the
 * org chart's mechanism too (hooks/useDialogFullscreen.ts): the document goes full screen, the dialog fills it; Esc
 * leaves full screen first and the dialog stays, a second Esc closes it. `F` toggles full screen.
 *
 * The DXF is drawn from its text, so it shows everything the file draws, not only the plate outline. One <path> per
 * layer with a non-scaling stroke, so a 20,000-entity file pans smoothly: the pan moves ONE matrix on one <g>.
 */

export const PX_PER_MM = 96 / 25.4;
/** Above this many lines and curves the drawing is drawn without anti-aliasing while it moves (see usePanZoom). */
const QUICK_ABOVE = 2000;

/** Layer colours are theme tokens, so dark mode follows. */
const ROLE_COLOUR: Record<LayerRole, string> = {
  outline: 'var(--c-text)',
  hole: 'var(--c-primary-500)',
  cutout: 'var(--c-warning-600)',
  dim: 'var(--c-info-600)',
  centre: 'var(--c-text-3)',
  hidden: 'var(--c-text-3)',
  text: 'var(--c-text-2)',
  other: 'var(--c-text-3)',
};
/** Centre lines and hidden lines are dashed (a screen-pixel dash, so it does not stretch with the zoom). */
const ROLE_DASH: Partial<Record<LayerRole, string>> = { centre: '10 3 2 3', hidden: '5 4' };
const ROLE_WORD: Record<LayerRole, string> = { outline: 'outline', hole: 'holes', cutout: 'cut-outs', dim: 'dimensions', centre: 'centre lines', hidden: 'hidden', text: 'text', other: '' };

/** The drawing itself. Memoised on the parse: pan and zoom never re-render it (they move the matrix on the <g>). */
const Scene = memo(function Scene({ layers, hidden }: { layers: DxfLayer[]; hidden: ReadonlySet<string> }) {
  return (
    <>
      {layers.map((l) => (
        <g key={l.name} data-layer={l.name} display={hidden.has(l.name) ? 'none' : undefined}>
          {l.d && !hidden.has(l.name) && (
            <path d={l.d} fill="none" stroke={ROLE_COLOUR[l.role]} strokeWidth={l.role === 'outline' ? 1.6 : 1.1}
              strokeDasharray={ROLE_DASH[l.role]} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          )}
          {l.texts.map((t, i) => (
            <g key={i} transform={`translate(${t.x} ${t.y}) rotate(${t.rot}) scale(1 -1)`}>
              {t.lines.map((line, j) => (
                <text key={j} x={0} y={j * t.h * 1.25} fontSize={t.h} textAnchor={t.anchor} fill={ROLE_COLOUR.text}
                  dominantBaseline={t.valign === 'top' ? 'hanging' : t.valign === 'middle' ? 'central' : undefined}>{line}</text>
              ))}
            </g>
          ))}
        </g>
      ))}
    </>
  );
});

/** What the viewer needs of a drawing: a saved file of the dialog, or one the level tree names. */
export type ViewerDrawing = Pick<Drawing, 'id' | 'mark' | 'fileName' | 'fileKind'> & Partial<Pick<Drawing, 'drawing' | 'geometry' | 'rows'>>;

/** Level navigation: where the person is in the line's structure, and how to step. */
export interface ViewerLevels { view: LevelView; onGo: (rowId: number) => void }

/**
 * How long the viewer waits for the model before it opens the 2D file anyway. A large assembly's model can take well over
 * 2 s on the server; it used to give up at 2 s and then 2D stayed the choice (user, 2026-11-14: "2D is coming before 3D").
 */
const MODEL_WAIT_MS = 60000;

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; error: CfApiError }
  | { state: 'dxf'; view: DxfView }
  | { state: 'pdf'; url: string };

const asError = (e: unknown) => (e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e)));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, fontSize: 13, py: 0.5, borderBottom: '1px solid var(--c-divider)' }}>
      <Box component="span" sx={{ color: 'var(--c-text-3)', flexShrink: 0 }}>{label}</Box>
      <Box component="span" sx={{ textAlign: 'right', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{children}</Box>
    </Box>
  );
}

const mm0 = (n: number) => Math.round(n).toLocaleString('en-IN');
const holesWords = (holes: { d: number; n: number }[]) => holes.map((h) => `${h.n} × Ø${h.d}`).join(', ');

/** The side panel's "Selected" section header: its title and a clear button. */
function SelectedHead({ onClear }: { onClear: () => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <CapsLabel>Selected</CapsLabel>
      <Button size="small" sx={{ minWidth: 0, py: 0, fontSize: 12 }} onClick={onClear} data-testid="viewer-selected-clear">Clear (Esc)</Button>
    </Box>
  );
}

/** A piece picked in 3D: what it is, where it is, and the "just this part / in the whole structure" toggle. */
/** A new row's box (this order's own): where its left-front-bottom corner is, in mm — typed and saved, or put back beside its parent. */
function MoveAdded({ at, moved, onMove }: { at: [number, number, number]; moved: boolean; onMove: (at: [number, number, number] | null) => Promise<void> }) {
  const [v, setV] = useState(at.map((x) => String(Math.round(x))));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(at.map((x) => String(Math.round(x)))); }, [at]);
  const okNums = v.every((x) => x.trim() !== '' && Number.isFinite(Number(x)));
  const go = async (to: [number, number, number] | null) => { setBusy(true); try { await onMove(to); } finally { setBusy(false); } };
  return (
    <Box sx={{ mt: 1, p: 1, borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }} data-testid="viewer-move-added">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Position (mm)</Typography>
        <InfoTip text="A new row is drawn as a box of its length × width × thickness, beside its parent. Type where its left-front-bottom corner goes, in the structure's own axes, and press Move." />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.5 }}>
        {(['X', 'Y', 'Z'] as const).map((k, i) => (
          <TextField key={k} size="small" label={k} value={v[i]} onChange={(e) => setV((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
            inputProps={{ inputMode: 'decimal', 'data-testid': `viewer-move-${k.toLowerCase()}` }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
        <Button size="small" variant="contained" disabled={busy || !okNums} onClick={() => void go(v.map(Number) as [number, number, number])} data-testid="viewer-move-save">Move</Button>
        {moved && <Button size="small" disabled={busy} onClick={() => void go(null)} data-testid="viewer-move-reset">Back beside its parent</Button>}
      </Box>
    </Box>
  );
}

function Selected3D({ sel, scope, onScope, allOfMark, onAllOfMark, onClear, added, onMove }: {
  sel: Selection3D; scope: Scope3D; onScope: (s: Scope3D) => void; allOfMark: boolean; onAllOfMark: (v: boolean) => void; onClear: () => void;
  added?: { at: [number, number, number]; moved: boolean } | null; onMove?: (at: [number, number, number] | null) => Promise<void>;
}) {
  return (
    <Box data-testid="viewer-selected" data-kind="3d">
      <SelectedHead onClear={onClear} />
      <Row label="Part"><span data-testid="viewer-selected-label">{sel.label}</span></Row>
      {sel.mark && <Row label="Mark"><Mono>{sel.mark}</Mono></Row>}
      {sel.code && <Row label="Code"><Mono>{sel.code}</Mono></Row>}
      <Row label="What">{sel.kind}</Row>
      <Row label="Size">{sel.size}</Row>
      {sel.levels.length > 0 && <Row label="In">{sel.levels.join(' · ')}</Row>}
      {sel.byRule && <Row label="Position">By rule, not read from a drawing</Row>}
      {sel.holeCount > 0 && <Row label="Holes">{`${sel.holeCount} · ${holesWords(sel.holes)}`}</Row>}
      {sel.sameMark > 1 && <Row label="Same mark">{`${sel.sameMark} pieces in the model`}</Row>}
      <ToggleButtonGroup size="small" exclusive fullWidth value={scope === 'selection' ? 'selection' : 'whole'} sx={{ mt: 1 }}
        onChange={(_, v: Scope3D | null) => { if (v) onScope(v); }} aria-label="Show the selected part">
        <ToggleButton value="selection" data-testid="viewer-selected-just">Just this part</ToggleButton>
        <ToggleButton value="whole" data-testid="viewer-selected-whole">In the whole structure</ToggleButton>
      </ToggleButtonGroup>
      {sel.sameMark > 1 && sel.mark && (
        <FormControlLabel sx={{ mt: 0.5, '& .MuiFormControlLabel-label': { fontSize: 13 } }}
          control={<Checkbox size="small" checked={allOfMark} onChange={(e) => onAllOfMark(e.target.checked)} inputProps={{ 'aria-label': 'Select all pieces of this mark' }} data-testid="viewer-selected-all-mark" />}
          label={`All ${sel.sameMark} pieces marked ${sel.mark}`} />
      )}
      {added && <Row label="Added">On this order, not on the standard</Row>}
      {added && onMove && <MoveAdded at={added.at} moved={added.moved} onMove={onMove} />}
    </Box>
  );
}

/** A shape picked in 2D: its layer, size, area, the holes and cut-outs inside it and its label. */
function Selected2D({ facts, onZoom, onClear }: { facts: ShapeFacts; onZoom: () => void; onClear: () => void }) {
  const what = facts.kind === 'circle' ? `Circle Ø${mm0(facts.diameterMm ?? 0)}` : facts.kind === 'outline' ? 'Closed outline' : 'Line';
  return (
    <Box data-testid="viewer-selected" data-kind="2d">
      <SelectedHead onClear={onClear} />
      {facts.text && <Row label="Label"><span data-testid="viewer-selected-label">{facts.text}</span></Row>}
      <Row label="What">{what}</Row>
      <Row label="Layer">{facts.layer}</Row>
      <Row label="Size">{`${mm0(facts.lengthMm)} × ${mm0(facts.widthMm)} mm`}</Row>
      {facts.areaMm2 != null && <Row label="Area">{`${fmtM2(facts.areaMm2 / 1e6)} (${mm0(facts.areaMm2)} mm²)`}</Row>}
      <Row label={facts.kind === 'line' ? 'Length' : 'Perimeter'}>{`${mm0(facts.pathMm)} mm`}</Row>
      {facts.kind === 'outline' && <Row label="Holes inside">{facts.holeCount ? `${facts.holeCount} · ${holesWords(facts.holes)}` : 'none'}</Row>}
      {facts.cutouts > 0 && <Row label="Cut-outs inside">{facts.cutouts}</Row>}
      <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={onZoom} data-testid="viewer-selected-zoom">Zoom to it</Button>
    </Box>
  );
}

function SideStrip({ drawing, view, hidden, onToggle, onAll, levels, selected, readFacts, inModel }: {
  drawing: ViewerDrawing; view: DxfView | null; hidden: ReadonlySet<string>; onToggle: (name: string) => void; onAll: (show: boolean) => void; levels?: ViewerLevels;
  /** this mark can be drawn from the line's model, file or no file */
  inModel: (mark: string | null | undefined) => boolean;
  /** the "Selected" section (a piece picked in 3D, a shape in 2D), at the top */
  selected?: React.ReactNode;
  readFacts?: { lengthMm: number | null; widthMm: number | null; areaMm2: number | null; holes: number | null } | null;
}) {
  const g = drawing.geometry ?? null;
  const reg = drawing.drawing ?? null;
  const rows = drawing.rows ?? [];
  return (
    <Box component="aside" aria-label="About this drawing" data-testid="viewer-strip" sx={{
      width: { xs: '100%', md: 300 }, flexShrink: 0, overflow: 'auto', p: 1.5, display: 'grid', gap: 2, alignContent: 'start',
      maxHeight: { xs: '38%', md: 'none' }, borderLeft: { md: '1px solid var(--c-border)' }, borderTop: { xs: '1px solid var(--c-border)', md: 'none' },
      background: 'var(--c-surface)',
    }}>
      {selected}
      <Box>
        <CapsLabel>Drawing</CapsLabel>
        {reg && (
          <Row label="Number">
            <Box component="span" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Mono>{reg.number}</Mono><span>rev {reg.revision}</span><Badge family={REGISTER_STATUS_FAMILY[reg.status]} label={reg.status} noIcon />
            </Box>
          </Row>
        )}
        <Row label="Mark"><Mono>{drawing.mark}</Mono></Row>
        {rows.length > 0 && <Row label="Rows">{rowCodes(rows)}</Row>}
        <Row label="File">{drawing.fileName}</Row>
      </Box>

      {levels && levels.view.parts.length > 0 && (
        <Box data-testid="viewer-parts">
          <CapsLabel>Parts in this assembly</CapsLabel>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {levels.view.parts.map((r) => (
              <Box component="li" key={r.rowId}>
                <Button size="small" fullWidth disabled={!rowShows(r) && !inModel(r.mark)} onClick={() => levels.onGo(r.rowId)} data-testid="viewer-part" data-row={r.rowId}
                  sx={{ justifyContent: 'space-between', textAlign: 'left', py: 0.5 }}>
                  <span>{rowLabel(r)}</span>
                  <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>{rowShows(r) || inModel(r.mark) ? r.level : 'no drawing'}</Box>
                </Button>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {g ? (
        <Box data-testid="viewer-facts">
          <CapsLabel>What the app read</CapsLabel>
          <Row label="Size">{sizeText(g.lengthMm, g.widthMm)}</Row>
          <Row label="Area">{fmtM2(g.areaMm2 / 1e6)} · uses {fmtPct(g.usePct)}</Row>
          <Row label="Cut length">{fmtCutM(g.cutLengthMm)} ({fmtMm(g.cutLengthMm)} mm)</Row>
          <Row label="Piercings">{g.piercings}</Row>
          <Row label="Holes">{g.holes ? `${g.holes} · ${holesTitle(g)}` : 'none'}</Row>
          <Row label="Cut-outs">{g.innerCuts}</Row>
        </Box>
      ) : readFacts && (readFacts.lengthMm != null || readFacts.holes != null) ? (
        <Box data-testid="viewer-facts">
          <CapsLabel>What the app read</CapsLabel>
          {readFacts.lengthMm != null && readFacts.widthMm != null && <Row label="Size">{sizeText(readFacts.lengthMm, readFacts.widthMm)}</Row>}
          {readFacts.areaMm2 != null && <Row label="Area">{fmtM2(readFacts.areaMm2 / 1e6)}</Row>}
          <Row label="Holes">{readFacts.holes ? readFacts.holes : 'none'}</Row>
        </Box>
      ) : (
        drawing.fileKind === 'dxf' && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Only a plate part’s DXF is read as a shape. This one is shown as drawn.</Typography>
        )
      )}

      {view && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <CapsLabel>Layers</CapsLabel>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button size="small" sx={{ minWidth: 0, py: 0, fontSize: 12 }} onClick={() => onAll(true)}>All</Button>
              <Button size="small" sx={{ minWidth: 0, py: 0, fontSize: 12 }} onClick={() => onAll(false)}>None</Button>
            </Box>
          </Box>
          {/* Measurements and codes on / off in one click each (user, 2026-11-01): the dimension layers, and the text layers that carry the marks. */}
          {(() => {
            const dimLayers = view.layers.filter((l) => l.role === 'dim').map((l) => l.name);
            const codeLayers = view.layers.filter((l) => l.role === 'text').map((l) => l.name);
            const on = (names: string[]) => names.length > 0 && names.every((n) => !hidden.has(n));
            const flip = (names: string[]) => { const show = !on(names); for (const n of names) if (hidden.has(n) === show) onToggle(n); };
            if (!dimLayers.length && !codeLayers.length) return null;
            return (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', my: 0.75 }}>
                {dimLayers.length > 0 && <Button size="small" variant={on(dimLayers) ? 'contained' : 'outlined'} aria-pressed={on(dimLayers)} data-testid="viewer-measurements" onClick={() => flip(dimLayers)}>Measurements</Button>}
                {codeLayers.length > 0 && <Button size="small" variant={on(codeLayers) ? 'contained' : 'outlined'} aria-pressed={on(codeLayers)} data-testid="viewer-codes" onClick={() => flip(codeLayers)}>Codes</Button>}
              </Box>
            );
          })()}
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} data-testid="viewer-layers">
            {view.layers.map((l) => (
              <Box component="li" key={l.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 13 }}>
                <Checkbox size="small" checked={!hidden.has(l.name)} onChange={() => onToggle(l.name)} inputProps={{ 'aria-label': `Show layer ${l.name}` }} sx={{ p: 0.5 }} />
                <Box component="span" aria-hidden sx={{ width: 14, height: 3, borderRadius: 1, background: ROLE_COLOUR[l.role], flexShrink: 0 }} />
                <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{l.name}</Box>
                <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {ROLE_WORD[l.role] ? `${ROLE_WORD[l.role]} · ` : ''}{l.count || l.texts.length}
                </Box>
              </Box>
            ))}
          </Box>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>
            {view.entityCount.toLocaleString('en-US')} lines and curves{view.unitName ? ` · units: ${view.unitName}` : ''}
          </Typography>
          {view.warnings.map((w) => <Typography key={w} sx={{ fontSize: 12, color: 'var(--c-warning-800)', mt: 0.5 }}>{w}</Typography>)}
        </Box>
      )}
    </Box>
  );
}

export function DrawingViewer({ onClose, orderId, lineId, drawing, onUploadRevision, levels, large = false, fetchFile, downloadFile, loadModel, modelKey, readFacts, physics }: {
  onClose: () => void;
  /** Where the structure's physics view comes from when it is not an order line's (a standard's); a line's is read by default. */
  physics?: PhysicsSource;
  /**
   * Where the 3D model comes from when it is not an order line's (a standard drawing's), with `modelKey` naming it so
   * it is read once. Without it the line's model is read (GET …/lines/:lineId/model3d) when there is a line.
   */
  loadModel?: () => Promise<{ model: Model3D; codes?: Record<string, string> } | null>;
  modelKey?: string;
  /** What is known of the file's shape when there is no full geometry (a standard's part file): size, area, holes. */
  readFacts?: { lengthMm: number | null; widthMm: number | null; areaMm2: number | null; holes: number | null } | null;
  /** A file that is not an order line's (a standard drawing's part file): how to fetch and download it. */
  fetchFile?: () => Promise<Blob>;
  downloadFile?: () => Promise<void>;
  orderId: number;
  lineId: number;
  drawing: ViewerDrawing;
  /** Steps up and down the line's levels (breadcrumb, parts list, "Drawing of …"). */
  levels?: ViewerLevels;
  /** Big touch targets: the shop floor's shared tablet. */
  large?: boolean;
  /** Shown only when the person may upload; leads to the existing upload flow. */
  onUploadRevision?: () => void;
}) {
  const toast = useToast();
  const fs = useDialogFullscreen();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [strip, setStrip] = useState(!large);
  const urlRef = useRef<string | null>(null);
  // Linked copies: how many pieces are made to this drawing. Quiet on any failure — the viewer works without it.
  const [uses, setUses] = useState<DesignUses | null>(null);
  const [usesOpen, setUsesOpen] = useState(false);
  // The line's 3D model, if its standard keeps one (read once per line); the 3D switch shows only then.
  const [model, setModel] = useState<Model3D | null>(null);
  const [modelRead, setModelRead] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  // This order line's own changes to the standard's model (removed rows, new boxes, new part DXFs); a move reads it again.
  const [edits, setEdits] = useState<LineModelEdits | null>(null);
  const [modelTick, setModelTick] = useState(0);
  const canEdit = useIsPermitted()('cf_erp_orders_manage');
  /*
   * 3D FIRST (user, 2026-11-09: "first open 3D and when they click on 2D load that specific image"). When the line or
   * standard has its model (the one JSON) the viewer opens on 3D, and nothing of 2D is read or drawn — the file, or the
   * level drawn from the model — until 2D is asked for. Without a model it opens on 2D as before. null = not decided
   * yet (the model is still being read); the person's own choice then holds while they step through the levels.
   */
  const [pick3d, setPick3d] = useState<boolean | null>(null);
  const mode3d = pick3d ?? false;
  /** 2D has been shown (or its file is needed for a part's shape in 3D): from then on it is read and kept. */
  const [want2d, setWant2d] = useState(false);
  useEffect(() => { if (pick3d === false) setWant2d(true); }, [pick3d]);
  // THE PHYSICS VIEW of the structure (components/Drawings/PhysicsView.tsx): offered when one was run for it.
  const physicsSrc = useMemo(() => physics ?? (lineId > 0 ? linePhysics(orderId, lineId) : null), [physics, orderId, lineId]);
  const [physicsInfo, setPhysicsInfo] = useState<PhysicsInfo | null>(null);
  const [modePhysics, setModePhysics] = useState(false);
  useEffect(() => {
    let live = true;
    setPhysicsInfo(null);
    physicsSrc?.info().then((i) => { if (live && typeof i?.fileId === 'number') setPhysicsInfo(i); }).catch(() => { /* none run: no button */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physicsSrc?.key]);
  // A plate part in 3D: its outline (from this drawing, else the line's drawings) and its thickness. Read once, on the
  // first 3D click; a DXF that is not a plate part (a level's drawing) has none.
  const [part, setPart] = useState<Part3D | null | 'loading' | 'none'>(null);
  const canPart = drawing.fileKind === 'dxf' && drawing.id > 0;
  const askedServer = useRef(false);
  useEffect(() => { setPart(null); askedServer.current = false; }, [drawing.id]);
  const loadPart = useCallback(async () => {
    if (part !== null || !canPart) return;
    const of = (d: Pick<Drawing, 'geometry' | 'rows' | 'mark' | 'fileName'> | undefined): Part3D | null => {
      const g = d?.geometry; if (!g?.rings?.length) return null;
      const t = d?.rows?.find((r) => r.thicknessMm)?.thicknessMm ?? thicknessFromName(d?.fileName) ?? 10;
      return { label: d?.mark ?? drawing.mark, rings: g.rings, thicknessMm: Number(t), lengthMm: g.lengthMm, widthMm: g.widthMm };
    };
    const here = of(drawing as Drawing);
    if (here) { setPart(here); return; }
    // The server's shape of the part: its outline read for this one file (the list carries none since 2026-11-09), and
    // the list's facts and rows only when this drawing came without them (opened from the level tree).
    if (lineId > 0 && !askedServer.current) {
      askedServer.current = true;
      setPart('loading');
      try {
        const [list, shapes] = await Promise.all([
          drawing.geometry && drawing.rows ? null : getDrawings(orderId, lineId),
          getDrawingShapes(orderId, lineId, [drawing.id]),
        ]);
        const d = list ? list.drawings.find((x) => x.id === drawing.id) : (drawing as Drawing);
        const rings = shapes.shapes.find((x) => x.id === drawing.id)?.rings ?? null;
        const found = d?.geometry && rings ? of({ ...d, geometry: { ...d.geometry, rings } }) : null;
        if (found) { setPart(found); return; }
      } catch { /* read it from the file below */ }
    }
    // No shape from the server (a standard's part file): a plate part's shape is read from its own DXF (lib/dxfPick.ts).
    const plate = !!drawing.rows?.some((r) => r.isPlatePart) || thicknessFromName(drawing.fileName) != null;
    if (!plate || loaded.state === 'error' || loaded.state === 'pdf') { setPart('none'); return; }
    // In 3D the file is not read until it is needed. Without a model the part is all 3D has: read it now. With one, the
    // whole model shows and the part is read from the file once 2D has been opened.
    if (loaded.state !== 'dxf') { if (!model) setWant2d(true); setPart(null); return; }
    const t = drawing.rows?.find((r) => r.thicknessMm)?.thicknessMm ?? thicknessFromName(drawing.fileName) ?? 10;
    setPart(partOfView(loaded.view, drawing.mark, Number(t)) ?? 'none');
  }, [part, canPart, drawing, orderId, lineId, loaded, model]);
  const loadModelRef = useRef(loadModel);
  useEffect(() => { loadModelRef.current = loadModel; }, [loadModel]);
  useEffect(() => {
    let live = true;
    setModel(null); setCodes({}); setModelRead(false); setEdits(null);
    const read = loadModelRef.current ? loadModelRef.current() : lineId > 0 ? getLineModel3d(orderId, lineId) : Promise.resolve(null);
    // 3D or 2D is decided once, when the model has been read (or given up on): the person's own pick is never overridden.
    const decide = (has: boolean) => setPick3d((p) => p ?? has);
    read.then((r) => { if (live && r) { setModel(r.model); setCodes(r.codes ?? {}); setEdits((r as { edits?: LineModelEdits }).edits ?? null); decide(true); } }).catch(() => { /* no model: 2D only */ }).finally(() => { if (live) { setModelRead(true); decide(false); } });
    // A slow or failing model never holds back a line's file for long; if it comes later, the level still draws from it.
    const giveUp = setTimeout(() => { if (live) { setModelRead(true); decide(false); } }, MODEL_WAIT_MS);
    return () => { live = false; clearTimeout(giveUp); };
  }, [orderId, lineId, modelKey, modelTick]);
  // A LEVEL IS DRAWN FROM THE ONE MODEL (lib/modelDrawing.ts; user, 2026-11-02): no file is fetched for it. Part rows keep
  // their files for now, and "Customer sheet" still opens the file kept on the row.
  const levelMark = levels?.view.at.mark ?? drawing.mark;
  const oneModel = model?.schema === 'cf-erp-model3d/2' ? (model as unknown as ModelFile) : null;
  const inModel = useCallback((mark: string | null | undefined) => !!oneModel && modelHasLevel(oneModel, mark), [oneModel]);
  const [sourcePick, setSourcePick] = useState<'model' | 'file'>('model');
  // A row with no file whose mark is a PIECE of the model (a bracing angle, a bolt), not a level: drawn alone from the model.
  const pieceOnly = drawing.id === 0 && !!oneModel && !modelHasLevel(oneModel, levelMark) && modelHasPiece(oneModel, levelMark);
  const showModel = (inModel(levelMark) || pieceOnly) && sourcePick === 'model';
  // Until the model has been read the file waits: it may not be needed (up to 3 MB) — with a model the viewer opens on
  // 3D, and 2D is read only when it is asked for (want2d).
  const waitForModel = !modelRead || !want2d;
  const [drawn, setDrawn] = useState<DxfView | null>(null);
  const drawnBefore = useRef(new Map<string, DxfView>());
  useEffect(() => { drawnBefore.current.clear(); }, [model, codes]);
  useEffect(() => {
    if (!showModel || !oneModel || !want2d) { setDrawn(null); return undefined; }
    const before = drawnBefore.current.get(levelMark);
    setHidden(new Set(['HIDDEN']));
    if (before) { setDrawn(before); return undefined; }
    setDrawn(null);
    // After a paint, so the person sees "Drawing…" and not a frozen window on a whole span.
    const t = setTimeout(() => {
      const d = pieceOnly ? pieceDrawing(oneModel, levelMark, codes) : levelDrawing(oneModel, levelMark, codes);
      if (!d) { setSourcePick('file'); return; }
      drawnBefore.current.set(levelMark, d.view);
      setDrawn(d.view);
    }, 30);
    return () => clearTimeout(t);
  }, [showModel, oneModel, levelMark, codes, pieceOnly, want2d]);
  // In 3D, the part's shape is read as soon as it can be (the DXF may still be loading on the first click).
  useEffect(() => { if (mode3d && part === null) void loadPart(); }, [mode3d, part, loadPart]);
  // The level to light up: the open row, then each level above it, deepest first.
  const marks3d = useMemo(() => [drawing.mark, ...(levels ? [...levels.view.crumbs].reverse().map((c) => c.mark ?? null) : [])], [drawing.mark, levels]);
  // 3D selection and what the 3D view shows (one toggle: lib/model3d.ts scopeChoices). The person's choice is kept;
  // the scope shown falls back when that choice is not on offer (no selection, no lit level).
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [allOfMark, setAllOfMark] = useState(false);
  const [scopePick, setScopePick] = useState<Scope3D | null>(null);
  useEffect(() => { setSelIdx(null); setScopePick(null); setAllOfMark(false); }, [drawing.id, model]);
  const lit3d = useMemo(() => (model ? litMark(model, marks3d) : null), [model, marks3d]);
  const partObj = part && typeof part === 'object' ? part : null;
  const sel3d = useMemo(() => (model && selIdx != null ? selectionFacts(model, selIdx, allOfMark, codes) : null), [model, selIdx, allOfMark, codes]);
  const scope3d = settleScope(scopePick ?? (model && (lit3d || !partObj) ? 'whole' : 'part'), { hasModel: !!model, hasPart: !!partObj, lit: lit3d, selected: !!sel3d });
  const selIndices = sel3d?.indices;
  // A new row's box picked: where it is, and a move (its own order line's edit).
  const selEl = model && selIdx != null ? model.elements[selIdx] : null;
  const addedRow = selEl?.added && selEl.rowId ? edits?.added.find((a) => a.rowId === selEl.rowId) ?? null : null;
  const addedSel = useMemo(() => (addedRow ? { at: addedRow.at, moved: addedRow.moved } : null), [addedRow]);
  const moveAdded = useCallback(async (at: [number, number, number] | null) => {
    if (!addedRow) return;
    try {
      await placeAddedRow(orderId, lineId, addedRow.rowId, at);
      forgetLineModel(lineId);
      setModelTick((t) => t + 1);
      toast.success(at ? 'Moved.' : 'Put back beside its parent.');
    } catch (e) { toast.error((e as Error)?.message ?? 'It could not be moved.'); }
  }, [addedRow, orderId, lineId, toast]);
  const selected3d = useMemo(() => selIndices ?? [], [selIndices]);
  const onPick3d = useCallback((i: number | null) => {
    setSelIdx(i);
    if (i == null) setScopePick((s) => (s === 'selection' ? 'whole' : s));
    else setStrip(true);
  }, []);
  useEffect(() => {
    let live = true;
    setUses(null);
    if (!lineId) return () => { live = false; };
    getDesignUses(lineId, { drawingId: drawing.id }).then((r) => { if (live && r && Array.isArray(r.rows) && r.total > 0) setUses(r); }).catch(() => {});
    return () => { live = false; };
  }, [lineId, drawing.id]);

  // Fetch with the app's client (the JWT goes with it), then parse or hand the PDF to the browser.
  useEffect(() => {
    let live = true;
    setLoaded({ state: 'loading' });
    if (showModel || waitForModel) return () => { live = false; };
    setHidden(new Set());
    (async () => {
      try {
        const blob = fetchFile ? await fetchFile() : await fetchDrawingBlob(orderId, lineId, drawing);
        if (!live) return;
        if (drawing.fileKind === 'pdf') {
          const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          urlRef.current = url;
          setLoaded({ state: 'pdf', url });
          return;
        }
        const view = parseDxf(await blobAsText(blob));
        if (!live) return;
        if (!view.bounds || !view.layers.length) throw new DxfError('There is nothing to draw in this file.');
        setLoaded({ state: 'dxf', view });
      } catch (e) {
        if (live) setLoaded({ state: 'error', error: e instanceof DxfError ? new CfApiError(0, e.message) : asError(e) });
      }
    })();
    return () => {
      live = false;
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
    // The file is identified by its id; a new `drawing` object for the same file must not fetch it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, lineId, drawing.id, drawing.fileKind, attempt, showModel, waitForModel]);

  const view = showModel ? drawn : loaded.state === 'dxf' ? loaded.view : null;
  // 2D picking: the drawing's shapes are read from its layers on the first click (lib/dxfPick.ts), then kept.
  const shapesRef = useRef<{ view: DxfView; shapes: Shape[] } | null>(null);
  const [sel2d, setSel2d] = useState<number | null>(null);
  useEffect(() => { setSel2d(null); }, [view]);
  const shapesNow = useCallback((): Shape[] => {
    if (!view) return [];
    if (shapesRef.current?.view !== view) shapesRef.current = { view, shapes: shapesOf(view) };
    return shapesRef.current.shapes;
  }, [view]);
  /** The shapes on layers that are shown. */
  const pickAt = useCallback((x: number, y: number, tol: number) => {
    return pickShape(shapesNow(), x, y, tol, (sh) => hidden.has(sh.layer));
  }, [shapesNow, hidden]);
  const onTap = useCallback((x: number, y: number, tol: number) => {
    const i = pickAt(x, y, tol);
    setSel2d(i >= 0 ? i : null);
    if (i >= 0) setStrip(true);
  }, [pickAt]);
  const zoomRef = useRef<{ fit: () => void; zoomToBox: (b: { minX: number; minY: number; maxX: number; maxY: number }) => void } | null>(null);
  const onDoubleTap = useCallback((x: number, y: number, tol: number) => {
    const i = pickAt(x, y, tol);
    if (i < 0) { zoomRef.current?.fit(); return; }
    setSel2d(i); zoomRef.current?.zoomToBox(shapesNow()[i]);
  }, [pickAt, shapesNow]);
  const pz = usePanZoom({ bounds: view?.bounds ?? null, actualScale: PX_PER_MM / (view?.unitMm ?? 1), resetKey: view, memoryKey: `${orderId}:${lineId}:${showModel ? `model:${levelMark}` : drawing.id}`, quickWhileMoving: (view?.entityCount ?? 0) > QUICK_ABOVE, onTap, onDoubleTap });
  zoomRef.current = { fit: pz.fit, zoomToBox: pz.zoomToBox };
  const shape2d = view && sel2d != null ? shapesRef.current?.shapes[sel2d] ?? null : null;
  const facts2d = useMemo(() => (view && sel2d != null && shapesRef.current?.view === view ? shapeFacts(view, shapesRef.current.shapes, sel2d) : null), [view, sel2d]);

  // The viewport takes focus once there is something to look at, so the arrow keys work at once.
  const focusEl = useRef<HTMLElement | null>(null);
  const { viewportRef } = pz;
  const setViewportEl = useCallback((el: HTMLElement | null) => { viewportRef(el); focusEl.current = el; }, [viewportRef]);
  useEffect(() => { if (view) focusEl.current?.focus({ preventScroll: true }); }, [view]);

  const stable = useMemo(() => view?.layers ?? [], [view]);
  const toggle = (name: string) => setHidden((h) => { const n = new Set(h); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const showAll = (show: boolean) => setHidden(show ? new Set() : new Set(stable.map((l) => l.name)));

  const download = async () => {
    try {
      if (showModel && view) {
        // Only now does a level become a file.
        const url = URL.createObjectURL(new Blob([viewToDxf(view)], { type: 'application/dxf' }));
        const a = document.createElement('a'); a.href = url; a.download = `${levelMark}.dxf`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      if (downloadFile) await downloadFile(); else await downloadDrawing(orderId, lineId, drawing);
    } catch (e) { toast.error(asError(e).message); }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && (t as HTMLInputElement).type !== 'checkbox') return;
      e.preventDefault();
      fs.toggle();
    }
  };

  const iconSize = large ? 'large' : 'small';
  const btnSx = large ? { width: 56, height: 56 } : {};
  /** One toolbar icon: big on the shared tablet, with its tooltip. */
  const ib = (label: string, icon: React.ReactNode, onClick: () => void, extra: { disabled?: boolean; testid?: string; sx?: object; pressed?: boolean; text?: string } = {}) => (
    <Tooltip title={extra.text ?? label}>
      <span>
        <IconButton size={iconSize} onClick={onClick} disabled={extra.disabled} aria-label={label} aria-pressed={extra.pressed} data-testid={extra.testid}
          sx={{ color: 'var(--c-text-2)', ...btnSx, ...extra.sx }}>{icon}</IconButton>
      </span>
    </Tooltip>
  );
  const title = showModel ? (levels?.view.at.code ?? levelMark) : drawing.drawing ? `${drawing.drawing.number} · rev ${drawing.drawing.revision}` : drawing.mark;
  const isPdf = drawing.fileKind === 'pdf' && !showModel;
  const note = levels && !showModel ? inheritedLabel(levels.view) : null;

  return (
    <Dialog open onClose={(_, reason) => {
      // Esc clears a selection first, then leaves full screen, then closes.
      if (reason === 'escapeKeyDown' && mode3d && selIdx != null) { onPick3d(null); return; }
      if (reason === 'escapeKeyDown' && !mode3d && sel2d != null) { setSel2d(null); return; }
      if (reason === 'escapeKeyDown' && fs.active) fs.exit(); else onClose();
    }}
      fullScreen={fs.active || large} fullWidth maxWidth={false} onKeyDown={onKeyDown}
      aria-labelledby="drawing-viewer-title" data-testid="drawing-viewer"
      PaperProps={{ sx: fs.active || large ? {} : { width: 'min(96vw, 1500px)', height: 'min(92vh, 1000px)', maxHeight: '92vh' } }}>
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pb: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography id="drawing-viewer-title" component="h2" sx={{ fontSize: large ? 20 : 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{title}</Typography>
          <Box sx={{ fontSize: large ? 15 : 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.25, overflowWrap: 'anywhere' }} data-testid="viewer-source-line">{showModel ? 'Drawn from the structure’s model' : drawing.fileName}</Box>
          {/* Pieces whose position is not read yet are not drawn (user, 2026-11-07: no guessed positions); say how many. */}
          {model?.unplaced && Object.keys(model.unplaced).length > 0 && (showModel || mode3d) && (
            <Box data-testid="viewer-unplaced" title={Object.entries(model.unplaced).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ×${n}`).join(', ')}
              sx={{ fontSize: 12.5, color: 'var(--c-warning-700, #a15c00)', mt: 0.25 }}>
              {Object.values(model.unplaced).reduce((a, b) => a + b, 0).toLocaleString('en-IN')} pieces not yet positioned from the drawings, so not shown
            </Box>
          )}
          {edits && editsWords(edits) && (showModel || mode3d) && (
            <Box data-testid="viewer-edits" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: '2px', background: '#1f9e89', flexShrink: 0 }} aria-hidden />
              <span>Changed on this order: {editsWords(edits)}</span>
              <InfoTip testId="viewer-edits-info" text={<>
                The diagram follows this order's BOM. A row removed in the Structure step is taken out; a new row with length, width and thickness is drawn as a box beside its parent — select it to move it; a part given a new DXF is drawn with that shape. Changed pieces are teal. Reordering rows changes nothing. The standard itself is not changed.
                {edits.waiting.length > 0 && <><br />Waiting for sizes: {edits.waiting.map((w) => `${w.name ?? w.mark ?? `row ${w.rowId}`} (${w.missing.join(', ')})`).join('; ')}.</>}
              </>} />
            </Box>
          )}
          {uses && (
            <Box component="button" type="button" data-testid="viewer-used-by" onClick={() => setUsesOpen(true)}
              sx={{ all: 'unset', cursor: 'pointer', mt: 0.25, fontSize: large ? 15 : 13, color: 'var(--c-primary-700)', '&:hover': { textDecoration: 'underline' }, '&:focus-visible': { outline: '2px solid var(--c-primary-500)', borderRadius: 'var(--r-sm)' } }}>
              Used by {piecesWords(uses.total)}
            </Box>
          )}
          {note && <Box data-testid="viewer-inherited" sx={{ fontSize: large ? 15 : 13, fontWeight: 600, color: 'var(--c-warning-800)', mt: 0.25 }}>{note}</Box>}
        </Box>
        {onUploadRevision && (
          <Button size={large ? 'large' : 'small'} variant="outlined" startIcon={<UploadFileRounded />} onClick={onUploadRevision} data-testid="viewer-upload">Upload a new revision</Button>
        )}
        {ib(showModel ? 'Download as DXF' : 'Download file', <DownloadRounded fontSize={iconSize} />, download, { text: showModel ? 'Write this view as a DXF and download it' : 'Download the file' })}
        {fs.active ? (
          <Button size={large ? 'large' : 'small'} variant="contained" startIcon={<FullscreenExitRounded />} onClick={fs.exit} data-testid="viewer-fullscreen">Exit full screen</Button>
        ) : ib('Show the drawing full screen', <FullscreenRounded fontSize={iconSize} />, fs.enter, { testid: 'viewer-fullscreen', text: 'Full screen (F; Esc to leave)' })}
        {ib('Close', <CloseRounded fontSize={iconSize} />, onClose)}
      </DialogTitle>

      {levels && levels.view.crumbs.length > 1 && (
        <Box component="nav" aria-label="Levels of this line" data-testid="viewer-crumbs" sx={{ px: 3, pb: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.25 }}>
          {levels.view.crumbs.map((c, i) => (
            <Box key={c.rowId} component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 && <NavigateNextRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} />}
              <Button size={large ? 'medium' : 'small'} disabled={!c.hasDrawing && !c.current && !inModel(c.mark)} aria-current={c.current ? 'step' : undefined} data-testid="viewer-crumb" data-row={c.rowId}
                onClick={() => levels.onGo(c.rowId)} title={c.hasDrawing ? c.level : `${c.level} — no drawing`}
                sx={{ minWidth: 0, px: 0.75, fontWeight: c.current ? 700 : 500, textDecoration: c.current ? 'underline' : 'none', minHeight: large ? 44 : undefined, color: c.hasDrawing || c.current ? undefined : 'var(--c-text-3)' }}>
                {c.name}
              </Button>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 3, pb: 1, minHeight: 36, flexWrap: 'wrap' }}>
        {(model || canPart) && (
          <ToggleButtonGroup size="small" exclusive value={mode3d ? '3d' : '2d'} aria-label="3D or 2D" sx={{ mr: 0.5 }}
            onChange={(_, v) => { if (!v) return; setModePhysics(false); if (v === '3d') { if (!mode3d) void loadPart(); setPick3d(true); } else setPick3d(false); }}>
            <ToggleButton value="3d" data-testid="viewer-3d-toggle" sx={{ textTransform: 'none' }}><ViewInArRounded sx={{ fontSize: 18, mr: 0.5 }} />3D</ToggleButton>
            <ToggleButton value="2d" data-testid="viewer-2d-toggle" sx={{ textTransform: 'none' }}>2D drawing</ToggleButton>
          </ToggleButtonGroup>
        )}
        {!isPdf && !mode3d && (
          <>
            {ib('Zoom out', <ZoomOutRounded fontSize={iconSize} />, pz.zoomOut, { disabled: !view })}
            <Typography aria-live="polite" data-testid="viewer-percent" sx={{ fontFamily: 'var(--font-mono)', fontSize: large ? 15 : 12.5, minWidth: 52, textAlign: 'center', color: 'var(--c-text-2)' }}>
              {view ? `${pz.percent}%` : '—'}
            </Typography>
            {ib('Zoom in', <ZoomInRounded fontSize={iconSize} />, pz.zoomIn, { disabled: !view })}
            {ib('Fit the drawing to the window', <FitScreenRounded fontSize={iconSize} />, pz.fit, { disabled: !view, text: 'Fit the whole drawing' })}
            {ib('Fit the drawing to the width', <WidthFullRounded fontSize={iconSize} />, pz.fitWidth, { disabled: !view, text: 'Fit to width (a long drawing, read along its length)' })}
            <Tooltip title="True size (96 dpi)"><span><Button size={large ? 'large' : 'small'} onClick={pz.actual} disabled={!view} sx={{ minWidth: 0, px: 1 }}>100%</Button></span></Tooltip>
            <Typography sx={{ ml: 1, fontSize: 12, color: 'var(--c-text-3)', display: { xs: 'none', md: large ? 'none' : 'block' } }}>
              Drag (or Ctrl / Shift / middle drag) to pan · scroll to zoom at the cursor · click a shape for its details · double-click to zoom to it, empty space to fit
            </Typography>
          </>
        )}
        {isPdf && !mode3d && <Typography data-testid="viewer-pdf-note" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>PDF — zoom and pan use your browser’s PDF viewer.</Typography>}
        <Box sx={{ flex: 1 }} />
        {inModel(levelMark) && !mode3d && drawing.id !== 0 && (
          <ToggleButtonGroup size="small" exclusive value={sourcePick} onChange={(_, v) => { if (v) setSourcePick(v); }} aria-label="What to show" sx={{ mr: 0.5 }}>
            <ToggleButton value="model" data-testid="viewer-source-model">From the model</ToggleButton>
            <ToggleButton value="file" data-testid="viewer-source-file">Customer sheet</ToggleButton>
          </ToggleButtonGroup>
        )}
        {physicsInfo && (
          <Button size={large ? 'large' : 'small'} variant={modePhysics ? 'contained' : 'outlined'} startIcon={<ScienceRounded />} onClick={() => setModePhysics((x) => !x)}
            data-testid="viewer-physics-toggle" aria-pressed={modePhysics}>{modePhysics ? 'Back to the drawing' : 'Physics'}</Button>
        )}
        {ib('Details', <ViewSidebarRounded fontSize={iconSize} />, () => setStrip((x) => !x), { testid: 'viewer-strip-toggle', pressed: strip, text: strip ? 'Hide the details' : 'Show the details', sx: { color: strip ? 'var(--c-primary-700)' : 'var(--c-text-2)' } })}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, borderTop: '1px solid var(--c-border)' }}>
        {modePhysics && physicsInfo && physicsSrc && (
          <Suspense fallback={<Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Loading the physics view…</Box>}>
            <PhysicsView source={physicsSrc} info={physicsInfo} />
          </Suspense>
        )}
        {pick3d === null && !modePhysics && (
          <Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Reading the 3D model…</Box>
        )}
        {mode3d && !modePhysics && (
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', background: 'var(--c-surface-2)' }}>
            {part === 'loading' || (!model && part === null && loaded.state === 'loading') ? (
              <Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Reading the part’s shape…</Box>
            ) : !model && (part === 'none' || part === null) ? (
              <Typography data-testid="model3d-none" sx={{ m: 'auto', p: 3, maxWidth: 460, fontSize: 14, color: 'var(--c-text-2)', textAlign: 'center' }}>
                No 3D for this drawing yet: it is not a plate part with a shape, and this line has no 3D model.
              </Typography>
            ) : (
              <Suspense fallback={<Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Loading the 3D view…</Box>}>
                <Model3DView model={model} part={partObj} marks={marks3d} codes={codes} scope={scope3d} onScope={setScopePick} selected={selected3d} onPick={onPick3d} />
              </Suspense>
            )}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: mode3d || modePhysics || pick3d === null ? 'none' : 'flex', background: 'var(--c-surface-2)' }}>
          {(showModel ? !view : loaded.state === 'loading') && (
            <Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}>
              <CircularProgress size={18} /> {showModel ? 'Drawing it from the model…' : 'Loading the drawing…'}
            </Box>
          )}
          {!showModel && loaded.state === 'error' && (
            <Box sx={{ m: 'auto', p: 3, maxWidth: 480, display: 'grid', gap: 1.5 }} data-testid="viewer-error">
              <ErrorNotice error={loaded.error} sx={{ mb: 0 }} />
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>The drawing could not be shown here. The file itself is still saved.</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
                <Button variant="contained" startIcon={<DownloadRounded />} onClick={download}>Download file</Button>
              </Box>
            </Box>
          )}
          {!showModel && loaded.state === 'pdf' && (
            <object data={loaded.url} type="application/pdf" aria-label={`PDF drawing ${drawing.fileName}`} data-testid="viewer-pdf" style={{ width: '100%', height: '100%', border: 0 }}>
              <Box sx={{ m: 'auto', p: 3, display: 'grid', gap: 1.5, justifyItems: 'start' }}>
                <Typography sx={{ fontSize: 14 }}>Your browser cannot show this PDF here.</Typography>
                <Button variant="contained" startIcon={<DownloadRounded />} onClick={download}>Download file</Button>
              </Box>
            </object>
          )}
          {view && view.bounds && (
            <Box
              ref={setViewportEl}
              tabIndex={0} role="group" aria-roledescription="drawing viewer" aria-label={`Drawing ${drawing.fileName}. Arrow keys pan, plus and minus zoom, 0 fits.`}
              data-testid="viewer-viewport" {...pz.bind}
              sx={{
                flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', cursor: 'grab', '&:active': { cursor: 'grabbing' },
                // none, so a two-finger pinch reaches the handlers instead of zooming the page.
                touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', outlineOffset: -2,
                '& text': { userSelect: 'none', WebkitUserSelect: 'none' },
              }}>
              <svg width="100%" height="100%" role="img" aria-label={`Drawing ${drawing.fileName}`} style={{ display: 'block' }}
                data-testid="viewer-svg" data-bounds={`${view.bounds.minX} ${view.bounds.minY} ${view.bounds.maxX - view.bounds.minX} ${view.bounds.maxY - view.bounds.minY}`}>
                <g ref={pz.contentRef} data-testid="viewer-content">
                  <Scene layers={stable} hidden={hidden} />
                  {shape2d && (
                    <path d={shapePath(shape2d)} data-testid="viewer-selected-shape" pointerEvents="none" vectorEffect="non-scaling-stroke"
                      stroke="var(--c-danger-600)" strokeWidth={3} strokeLinejoin="round" fill={shape2d.closed ? 'var(--c-danger-600)' : 'none'} fillOpacity={0.14} />
                  )}
                </g>
              </svg>
            </Box>
          )}
        </Box>
        {strip && !modePhysics && (
          <SideStrip drawing={drawing} view={view} hidden={hidden} onToggle={toggle} onAll={showAll} levels={levels} readFacts={readFacts} inModel={inModel}
            selected={mode3d
              ? sel3d && <Selected3D sel={sel3d} scope={scope3d} onScope={setScopePick} allOfMark={allOfMark} onAllOfMark={setAllOfMark} onClear={() => onPick3d(null)}
                  added={addedSel} onMove={canEdit && lineId > 0 && addedSel ? moveAdded : undefined} />
              : facts2d && shape2d && <Selected2D facts={facts2d} onZoom={() => pz.zoomToBox(shape2d)} onClear={() => setSel2d(null)} />} />
        )}
      </Box>
      {usesOpen && uses && <DesignUsesDialog uses={uses} onClose={() => setUsesOpen(false)} />}
    </Dialog>
  );
}
