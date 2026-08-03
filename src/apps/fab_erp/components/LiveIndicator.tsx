import { Box, Tooltip } from '@mui/material';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { formatAge } from '../hooks/useLiveRefresh';

/**
 * The "this screen is live" affordance for shop-floor views (§7.2).
 *
 * Three jobs, in order of importance:
 *  1. Say how old the data is. An auto-refreshing screen that hides its age is
 *     no more trustworthy than a stale one.
 *  2. Let the user stop it. Someone comparing two rows shouldn't have the
 *     ground move under them.
 *  3. Signal liveness without nagging — a small dot, not an animation that
 *     pulls the eye away from the work.
 *
 * The dot is paired with text ("Live" / "Paused"), never colour alone.
 */
export function LiveIndicator({
  paused,
  onTogglePause,
  lastUpdated,
  now,
  busy,
  onRefreshNow,
}: {
  paused: boolean;
  onTogglePause: () => void;
  lastUpdated: number | null;
  /** Pass the shared tick from useNowTick so the age advances on its own. */
  now: number;
  busy?: boolean;
  onRefreshNow?: () => void;
}) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.75,
          height: 28, px: 1.25, borderRadius: 999,
          background: paused ? 'var(--c-surface-2)' : 'var(--c-success-50)',
          border: '1px solid',
          borderColor: paused ? 'var(--c-border)' : 'var(--c-success-200)',
        }}
      >
        <Box
          sx={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: paused ? 'var(--c-text-3)' : 'var(--c-success-600)',
            // Gentle, slow, and suppressed under prefers-reduced-motion by the
            // global guard in tokens.css.
            ...(paused ? {} : {
              animation: 'fab-live-pulse 2.4s var(--ease) infinite',
              '@keyframes fab-live-pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.35 },
              },
            }),
          }}
          aria-hidden
        />
        <Box sx={{ fontSize: 12, fontWeight: 500, color: paused ? 'var(--c-text-2)' : 'var(--c-success-800)' }}>
          {paused ? 'Paused' : 'Live'}
        </Box>
        <Box
          sx={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: paused ? 'var(--c-text-3)' : 'var(--c-success-800)',
          }}
        >
          {formatAge(lastUpdated, now)}
        </Box>
      </Box>

      {onRefreshNow && (
        <Tooltip title="Refresh now">
          <Box
            component="button"
            type="button"
            onClick={onRefreshNow}
            disabled={busy}
            aria-label="Refresh now"
            sx={{
              display: 'grid', placeItems: 'center', width: 28, height: 28,
              borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)',
              background: 'var(--c-surface)', color: 'var(--c-text-2)',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
              '& svg': { fontSize: 16 },
              '&:hover': busy ? undefined : { borderColor: 'var(--c-primary-200)', color: 'var(--c-primary-700)' },
            }}
          >
            <RefreshRounded />
          </Box>
        </Tooltip>
      )}

      <Tooltip title={paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}>
        <Box
          component="button"
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
          aria-pressed={paused}
          sx={{
            display: 'grid', placeItems: 'center', width: 28, height: 28,
            borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)',
            background: 'var(--c-surface)', color: 'var(--c-text-2)', cursor: 'pointer',
            '& svg': { fontSize: 16 },
            '&:hover': { borderColor: 'var(--c-primary-200)', color: 'var(--c-primary-700)' },
          }}
        >
          {paused ? <PlayArrowRounded /> : <PauseRounded />}
        </Box>
      </Tooltip>
    </Box>
  );
}
