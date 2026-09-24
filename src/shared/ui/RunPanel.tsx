import type { ReactNode } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { Surface } from './Surface';

export type RunState = 'idle' | 'running' | 'results';

/**
 * Run / process panel (DESIGN_SYSTEM.md §4.6/§7.5) — the shape for "trigger a
 * computation, review what it produced, commit".
 *
 * Three visible states, and a plain-language `summary` of what the run will do
 * *before* it runs. Someone about to change a hundred records by pressing one
 * button deserves a sentence telling them so.
 */
export function RunPanel({
  title,
  summary,
  params,
  runLabel = 'Run',
  runningLabel = 'Running…',
  busyMessage = 'Computing…',
  state,
  onRun,
  disabled,
  commit,
  children,
}: {
  title: ReactNode;
  summary?: ReactNode;
  params?: ReactNode;
  runLabel?: string;
  runningLabel?: string;
  busyMessage?: string;
  state: RunState;
  onRun: () => void;
  disabled?: boolean;
  /** Commit action shown above the results (e.g. "Convert selected"). */
  commit?: ReactNode;
  /** Results body (table/tree). Rendered when state === 'results'. */
  children?: ReactNode;
}) {
  return (
    <Box>
      <Surface e={2} sx={{ p: 2.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography
              sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)', mb: summary ? 0.5 : 0 }}
            >
              {title}
            </Typography>
            {summary && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                {summary}
              </Typography>
            )}
          </Box>
          <Button
            variant="contained"
            onClick={onRun}
            disabled={disabled || state === 'running'}
            startIcon={
              state === 'running' ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <PlayArrowRounded />
              )
            }
          >
            {state === 'running' ? runningLabel : runLabel}
          </Button>
        </Box>
        {params && <Box sx={{ mt: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>{params}</Box>}
      </Surface>

      {state === 'running' && (
        <Surface
          e={1}
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
          }}
          aria-live="polite"
        >
          <CircularProgress size={28} />
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{busyMessage}</Typography>
        </Surface>
      )}

      {state === 'results' && (
        <Box>
          {commit && <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>{commit}</Box>}
          {children}
        </Box>
      )}
    </Box>
  );
}
