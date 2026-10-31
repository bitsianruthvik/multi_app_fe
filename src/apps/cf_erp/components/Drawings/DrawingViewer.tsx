import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Box, Button, Checkbox, CircularProgress, Dialog, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
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
import { blobAsText, downloadDrawing, fetchDrawingBlob, getLineModel3d, type Drawing, type Model3D } from '../../api/drawings';

// three.js only loads when someone opens the 3D view.
const Model3DView = lazy(() => import('./Model3DView'));
import { getDesignUses, type DesignUses } from '../../api/links';
import { piecesWords } from '../../lib/links';
import { DesignUsesDialog } from './DesignUsesDialog';
import { useDialogFullscreen } from '../../hooks/useDialogFullscreen';
import { usePanZoom } from '../../hooks/usePanZoom';
import { fmtCutM, fmtM2, fmtMm, fmtPct, holesTitle, REGISTER_STATUS_FAMILY, rowCodes, sizeText } from '../../lib/drawings';
import { DxfError, parseDxf, type DxfLayer, type DxfView, type LayerRole } from '../../lib/dxfView';
import { inheritedLabel, rowLabel, rowShows, type LevelView } from '../../lib/drawingLevels';
import { useToast } from '../toastContext';
import { Badge, CapsLabel, ErrorNotice, Mono } from '../ui';

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
          {l.d && (
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

function SideStrip({ drawing, view, hidden, onToggle, onAll, levels }: {
  drawing: ViewerDrawing; view: DxfView | null; hidden: ReadonlySet<string>; onToggle: (name: string) => void; onAll: (show: boolean) => void; levels?: ViewerLevels;
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
                <Button size="small" fullWidth disabled={!rowShows(r)} onClick={() => levels.onGo(r.rowId)} data-testid="viewer-part" data-row={r.rowId}
                  sx={{ justifyContent: 'space-between', textAlign: 'left', py: 0.5 }}>
                  <span>{rowLabel(r)}</span>
                  <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>{rowShows(r) ? r.level : 'no drawing'}</Box>
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

export function DrawingViewer({ onClose, orderId, lineId, drawing, onUploadRevision, levels, large = false, fetchFile, downloadFile }: {
  onClose: () => void;
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
  const [mode3d, setMode3d] = useState(false);
  useEffect(() => {
    let live = true;
    setModel(null);
    getLineModel3d(orderId, lineId).then((r) => { if (live) setModel(r.model); }).catch(() => { /* no model: 2D only */ });
    return () => { live = false; };
  }, [orderId, lineId]);
  // The level to light up: the open row, then each level above it, deepest first.
  const marks3d = useMemo(() => [drawing.mark, ...(levels ? [...levels.view.crumbs].reverse().map((c) => c.mark ?? null) : [])], [drawing.mark, levels]);
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
    setLoaded({ state: 'loading' }); setHidden(new Set());
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
  }, [orderId, lineId, drawing.id, drawing.fileKind, attempt]);

  const view = loaded.state === 'dxf' ? loaded.view : null;
  const pz = usePanZoom({ bounds: view?.bounds ?? null, actualScale: PX_PER_MM / (view?.unitMm ?? 1), resetKey: view, memoryKey: `${orderId}:${lineId}:${drawing.id}`, quickWhileMoving: (view?.entityCount ?? 0) > QUICK_ABOVE });

  // The viewport takes focus once there is something to look at, so the arrow keys work at once.
  const focusEl = useRef<HTMLElement | null>(null);
  const { viewportRef } = pz;
  const setViewportEl = useCallback((el: HTMLElement | null) => { viewportRef(el); focusEl.current = el; }, [viewportRef]);
  useEffect(() => { if (view) focusEl.current?.focus({ preventScroll: true }); }, [view]);

  const stable = useMemo(() => view?.layers ?? [], [view]);
  const toggle = (name: string) => setHidden((h) => { const n = new Set(h); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const showAll = (show: boolean) => setHidden(show ? new Set() : new Set(stable.map((l) => l.name)));

  const download = async () => {
    try { if (downloadFile) await downloadFile(); else await downloadDrawing(orderId, lineId, drawing); } catch (e) { toast.error(asError(e).message); }
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
  const title = drawing.drawing ? `${drawing.drawing.number} · rev ${drawing.drawing.revision}` : drawing.mark;
  const isPdf = drawing.fileKind === 'pdf';
  const note = levels ? inheritedLabel(levels.view) : null;

  return (
    <Dialog open onClose={(_, reason) => { if (reason === 'escapeKeyDown' && fs.active) fs.exit(); else onClose(); }}
      fullScreen={fs.active || large} fullWidth maxWidth={false} onKeyDown={onKeyDown}
      aria-labelledby="drawing-viewer-title" data-testid="drawing-viewer"
      PaperProps={{ sx: fs.active || large ? {} : { width: 'min(96vw, 1500px)', height: 'min(92vh, 1000px)', maxHeight: '92vh' } }}>
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pb: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography id="drawing-viewer-title" component="h2" sx={{ fontSize: large ? 20 : 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{title}</Typography>
          <Box sx={{ fontSize: large ? 15 : 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.25, overflowWrap: 'anywhere' }}>{drawing.fileName}</Box>
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
        {ib('Download file', <DownloadRounded fontSize={iconSize} />, download, { text: 'Download the file' })}
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
              <Button size={large ? 'medium' : 'small'} disabled={!c.hasDrawing && !c.current} aria-current={c.current ? 'step' : undefined} data-testid="viewer-crumb" data-row={c.rowId}
                onClick={() => levels.onGo(c.rowId)} title={c.hasDrawing ? c.level : `${c.level} — no drawing`}
                sx={{ minWidth: 0, px: 0.75, fontWeight: c.current ? 700 : 500, textDecoration: c.current ? 'underline' : 'none', minHeight: large ? 44 : undefined, color: c.hasDrawing || c.current ? undefined : 'var(--c-text-3)' }}>
                {c.name}
              </Button>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 3, pb: 1, minHeight: 36, flexWrap: 'wrap' }}>
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
              Scroll to zoom · drag to pan · Shift + scroll pans sideways
            </Typography>
          </>
        )}
        {isPdf && !mode3d && <Typography data-testid="viewer-pdf-note" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>PDF — zoom and pan use your browser’s PDF viewer.</Typography>}
        <Box sx={{ flex: 1 }} />
        {model && (
          <Button size={large ? 'large' : 'small'} variant={mode3d ? 'contained' : 'outlined'} startIcon={<ViewInArRounded />} onClick={() => setMode3d((x) => !x)}
            data-testid="viewer-3d-toggle" aria-pressed={mode3d}>{mode3d ? 'Back to 2D' : '3D'}</Button>
        )}
        {ib('Details', <ViewSidebarRounded fontSize={iconSize} />, () => setStrip((x) => !x), { testid: 'viewer-strip-toggle', pressed: strip, text: strip ? 'Hide the details' : 'Show the details', sx: { color: strip ? 'var(--c-primary-700)' : 'var(--c-text-2)' } })}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, borderTop: '1px solid var(--c-border)' }}>
        {mode3d && model && (
          <Suspense fallback={<Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}><CircularProgress size={18} /> Loading the 3D view…</Box>}>
            <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', background: 'var(--c-surface-2)' }}><Model3DView model={model} marks={marks3d} /></Box>
          </Suspense>
        )}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: mode3d && model ? 'none' : 'flex', background: 'var(--c-surface-2)' }}>
          {loaded.state === 'loading' && (
            <Box role="status" sx={{ m: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: 'var(--c-text-2)' }}>
              <CircularProgress size={18} /> Loading the drawing…
            </Box>
          )}
          {loaded.state === 'error' && (
            <Box sx={{ m: 'auto', p: 3, maxWidth: 480, display: 'grid', gap: 1.5 }} data-testid="viewer-error">
              <ErrorNotice error={loaded.error} sx={{ mb: 0 }} />
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>The drawing could not be shown here. The file itself is still saved.</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
                <Button variant="contained" startIcon={<DownloadRounded />} onClick={download}>Download file</Button>
              </Box>
            </Box>
          )}
          {loaded.state === 'pdf' && (
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
                </g>
              </svg>
            </Box>
          )}
        </Box>
        {strip && <SideStrip drawing={drawing} view={view} hidden={hidden} onToggle={toggle} onAll={showAll} levels={levels} />}
      </Box>
      {usesOpen && uses && <DesignUsesDialog uses={uses} onClose={() => setUsesOpen(false)} />}
    </Dialog>
  );
}
