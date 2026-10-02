import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Tooltip } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ContentCutRounded from '@mui/icons-material/ContentCutRounded';
import { cutPiecesLabel } from '../../lib/cutPieces';
import { useCutPiecesOpen } from '../../hooks/useCutPiecesOpen';
import { BlanksPanel } from './BlanksPanel';

/**
 * THE CUT PIECES, AS A DIALOG OVER NESTING (user, 2026-10-02: "right after
 * structure is locked, we should auto generate cut pieces — no need to show
 * that separately. We can show it as a pop up in nesting if required on
 * clicking a button").
 *
 * Cut pieces used to be a stage of their own between Values and Freeze design.
 * They were always made by the server (cutPlateService.refreshCutPieces after
 * every save, and by the freeze itself), so the stage only ever showed a
 * person a list. The list is the same component (BlanksPanel) — plate column
 * "chosen at nesting" / nest lot / hand-chosen plate, the fallback "Make them
 * now" — opened from a button on the Nesting stage. Choosing which pieces and
 * which plates go into a nest stays in Nesting's own "What to nest" steps.
 *
 * Open or shut lives in the address (`cutPieces=1`, hooks/useCutPiecesOpen),
 * so the redirect from an old `?tab=cut-pieces` link, Back and a reload all
 * show the same thing.
 */
export function CutPiecesButton({ lineId, lineNo, count, canManage, onChanged, onGoValues, variant = 'outlined' }: {
  lineId: number;
  lineNo?: number | null;
  /** How many cut pieces the line has, when the caller knows (Nesting does). */
  count?: number | null;
  canManage: boolean;
  onChanged?: () => void;
  /** Where "Go to Values" goes — the dialog shuts first. */
  onGoValues?: () => void;
  variant?: 'outlined' | 'text' | 'contained';
}) {
  const [open, setOpen] = useCutPiecesOpen();
  return (
    <>
      <Tooltip title="The rectangles this line's plate parts are cut as — made automatically from the parts and their values.">
        <Button variant={variant} startIcon={<ContentCutRounded />} onClick={() => setOpen(true)} data-testid="cut-pieces-button">
          {cutPiecesLabel(count)}
        </Button>
      </Tooltip>
      <CutPiecesDialog open={open} onClose={() => setOpen(false)} lineId={lineId} lineNo={lineNo} canManage={canManage} onChanged={onChanged}
        onGoValues={onGoValues ? () => { setOpen(false); onGoValues(); } : undefined} />
    </>
  );
}

export function CutPiecesDialog({ open, onClose, lineId, lineNo, canManage, onChanged, onGoValues }: {
  open: boolean;
  onClose: () => void;
  lineId: number;
  lineNo?: number | null;
  canManage: boolean;
  onChanged?: () => void;
  onGoValues?: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="cut-pieces-title">
      <DialogTitle id="cut-pieces-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{lineNo != null ? `Cut pieces — line ${lineNo}` : 'Cut pieces'}</Box>
        <IconButton aria-label="Close" onClick={onClose} size="small"><CloseRounded fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {open && <BlanksPanel lineId={lineId} canManage={canManage} onChanged={onChanged} onGoValues={onGoValues} embedded />}
      </DialogContent>
    </Dialog>
  );
}
