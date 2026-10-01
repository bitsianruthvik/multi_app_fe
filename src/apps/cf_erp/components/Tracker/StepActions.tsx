import { Box, Button, IconButton, Tooltip } from '@mui/material';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import type { ProductionStep } from '../../api/types';

/** The buttons a step offers, by what it is now. */
export function StepActions({ step, onStart, onRecord, onHold, onResume }: {
  step: ProductionStep; onStart: () => void; onRecord: () => void; onHold: () => void; onResume: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {step.status === 'ready' && <Button size="small" variant="contained" startIcon={<PlayArrowRounded />} onClick={onStart}>Start</Button>}
      {step.status === 'in_progress' && <Button size="small" variant="outlined" startIcon={<EditNoteRounded />} onClick={onRecord}>Record</Button>}
      {(step.status === 'in_progress' || step.status === 'ready' || step.status === 'not_ready') && (
        <Tooltip title="Put on hold"><IconButton size="small" aria-label={`Put ${step.label} on hold`} onClick={onHold}><PauseRounded fontSize="small" /></IconButton></Tooltip>
      )}
      {step.status === 'on_hold' && <Button size="small" startIcon={<ReplayRounded />} onClick={onResume}>Resume</Button>}
    </Box>
  );
}
