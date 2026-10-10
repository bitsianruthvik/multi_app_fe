import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { getValueReasons } from '../api/valueReasons';
import { useLoad } from '../hooks/useLoad';
import { flowLine, reasonGroups, reasonSummary } from '../lib/valueReasons';
import { DialogCloseButton } from './FormDialog';
import { ErrorNotice, Mono, SkeletonRows } from './ui';

/**
 * "Why these values" — every value a record asks for, with the reason in plain words
 * (lib/valueReasons): its flow reads it, somebody set it by hand, or it is worked out; then what it
 * still holds that nothing asks for. A hand-made value nothing in its flow reads is in the warning
 * colour: the list is meant to stay the smallest that can be filled (user, 2026-10-10).
 *
 * Opened from a record's Specifications tab and from a row's menu on an order's Structure tab.
 * Read-only: a rule is removed where it was made (the level the sentence names).
 */
export function ValueReasonsDialog({ open, recordId, label, onClose }: {
  open: boolean;
  recordId: number | null;
  /** What the record is called on the screen that opened this. */
  label: string;
  onClose: () => void;
}) {
  const id = open ? recordId : null;
  const load = useLoad(() => (id == null ? Promise.resolve(null) : getValueReasons(id)), [id]);
  // The last record's answer must not show under the next record's name while it loads.
  const data = load.data && id != null && load.data.record.id === id ? load.data : null;
  const groups = data ? reasonGroups(data) : [];
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" data-testid="value-reasons">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ minWidth: 0 }}>Why {label || 'this record'} asks for these values</Box>
        <DialogCloseButton onClose={onClose} />
      </DialogTitle>
      <DialogContent>
        <ErrorNotice error={load.error} onRetry={load.reload} />
        {!data && !load.error && <SkeletonRows rows={5} height={28} />}
        {data && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box>
              <Typography data-testid="value-reasons-summary" sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>{reasonSummary(data)}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{flowLine(data)}</Typography>
            </Box>
            {groups.map((g) => (
              <Box key={g.key} data-testid={`value-reasons-${g.key}`}>
                <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', m: 0 }}>{g.title} · {g.rows.length}</Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.5 }}>{g.hint}</Typography>
                <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
                  {g.rows.map((r, i) => (
                    <Box key={r.code} data-warn={r.warn ? 'true' : undefined}
                      sx={{
                        display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(160px, 260px) 1fr' }, columnGap: 2, rowGap: 0.25, alignItems: 'baseline', px: 1.25, py: 0.75,
                        borderTop: i ? '1px solid var(--c-border)' : 0, background: r.warn ? 'var(--c-warning-50)' : undefined,
                      }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text)' }}>{r.name}</Typography>{' '}
                        <Mono muted>{r.code}</Mono>
                        {r.required && g.key !== 'notAsked' && <Typography component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)', ml: 0.75 }}>required</Typography>}
                      </Box>
                      <Typography sx={{ fontSize: 13, color: r.warn ? 'var(--c-warning-800)' : 'var(--c-text-2)', display: 'flex', gap: 0.5, alignItems: 'flex-start', overflowWrap: 'anywhere' }}>
                        {r.warn && <WarningAmberRounded aria-hidden sx={{ fontSize: 16, mt: '1px', flex: 'none' }} />}
                        <span>{r.text}</span>
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
            {groups.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>It asks for no values and holds none.</Typography>}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
