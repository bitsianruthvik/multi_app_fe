import { useContext, useEffect, useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogContent, IconButton, Tooltip, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DrawRounded from '@mui/icons-material/DrawRounded';
import { CfApiError } from '../../api/client';
import { getDrawingTree, type DrawingTree, type DrawingTreeRow } from '../../api/drawings';
import { findRow, levelView } from '../../lib/drawingLevels';
import { LineDrawingContext } from '../../hooks/lineDrawingContext';
import { DrawingViewer, type ViewerDrawing } from './DrawingViewer';
import { ErrorNotice } from '../ui';

/**
 * THE DRAWING OF A ROW, WHEREVER THE ROW IS MET — a production screen, a work order, the plan, the nesting list.
 *
 * It reads the line's drawing tree ONCE (view permission only) and opens the same viewer on the row's drawing; a row with
 * none shows the nearest ancestor's, labelled "Drawing of …". Inside, the breadcrumb and the "Parts in this assembly"
 * list step up and down the levels without another round trip. The screen only has to know the order, the line and
 * the row (the BOM row's id, or a cut plate id when all it knows is a cut piece).
 */

export interface RowRef { orderId: number; lineId: number; rowId?: number | null; cutPlateId?: number | null; label?: string | null }

const asDrawing = (r: DrawingTreeRow): ViewerDrawing => ({
  id: r.drawingId!, mark: r.mark ?? r.code ?? r.name, fileName: r.fileName ?? 'drawing', fileKind: r.fileKind ?? 'dxf',
  drawing: r.number ? { id: 0, code: null, number: r.number, revision: r.revision ?? 'A', status: r.status ?? 'issued', title: null, earlier: [] } : null,
});

export function RowDrawingViewer({ target, onClose, large = false }: { target: RowRef; onClose: () => void; large?: boolean }) {
  const [tree, setTree] = useState<DrawingTree | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setTree(null); setError(null);
    getDrawingTree(target.orderId, target.lineId)
      .then((t) => { if (live) { setTree(t); setAt(findRow(t, target)?.rowId ?? null); } })
      .catch((e) => { if (live) setError(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e))); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.orderId, target.lineId, target.rowId, target.cutPlateId, attempt]);

  const view = useMemo(() => (tree && at != null ? levelView(tree, at) : null), [tree, at]);
  const drawing = useMemo(() => (view?.shown ? asDrawing(view.shown) : null), [view?.shown]);
  const levels = useMemo(() => (view ? { view, onGo: setAt } : undefined), [view]);

  if (view && drawing) return <DrawingViewer orderId={target.orderId} lineId={target.lineId} drawing={drawing} levels={levels} large={large} onClose={onClose} />;

  // Not there yet, or nothing to show: one small dialog says which.
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-label="Drawing" data-testid="row-viewer-note">
      <DialogContent sx={{ display: 'grid', gap: 1.5, position: 'relative' }}>
        <Tooltip title="Close"><IconButton size="small" onClick={onClose} aria-label="Close" sx={{ position: 'absolute', top: 8, right: 8 }}><CloseRounded fontSize="small" /></IconButton></Tooltip>
        {error && <ErrorNotice error={error} onRetry={() => setAttempt((n) => n + 1)} sx={{ mb: 0 }} />}
        {!error && !tree && <Typography role="status" sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>Looking for the drawing…</Typography>}
        {tree && !view && (
          <Typography data-testid="row-viewer-unknown" sx={{ fontSize: 14 }}>This piece is not a row of the line’s structure, so it has no drawing to show.</Typography>
        )}
        {tree && view && !view.shown && (
          <Box data-testid="row-viewer-none" sx={{ display: 'grid', gap: 1 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>No drawing for {view.at.name}</Typography>
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Neither this row nor any level above it has a drawing yet. Drawings are added on the order’s Structure tab.</Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><Button onClick={onClose} size={large ? 'large' : 'medium'}>Close</Button></Box>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The "View drawing" action for a row: a button (or, `icon`, a small icon button) that owns the viewer's open state.
 * `large` is the shop floor's: a tall button, and the viewer with big touch targets.
 */
export function ViewDrawingButton({ target, large = false, icon = false, label = 'View drawing', sx }: {
  target: RowRef | null; large?: boolean; icon?: boolean; label?: string; sx?: object;
}) {
  const [open, setOpen] = useState(false);
  if (!target) return null;
  return (
    <>
      {icon ? (
        <Tooltip title={`${label}${target.label ? ` — ${target.label}` : ''}`}>
          <IconButton size={large ? 'large' : 'small'} aria-label={`${label}${target.label ? ` ${target.label}` : ''}`} data-testid="view-drawing" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
            sx={large ? { width: 56, height: 56, border: '1px solid var(--c-border)', ...sx } : sx}>
            <DrawRounded fontSize={large ? 'large' : 'small'} />
          </IconButton>
        </Tooltip>
      ) : (
        <Button variant="outlined" size={large ? 'large' : 'small'} startIcon={<DrawRounded />} data-testid="view-drawing" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          sx={large ? { minHeight: 56, fontSize: 17, px: 2.5, ...sx } : sx}>{label}</Button>
      )}
      {open && (
        // The viewer is a portal, but React still bubbles its clicks and keys to whatever row or card holds this button.
        <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <RowDrawingViewer target={target} large={large} onClose={() => setOpen(false)} />
        </span>
      )}
    </>
  );
}

/** "View drawing" for a CUT PLATE (the nesting screen knows cut plates, not rows): the drawing of the part it is cut for. */
export function CutPlateDrawingButton({ cutPlateId, label }: { cutPlateId: number; label?: string | null }) {
  const line = useContext(LineDrawingContext);
  if (!line) return null;
  return <ViewDrawingButton icon target={{ orderId: line.orderId, lineId: line.lineId, cutPlateId, label }} />;
}
