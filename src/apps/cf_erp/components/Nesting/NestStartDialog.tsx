import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import type { CfApiError } from '../../api/client';
import type { FreeRange, PlateChoice } from '../../api/types';
import {
  EFFORTS, EFFORT_LINE, EFFORT_LONG_LINE, PLATES_NOT_CHOSEN, START_HEAD, STEEL_BLOCKED, startSentence, type Effort, type StartMode,
} from '../../lib/nesting';
import { ErrorNotice } from '../ui';

/**
 * DOOR 1 — "Nest it ourselves": the one place a run is started from.
 *
 * One question that always needs an answer (how long may it try), then the two
 * settings a run reads: which plates to use, and which pieces and plates it may
 * touch. Start writes nothing — it starts the server's run, and the result comes
 * back as a proposal to use or discard.
 *
 * The same dialog starts all three kinds of run; only its heading and its first
 * sentence differ: the whole line, what the customer's files left over, or the
 * whole line over again.
 */

/**
 * "PLATES TO USE" — chosen once per line before its first run. Three ways (user, 2026-11-01):
 *   standard  the mill's standard sizes only
 *   any       standard sizes and custom sizes, the custom ones within the mill's limits and lots (Setup › Cutting)
 *   free      any size: each plate is ordered at the size its layout needs, inside a length × width range
 * The run waits for a choice; it can change any time and affects the NEXT run, not the saved layout.
 */
export function PlatesToUse({ choice, kinds, range, editable, busy, onPick }: {
  choice: PlateChoice | null;
  kinds: { standard: number; custom: number; unknown: number } | undefined;
  range?: FreeRange | null;
  editable: boolean;
  busy: boolean;
  onPick: (next: PlateChoice, range?: FreeRange | null) => void;
}) {
  const counts = kinds
    ? `${kinds.standard} standard · ${kinds.custom + kinds.unknown} custom sizes in the catalog${kinds.unknown > 0 ? ` (${kinds.unknown} not marked)` : ''}`
    : null;
  const [draft, setDraft] = useState<Record<keyof FreeRange, string>>(() => rangeText(range));
  const rangeKey = JSON.stringify(range ?? null);
  useEffect(() => { setDraft(rangeText(JSON.parse(rangeKey) as FreeRange | null)); }, [rangeKey]);
  const typed = rangeOf(draft);
  const changed = JSON.stringify(typed) !== JSON.stringify(rangeOf(rangeText(range)));
  const field = (k: keyof FreeRange, label: string) => (
    <TextField size="small" type="number" label={label} value={draft[k]} disabled={!editable || busy}
      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
      slotProps={{ htmlInput: { min: 0, step: 50, 'aria-label': `${label} (mm)` } }}
      sx={{ width: 130 }} />
  );
  return (
    <Box data-testid="plates-to-use" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box component="h3" sx={{ m: 0, fontSize: 14, fontWeight: 600 }}>Plates to use</Box>
        <ToggleButtonGroup exclusive size="small" aria-label="Plates to use" value={choice}
          disabled={!editable || busy} onChange={(_, v) => { if (v) onPick(v as PlateChoice); }}>
          <ToggleButton value="standard">Standard sizes</ToggleButton>
          <ToggleButton value="any">Standard + custom sizes</ToggleButton>
          {/* Standard, or standard + custom under the mill's rules (user, 2026-11-02). A line already on free size keeps its choice shown. */}
          {choice === 'free' && <ToggleButton value="free">Free size in a range</ToggleButton>}
        </ToggleButtonGroup>
        {busy && <CircularProgress size={13} aria-label="Saving" />}
      </Box>
      {choice !== 'free' && counts && <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{counts}</Box>}
      {choice === 'free' && (
        <Box data-testid="free-range" sx={{ display: 'grid', gap: 1 }}>
          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            Each plate is ordered at the size its layout needs (with the ordering margins, rounded up to the order step), never outside this range, in mm.
            Leave a box empty to use the custom-plate limits in Setup › Cutting. New sizes are added to the catalog when the nesting is used.
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ fontSize: 13, minWidth: 52 }}>Length</Box>{field('minLength', 'Shortest')}<Box sx={{ fontSize: 13 }}>to</Box>{field('maxLength', 'Longest')}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ fontSize: 13, minWidth: 52 }}>Width</Box>{field('minWidth', 'Narrowest')}<Box sx={{ fontSize: 13 }}>to</Box>{field('maxWidth', 'Widest')}
          </Box>
          {editable && changed && (
            <Box><Button size="small" variant="contained" disabled={busy} onClick={() => onPick('free', typed)}>Save the range</Button></Box>
          )}
        </Box>
      )}
      {choice === null && (
        <Alert severity="warning" sx={{ py: 0 }}><Box data-testid="plates-not-chosen">{PLATES_NOT_CHOSEN}</Box></Alert>
      )}
    </Box>
  );
}

const RANGE_KEYS: (keyof FreeRange)[] = ['minLength', 'maxLength', 'minWidth', 'maxWidth'];
function rangeText(r?: FreeRange | null): Record<keyof FreeRange, string> {
  return Object.fromEntries(RANGE_KEYS.map((k) => [k, r?.[k] != null ? String(r[k]) : ''])) as Record<keyof FreeRange, string>;
}
function rangeOf(t: Record<keyof FreeRange, string>): FreeRange | null {
  const out: FreeRange = {};
  for (const k of RANGE_KEYS) { const n = Number(t[k]); if (t[k].trim() !== '' && Number.isFinite(n) && n > 0) out[k] = n; }
  return Object.keys(out).length ? out : null;
}

export function NestStartDialog({
  open, mode, imported, effort, onEffort, busy, onClose, onStart, plates, blocked, platesUnset, choices, error,
}: {
  open: boolean;
  mode: StartMode;
  /** The line holds imported plates: a run then nests only what they leave over. */
  imported: boolean;
  effort: Effort;
  onEffort: (next: Effort) => void;
  /** The start request is on its way. */
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
  /** The "Plates to use" control, when the API has that setting. */
  plates?: ReactNode;
  /** A steel with every plate unticked cannot be nested: Start waits, and says why. */
  blocked: string[];
  platesUnset: boolean;
  /** "What to nest": the pieces and the plates a run may touch. */
  choices?: ReactNode;
  /** The server refused to start. Shown here, where the user is looking. */
  error: CfApiError | null;
}) {
  const why = platesUnset ? PLATES_NOT_CHOSEN : blocked.length > 0 ? STEEL_BLOCKED : null;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="nest-start-title">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box component="span" id="nest-start-title" sx={{ flex: 1, minWidth: 0 }}>{START_HEAD[mode]}</Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={busy} size="small"><CloseRounded fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box data-testid="nest-start" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2.5, minWidth: 0 }}>
          <Typography data-testid="nest-start-sentence" sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{startSentence(mode, imported)}</Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
            <Box component="h3" id="nest-effort-label" sx={{ m: 0, fontSize: 14, fontWeight: 600 }}>How hard should it try?</Box>
            <ToggleButtonGroup exclusive aria-labelledby="nest-effort-label" data-testid="effort-choice" value={effort} disabled={busy}
              onChange={(_, v) => { if (v) onEffort(v as Effort); }}
              sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' } }}>
              {EFFORTS.map((e) => (
                <ToggleButton key={e.value} value={e.value} data-effort={e.value} sx={{ display: 'grid', gap: 0.1, textTransform: 'none', py: 1 }}>
                  <Box component="span" sx={{ fontSize: 14, fontWeight: 600 }}>{e.name}</Box>
                  <Box component="span" sx={{ fontSize: 12.5 }}>{`up to ${e.label}`}</Box>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Box data-testid="effort-line" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{EFFORT_LINE}</Box>
            <Box data-testid="effort-long-line" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{EFFORT_LONG_LINE}</Box>
          </Box>

          {plates}

          {blocked.length > 0 && (
            <Alert severity="warning" data-testid="nest-blocked">
              <Box sx={{ fontWeight: 600, mb: 0.5 }}>{STEEL_BLOCKED}</Box>
              <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
                {blocked.map((b) => <li key={b}>{b}</li>)}
              </Box>
            </Alert>
          )}

          {choices}

          {error?.code === 'PLATES_NOT_CHOSEN'
            ? <Alert severity="warning" data-testid="plates-not-chosen-error">{error.message}</Alert>
            : <ErrorNotice error={error} sx={{ mb: 0 }} />}
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {why && <Box id="nest-start-why" data-testid="nest-start-why" sx={{ flex: '1 1 220px', minWidth: 0, fontSize: 13, color: 'var(--c-warning-800)', pl: 1 }}>{why}</Box>}
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={onStart} disabled={busy || blocked.length > 0 || platesUnset}
          aria-describedby={why ? 'nest-start-why' : undefined}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRounded />}>
          Start nesting
        </Button>
      </DialogActions>
    </Dialog>
  );
}
