import React from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { Surface } from './Surface';

export type RunState = 'idle' | 'running' | 'results';

/**
 * Run / process panel (DESIGN_SYSTEM.md §4.6/§7.5): solid e2 params block + a
 * primary Run button, with three visible states (idle / running / results) and
 * a plain-language summary of what the run will do.
 */
export function RunPanel({
  title,
  summary,
  params,
  runLabel = 'Run',
  state,
  onRun,
  disabled,
  commit,
  children,
}: {
  title: React.ReactNode;
  summary?: React.ReactNode;
  params?: React.ReactNode;
  runLabel?: string;
  state: RunState;
  onRun: () => void;
  disabled?: boolean;
  /** Commit action node shown in the results header (e.g. "Firm selected"). */
  commit?: React.ReactNode;
  /** Results body (table/tree). Rendered when state === 'results'. */
  children?: React.ReactNode;
}) {
  return (
    <Box>
      <Surface e={2} sx={{ p: 2.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)', mb: summary ? 0.5 : 0 }}>
              {title}
            </Typography>
            {summary && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.5 }}>{summary}</Typography>}
          </Box>
          <Button
            variant="contained"
            onClick={onRun}
            disabled={disabled || state === 'running'}
            startIcon={
              state === 'running' ? <CircularProgress size={16} color="inherit" /> : <PlayArrowRounded />
            }
          >
            {state === 'running' ? 'Running…' : runLabel}
          </Button>
        </Box>
        {params && <Box sx={{ mt: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>{params}</Box>}
      </Surface>

      {state === 'running' && (
        <Surface e={1} sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={28} />
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Computing…</Typography>
        </Surface>
      )}

      {state === 'results' && (
        <Box>
          {commit && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>{commit}</Box>
          )}
          {children}
        </Box>
      )}
    </Box>
  );
}
