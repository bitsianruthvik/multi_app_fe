import { Box, IconButton, Tooltip } from '@mui/material';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import { rowDrawingTitle, type RowDrawingState } from '../../lib/drawings';

/**
 * The small drawing cell at the end of a made row: an outlined upload icon while the row has none, a filled
 * file icon with its revision once it has one, an attach icon while its register drawing waits for a file.
 * Click opens the drawings dialog scoped to this row. `why` (cannot upload now) is the tooltip and disables it.
 */
export function RowDrawingCell({ name, state, why, onClick }: {
  name: string; state: RowDrawingState; why?: string | null; onClick: () => void;
}) {
  const title = rowDrawingTitle(name, state, why);
  const has = state.kind === 'file';
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" aria-label={title} data-testid="row-drawing" data-state={state.kind} disabled={!!why} onClick={onClick}
          sx={{ color: has ? 'var(--c-primary-700)' : 'var(--c-text-3)', gap: 0.25, borderRadius: 'var(--r-md)' }}>
          {has ? <DescriptionRounded fontSize="small" /> : state.kind === 'waiting' ? <AttachFileRounded fontSize="small" /> : <FileUploadOutlined fontSize="small" />}
          {has && state.revision && <Box component="span" sx={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1 }}>{state.revision}</Box>}
        </IconButton>
      </span>
    </Tooltip>
  );
}
