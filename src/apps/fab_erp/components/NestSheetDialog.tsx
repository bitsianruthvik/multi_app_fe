/**
 * ONE SHEET, LARGE — exactly how it gets cut.
 *
 * The row in the nesting list carries a 116-px thumbnail, which says "roughly
 * this" and no more. A cutter needs the real thing: every piece numbered on the
 * drawing with its size and its offset from the plate's corner, and the same
 * pieces listed underneath in cut order. Same `NestSheetSvg`, scaled to the
 * dialog and with labels and rulers switched on, so the picture here and the
 * thumbnail there can never disagree.
 */
import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { DialogCloseButton } from './FormDialog';
import NestSheetSvg, { type PlacedPiece } from './NestSheetSvg';
import { downloadNestDxf, type Blank, type Nest } from '../api/blanks';
import { backendMessage } from '../utils/backendMessage';

export default function NestSheetDialog({ nest, blanks, onClose, orderId, accepted }: {
  nest: Nest | null;
  blanks: Blank[];
  onClose: () => void;
  /** With `accepted`, offers the sheet as a DXF — the server only draws accepted sheets. */
  orderId?: number | string;
  accepted?: boolean;
}) {
  const [dxfBusy, setDxfBusy] = useState(false);
  const [dxfError, setDxfError] = useState<string | null>(null);
  const downloadDxf = async () => {
    if (!nest || orderId == null) return;
    setDxfBusy(true);
    setDxfError(null);
    try {
      await downloadNestDxf(orderId, nest.nestNo);
    } catch (err) {
      setDxfError(backendMessage(err, 'Could not produce the DXF.'));
    } finally {
      setDxfBusy(false);
    }
  };
  const handleOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blanks) m.set(b.key, b.ref ?? b.code.replace(/^(?:CP|BLK)-\d+-/, ''));
    return m;
  }, [blanks]);

  const pieces: PlacedPiece[] | undefined = useMemo(() => {
    if (!nest?.pieces?.length) return undefined;
    const counter = new Map<string, number>();
    return nest.pieces.map((p) => {
      const idx = (counter.get(p.key) ?? 0) + 1;
      counter.set(p.key, idx);
      const it = nest.items.find((i) => i.key === p.key);
      return {
        key: p.key, name: handleOf.get(p.key) ?? it?.name ?? p.key, index: idx, qty: it?.qty ?? 1,
        x: p.x, y: p.y, l: p.l, w: p.w, rotated: p.rotated,
      };
    });
  }, [nest, handleOf]);

  if (!nest) return null;
  const pct = nest.utilisationPct ?? nest.usedPct ?? 0;
  // Fit the plate to ~1040 px of width, whatever its proportions.
  const scale = Math.min(1040 / Math.max(1, nest.length), 520 / Math.max(1, nest.width));

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 6 }}>
        <Box component="span" sx={{ fontFamily: 'var(--font-mono, monospace)' }}>{nest.nestNo}</Box>
        <Typography component="span" sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
          {nest.plateCode ?? nest.plateName ?? 'plate'} · {nest.thickness} × {nest.width} × {nest.length} mm · {nest.plateKg.toFixed(0)} kg
        </Typography>
        <Chip size="small" variant="outlined" label={`${pct.toFixed(0)}% used`} />
        {nest.piecesDerived && (
          <Chip size="small" variant="outlined" color="warning" label="layout re-packed for display — the accepted plan kept none" />
        )}
        {accepted && orderId != null && (
          <Button
            size="small" variant="outlined" startIcon={<DownloadIcon />} disabled={dxfBusy}
            onClick={() => void downloadDxf()} sx={{ ml: 'auto' }}
          >
            {dxfBusy ? 'Preparing…' : 'Download DXF'}
          </Button>
        )}
      </DialogTitle>
      <DialogCloseButton absolute onClose={onClose} />
      <DialogContent>
        {dxfError && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-danger, #b00020)', mb: 1 }}>{dxfError}</Typography>
        )}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.5 }}>
          Origin is the plate's top-left corner; every piece is numbered on the drawing and listed below with
          its size and the offset of its own top-left corner. ↻ means the piece is turned through 90°.
        </Typography>
        <Box sx={{ overflowX: 'auto', pb: 1 }}>
          <NestSheetSvg
            plate={nest} items={nest.items} pieces={pieces} scale={scale} labels rulers
          />
        </Box>
        <Box component="table" sx={{ mt: 2, borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              {['#', 'Cut plate', 'Size (L × W)', 'X', 'Y', 'Turned'].map((h) => (
                <Box component="th" key={h} sx={{
                  textAlign: h === '#' || h === 'Cut plate' ? 'left' : 'right', fontSize: 11, fontWeight: 600,
                  color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.04em',
                  px: 1, py: 0.5, borderBottom: '1px solid var(--c-divider)',
                }}>{h}</Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {pieces ? pieces.map((p, i) => (
              <tr key={`${p.key}-${i}`}>
                <Box component="td" sx={{ px: 1, py: 0.4, fontFamily: 'var(--font-mono, monospace)' }}>#{i + 1}</Box>
                <Box component="td" sx={{ px: 1, py: 0.4, fontFamily: 'var(--font-mono, monospace)' }}>
                  {p.name} <Box component="span" sx={{ color: 'var(--c-text-3)' }}>({p.index} of {p.qty})</Box>
                </Box>
                <Box component="td" sx={{ px: 1, py: 0.4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(p.l)} × {Math.round(p.w)}</Box>
                <Box component="td" sx={{ px: 1, py: 0.4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(p.x)}</Box>
                <Box component="td" sx={{ px: 1, py: 0.4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(p.y)}</Box>
                <Box component="td" sx={{ px: 1, py: 0.4, textAlign: 'right' }}>{p.rotated ? '↻' : ''}</Box>
              </tr>
            )) : (
              <tr>
                <Box component="td" colSpan={6} sx={{ px: 1, py: 1, color: 'var(--c-text-3)' }}>
                  No layout was kept for this sheet — the drawing above is a shelf arrangement of what it carries:
                  {' '}{nest.items.map((it) => `${it.qty} × ${it.rect}`).join(', ')}.
                </Box>
              </tr>
            )}
          </tbody>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
          {nest.items.map((it) => (
            <Chip key={it.key} size="small" variant="outlined"
              label={`${handleOf.get(it.key) ?? it.name}: ${it.qty} × ${it.rect}`}
              sx={{ fontFamily: 'var(--font-mono, monospace)' }} />
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
