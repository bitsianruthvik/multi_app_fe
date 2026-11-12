import type { ReactNode } from 'react';
import { Box, Button, CircularProgress, Tooltip } from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { InfoTip, Surface } from '../ui';

/**
 * THE TWO DOORS — what the Nesting step shows while nothing is nested.
 *
 * There are exactly two ways to nest a line, so the screen offers exactly two
 * things: the shop's own nesting is uploaded, or we lay it out ourselves.
 * UPLOAD COMES FIRST and is the primary door (2026-10-13): the team nests in
 * its own program, so ours is the fallback and looks like one. Everything else
 * waits behind a door (the time to spend, the plates to use and the pieces to
 * nest are inside "Nest it ourselves") or in the More menu.
 *
 * A door that cannot be opened says why ON the door, in the words the screen
 * always used. A door that can be opened but will need something settled first
 * (plates not chosen, a steel with no plate ticked) says that too, and stays
 * open — the thing to settle is behind it.
 */

export interface DoorState {
  /** Why the door cannot be opened now. The button is disabled and this is shown. */
  blocked?: string | null;
  /** Things to settle inside. The door stays open. */
  notes?: ReactNode;
  /** Something else is working: wait, with no reason to give. */
  disabled?: boolean;
  busy?: boolean;
  onOpen: () => void;
}

function Door({ testId, icon, title, sentence, tip, button, state, primary = false, dropping = false }: {
  testId: string; icon: ReactNode; title: string; sentence: string; /** The longer word, behind an i-button (2026-11-12). */ tip?: string; button: string; state: DoorState;
  /** The door most people take: its button is the filled one. */
  primary?: boolean;
  /** Files are being dragged over the screen: the upload door lights up. */
  dropping?: boolean;
}) {
  const reasonId = `${testId}-reason`;
  return (
    <Surface e={1} data-testid={testId} data-primary={primary ? 'true' : 'false'} sx={{
      p: { xs: 2, sm: 2.5 }, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'auto auto 1fr auto', gap: 1.25, minWidth: 0,
      ...(dropping && { outline: '2px dashed var(--c-primary-600)', outlineOffset: -2, background: 'var(--c-primary-50)' }),
    }}>
      <Box aria-hidden sx={{
        width: 44, height: 44, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center',
        background: 'var(--c-primary-50)', color: 'var(--c-primary-600)', '& svg': { fontSize: 24 },
      }}>{icon}</Box>
      <Box component="h3" sx={{ m: 0, fontSize: 16, fontWeight: 600, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 0.75 }}>{title}{tip && <InfoTip text={tip} label={`About ${title}`} />}</Box>
      <Box sx={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--c-text-2)' }}>{sentence}</Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
        {state.notes}
        {state.blocked && (
          <Box id={reasonId} data-testid={`${testId}-blocked`} role="note" sx={{
            fontSize: 13, p: 1, borderRadius: 'var(--r-md)', overflowWrap: 'anywhere',
            background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', color: 'var(--c-warning-800)',
          }}>{state.blocked}</Box>
        )}
        <Tooltip title={state.blocked ?? ''}>
          <Box component="span" sx={{ justifySelf: 'start' }}>
            <Button variant={primary ? 'contained' : 'outlined'} size="large" disabled={!!state.blocked || state.disabled || state.busy} onClick={state.onOpen}
              aria-describedby={state.blocked ? reasonId : undefined}
              startIcon={state.busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {button}
            </Button>
          </Box>
        </Tooltip>
      </Box>
    </Surface>
  );
}

export function NestDoors({ ours, upload, dropping, withJobs = true }: {
  ours: DoorState; upload: DoorState; dropping: boolean;
  /** The upload reads ProNest job files as well as DXFs (the files route's `limits.kinds`). */
  withJobs?: boolean;
}) {
  return (
    <Box data-testid="nest-doors" sx={{
      display: 'grid', gap: 2, minWidth: 0,
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
    }}>
      <Door testId="door-upload" primary icon={<UploadFileRounded />} title="Upload your nesting" button="Upload nesting files" state={upload} dropping={dropping}
        sentence={withJobs ? 'ProNest job files (.nif) or one DXF per plate.' : 'One DXF per plate.'}
        tip={withJobs
          ? "Drop the ProNest job files (.nif, one per thickness) or one DXF per plate. The parts are matched to this line's cut pieces, and you see a check before anything is saved. AI does not nest by itself: open Compare with AI when you want its layout beside yours."
          : "Drop one DXF per plate. The parts are matched to this line's cut pieces, and you see a check before anything is saved."} />
      <Door testId="door-ours" icon={<AutoAwesomeRounded />} title="Nesting by AI" button="Nest by AI" state={ours}
        sentence="AI lays the cut pieces out on your catalog plates."
        tip="For a line with no nesting of its own. It takes from a few seconds to an hour, depending on how hard you ask it to try. Nothing is saved until you use the layout." />
    </Box>
  );
}
