import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { LinkChoiceValue } from '../../api/links';
import { chooseAll, type LinkAbove, type LinkTouch } from '../../lib/links';
import { DialogCloseButton } from '../FormDialog';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Asked ONCE, at Save and at Check, when the waiting changes reach rows that have copies:
 *   Apply to all copies — every copy gets the same change and they stay the same design;
 *   Only these rows     — these rows stop being copies of the others;
 *   Choose per row      — a table, one answer for each change.
 * It also lists the rows above that will stop matching their copies. Nothing is asked when
 * nothing linked is touched, or when every copy was given the same value.
 */
export function LinkChoiceDialog({ open, touches, above, intent, onChoose, onClose }: {
  open: boolean;
  touches: LinkTouch[];
  above: LinkAbove[];
  /** What the answer leads to, for the last button. */
  intent: 'save' | 'check';
  onChoose: (choice: Record<string, LinkChoiceValue>) => void;
  onClose: () => void;
}) {
  const [each, setEach] = useState(false);
  const [picks, setPicks] = useState<Record<string, LinkChoiceValue>>({});
  useEffect(() => { if (open) { setEach(false); setPicks(chooseAll(touches, 'all')); } }, [open, touches]);
  const rows = new Set(touches.map((t) => t.recordId)).size;
  return (
    <Dialog open={open} onClose={onClose} maxWidth={each ? 'md' : 'sm'} fullWidth data-testid="link-choice">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>Some of these rows have copies</Box>
        <DialogCloseButton onClose={onClose} />
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1.5, alignContent: 'start' }}>
        <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
          You changed {plural(rows, 'row', 'rows')} that {rows === 1 ? 'is' : 'are'} the same design as other rows. Should the copies change too?
        </Typography>
        {!each ? (
          <Box component="ul" data-testid="link-choice-list" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.25, fontSize: 13, color: 'var(--c-text)' }}>
            {touches.slice(0, 6).map((t) => <li key={t.key}>{t.label} — {t.what} <Box component="span" sx={{ color: 'var(--c-text-3)' }}>({plural(t.copies, 'copy', 'copies')})</Box></li>)}
            {touches.length > 6 && <li>and {touches.length - 6} more</li>}
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" data-testid="link-choice-table" sx={{
              borderCollapse: 'collapse', fontSize: 12.5, width: '100%',
              '& th, & td': { textAlign: 'left', py: 0.75, pr: 1.5, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'middle' },
              '& th': { color: 'var(--c-text-3)', fontWeight: 600, whiteSpace: 'nowrap' },
            }}>
              <thead><tr><th>Row</th><th>What changed</th><th>Copies</th><th>Change the copies?</th></tr></thead>
              <tbody>
                {touches.map((t) => (
                  <tr key={t.key} data-testid="link-choice-row" data-key={t.key}>
                    <td style={{ overflowWrap: 'anywhere' }}>{t.label}</td>
                    <td style={{ overflowWrap: 'anywhere' }}>{t.what}</td>
                    <td>{t.copies}</td>
                    <td>
                      <ToggleButtonGroup exclusive size="small" value={picks[t.key] ?? 'all'} aria-label={`Copies of ${t.label}`}
                        onChange={(_, v: LinkChoiceValue | null) => { if (v) setPicks((p) => ({ ...p, [t.key]: v })); }}>
                        <ToggleButton value="all" data-testid="link-pick" data-key={t.key} data-value="all" sx={{ textTransform: 'none', py: 0.25 }}>All</ToggleButton>
                        <ToggleButton value="one" data-testid="link-pick" data-key={t.key} data-value="one" sx={{ textTransform: 'none', py: 0.25 }}>This one</ToggleButton>
                      </ToggleButtonGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        )}
        {!each && (
          <Box sx={{ display: 'grid', gap: 0.5, fontSize: 12.5, color: 'var(--c-text-2)' }}>
            <span><b>Apply to all copies</b> — every copy gets the same change and they stay the same design.</span>
            <span><b>Only these rows</b> — these rows stop being copies of the others.</span>
          </Box>
        )}
        {above.length > 0 && (
          <Box data-testid="link-choice-above" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', background: 'var(--c-warning-50, var(--c-surface-2))', borderRadius: 'var(--r-sm)', px: 1.25, py: 0.75 }}>
            Rows above will stop matching their copies if the copies stay as they are: {above.map((a) => `${a.label} (${plural(a.copies, 'copy', 'copies')})`).join(', ')}.
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {!each ? (
          <>
            <Button data-testid="link-choice-each" onClick={() => setEach(true)}>Choose per row</Button>
            <Button data-testid="link-choice-one" onClick={() => onChoose(chooseAll(touches, 'one'))}>Only these rows</Button>
            <Button variant="contained" data-testid="link-choice-all" onClick={() => onChoose(chooseAll(touches, 'all'))}>Apply to all copies</Button>
          </>
        ) : (
          <>
            <Button onClick={() => setEach(false)}>Back</Button>
            <Button variant="contained" data-testid="link-choice-go" onClick={() => onChoose(picks)}>{intent === 'check' ? 'Check' : 'Save'}</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
