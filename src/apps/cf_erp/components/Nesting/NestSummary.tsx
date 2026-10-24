import type { ReactNode } from 'react';
import { Box, Button, CircularProgress, Tooltip } from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import ContentCutRounded from '@mui/icons-material/ContentCutRounded';
import { CapsLabel, Mono, Surface } from '../ui';
import { FlashOnChange } from '../../motion';

/**
 * THE LINE'S NESTING IN FOUR FIGURES, and what is still to do.
 *
 * The strip is the answer to "how did it come out": plates, the steel that buys,
 * how much of it is waste, and how many of the line's pieces are on a plate.
 * The banner under it is the only call to action once a line is nested: pieces
 * are left over, and here are the two ways to nest them — more files first
 * (the team nests in its own program), ours second. A third way closes the line
 * without nesting (§61, 2026-10-14): the pieces the shop cuts from loose offcuts
 * in the yard are marked as cut from untracked offcuts.
 */

export interface SummaryFigure { key: string; label: string; value: string; hint?: string; warn?: boolean }

export function NestSummaryStrip({ figures, children }: { figures: SummaryFigure[]; children?: ReactNode }) {
  return (
    <Surface e={1} data-testid="nest-summary" sx={{ p: { xs: 1.5, sm: 2 }, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25, minWidth: 0 }}>
      <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' } }}>
        {figures.map((f) => {
          const cell = (
            <Box data-testid={`summary-${f.key}`} sx={{ minWidth: 0 }}>
              <CapsLabel>{f.label}</CapsLabel>
              <Box sx={{
                fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 600, lineHeight: 1.2, overflowWrap: 'anywhere',
                color: f.warn ? 'var(--c-warning-800)' : 'var(--c-text)',
              }}><FlashOnChange value={f.value}>{f.value}</FlashOnChange></Box>
            </Box>
          );
          return f.hint ? <Tooltip key={f.key} title={f.hint} placement="top-start">{cell}</Tooltip> : <Box key={f.key} sx={{ minWidth: 0 }}>{cell}</Box>;
        })}
      </Box>
      {children}
    </Surface>
  );
}

export interface LeftOverRow { cutPlateId: number; code: string; qty: number; heldBack: boolean }

/** How many left-over pieces the banner names before it says "more". */
const SHOWN_LEFT_OVER = 12;

export function LeftOverBanner({ pieces, rows, heldBack, oursLabel, oursWhy, onOurs, oursBusy, uploadWhy, onUpload, uploadBusy, onUntracked, untrackedWhy = null }: {
  /** Pieces the line needs that are on no plate. */
  pieces: number;
  rows: LeftOverRow[];
  /** Of those, how many a run of ours will never place (held back by hand, or unticked). */
  heldBack: number;
  oursLabel: string;
  oursWhy: string | null;
  onOurs: () => void;
  oursBusy: boolean;
  uploadWhy: string | null;
  onUpload: () => void;
  uploadBusy: boolean;
  /** §61: opens "Mark the rest as cut from offcuts". Left out = no such button (an older API). */
  onUntracked?: () => void;
  untrackedWhy?: string | null;
}) {
  const shown = rows.slice(0, SHOWN_LEFT_OVER);
  return (
    <Box data-testid="nest-left-over" role="status" sx={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, p: 1.5, minWidth: 0, borderRadius: 'var(--r-md)',
      background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', color: 'var(--c-warning-800)',
    }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
        <Box sx={{ flex: '1 1 260px', minWidth: 0, fontSize: 14, fontWeight: 600 }}>
          {`${pieces} cut ${pieces === 1 ? 'piece is' : 'pieces are'} not nested yet`}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title={uploadWhy ?? ''}>
            <span>
              <Button variant="contained" color="warning" data-testid="left-over-upload" disabled={!!uploadWhy || uploadBusy} onClick={onUpload}
                startIcon={uploadBusy ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}>
                Upload more files
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={oursWhy ?? ''}>
            <span>
              <Button variant="outlined" color="warning" data-testid="left-over-ours" disabled={!!oursWhy || oursBusy} onClick={onOurs}
                startIcon={oursBusy ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded />}>
                {oursLabel}
              </Button>
            </span>
          </Tooltip>
          {onUntracked && (
            <Tooltip title={untrackedWhy ?? 'For pieces the shop cuts from loose offcuts in the yard: no plate, no heat number, charged at the plate rate.'}>
              <span>
                <Button variant="outlined" color="warning" data-testid="left-over-untracked" disabled={!!untrackedWhy || oursBusy} onClick={onUntracked}
                  startIcon={<ContentCutRounded />}>
                  Mark the rest as cut from offcuts
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      </Box>
      {shown.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap', minWidth: 0, fontSize: 12.5 }}>
          {shown.map((r) => (
            <Box key={r.cutPlateId} sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'baseline', background: 'var(--c-surface)', border: '1px solid var(--c-warning-200)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.15, color: 'var(--c-text)' }}>
              <Mono>{r.code}</Mono><span>{`×${r.qty}`}</span>
              {r.heldBack && <Box component="span" sx={{ color: 'var(--c-text-2)' }}>held back</Box>}
            </Box>
          ))}
          {rows.length > shown.length && <Box component="span" sx={{ alignSelf: 'center' }}>{`and ${rows.length - shown.length} more`}</Box>}
        </Box>
      )}
      {heldBack > 0 && (
        <Box data-testid="left-over-held" sx={{ fontSize: 12.5 }}>
          {`${heldBack} of them ${heldBack === 1 ? 'is' : 'are'} held back from automatic nesting (by hand, or unticked), so nesting by AI will not place ${heldBack === 1 ? 'it' : 'them'}. A nesting file can.`}
        </Box>
      )}
      {uploadWhy && <Box data-testid="left-over-upload-why" sx={{ fontSize: 12.5 }}>{uploadWhy}</Box>}
    </Box>
  );
}
