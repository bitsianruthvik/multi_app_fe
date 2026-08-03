import { Box, Button, CircularProgress, Chip, Tooltip, Typography } from '@mui/material';
import LayersRounded from '@mui/icons-material/LayersRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { Surface } from './Surface';
import { formatMinutes } from '../utils/formatMinutes';
import { BATCH_MODE_HELP, BATCH_MODE_LABELS, type BatchEstimate, type BatchPolicy } from '../api/batches';

/**
 * Bottom-sticky bar shown while an operator is picking tasks to run together
 * (Issue 4).
 *
 * It leads with the saving, not the mechanics. "Start 4 together — 48 min
 * instead of 1h 52m" is a decision someone can make standing at a machine;
 * "batch_mode: shared_setup, capacity 6" is a database row. The mode and
 * capacity are still there, one line down, for when the number looks wrong and
 * someone needs to know why.
 */
export function BatchBar({
  count,
  policy,
  estimate,
  loading,
  starting,
  onStart,
  onClear,
}: {
  count: number;
  policy: BatchPolicy | null;
  estimate: BatchEstimate | null;
  loading: boolean;
  starting: boolean;
  onStart: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  const mode = policy?.batchMode ?? 'none';
  const saves = estimate && estimate.savedMinutes > 0;

  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 16,
        zIndex: 'var(--z-sticky)',
        mt: 2,
      }}
    >
      <Surface
        e={3}
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          borderColor: 'var(--c-primary-200)',
        }}
      >
        <Box
          sx={{
            width: 36, height: 36, borderRadius: 'var(--r-sm)', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'var(--c-primary-50)', color: 'var(--c-primary-600)',
          }}
        >
          <LayersRounded fontSize="small" />
        </Box>

        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
              {count} selected
            </Typography>
            {policy && (
              <Tooltip title={BATCH_MODE_HELP[mode]}>
                <Chip
                  size="small"
                  label={BATCH_MODE_LABELS[mode]}
                  sx={{
                    height: 20, fontSize: 11.5,
                    background: 'var(--c-primary-50)', color: 'var(--c-primary-800)',
                    border: '1px solid var(--c-primary-200)',
                  }}
                />
              </Tooltip>
            )}
            {loading && <CircularProgress size={13} />}
          </Box>

          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
            {estimate ? (
              <>
                Est. <Box component="span" sx={{ fontWeight: 600, color: 'var(--c-text)' }}>{formatMinutes(estimate.totalMinutes)}</Box>
                {' '}together vs {formatMinutes(estimate.soloMinutes)} one at a time
                {saves && (
                  <Box component="span" sx={{ color: 'var(--c-success-600)', fontWeight: 600 }}>
                    {' '}· saves {formatMinutes(estimate.savedMinutes)}
                  </Box>
                )}
                {estimate.setupMinutes > 0 && ` · ${formatMinutes(estimate.setupMinutes)} setup, paid once`}
                {estimate.cycles > 1 && ` · ${estimate.cycles} cycles`}
              </>
            ) : (
              'Select at least two tasks to run them together.'
            )}
          </Typography>

          {policy && policy.capacity != null && (
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>
              {policy.resourceName} holds {policy.capacity} at a time
              {policy.capacitySource === 'machine' && ' (from the machine’s unit count)'}
              {policy.matchKeys.length > 0 && ` · must match ${policy.matchKeys.join(', ')}`}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button size="small" variant="text" startIcon={<CloseRounded />} onClick={onClear} disabled={starting}>
            Clear
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onStart}
            disabled={count < 2 || starting || loading}
          >
            {starting ? <CircularProgress size={18} /> : `Start ${count} together`}
          </Button>
        </Box>
      </Surface>
    </Box>
  );
}
