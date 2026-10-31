import { Box, IconButton, Tooltip } from '@mui/material';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import { rowDrawingTitle, type RowDrawingState } from '../../lib/drawings';

/**
 * The small drawing cell at the end of a made row: an outlined upload icon while the row has none, a filled
 * file icon with its revision once it has one, an attach icon while its register drawing waits for a file.
 * Click opens the drawings dialog scoped to this row — or, when the row has a file and `onView` is given, the viewer. `why` (cannot upload now) is the tooltip and disables it.
 */
export function RowDrawingCell({ name, state, why, onClick, onView }: {
  name: string; state: RowDrawingState; why?: string | null; onClick: () => void;
  /** Opens the viewer. When the row has a file, a click does this INSTEAD of `onClick` — and looking needs no permission, so `why` does not block it. */
  onView?: () => void;
}) {
  // A register sheet (a standard's kept file, an RDSO sheet's link) shows like a file, but a click opens the Drawings
  // tool for the row — the parts' files are there, and the sheet is offered from it. Looking needs no permission, so
  // `why` does not block it.
  const has = state.kind === 'file' || state.kind === 'sheet';
  const viewing = state.kind === 'file' && !!onView;
  const seeing = viewing || state.kind === 'sheet';
  const title = seeing ? `${rowDrawingTitle(name, state, null)}${why ? ` (${why})` : ''}` : rowDrawingTitle(name, state, why);
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" aria-label={title} data-testid="row-drawing" data-state={state.kind} disabled={!!why && !seeing} onClick={viewing ? onView : onClick}
          sx={{ color: has ? 'var(--c-primary-700)' : 'var(--c-text-3)', gap: 0.125, borderRadius: 'var(--r-md)', minWidth: 26, height: 26, p: '3px', '& svg': { fontSize: 17 } }}>
          {has ? <DescriptionRounded fontSize="small" /> : state.kind === 'waiting' ? <AttachFileRounded fontSize="small" /> : <FileUploadOutlined fontSize="small" />}
          {has && state.revision && <Box component="span" sx={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}>{state.revision}</Box>}
        </IconButton>
      </span>
    </Tooltip>
  );
}
