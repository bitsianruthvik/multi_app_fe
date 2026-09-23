import type { MouseEvent } from 'react';
import { Box, Tooltip } from '@mui/material';
import { Link } from 'react-router-dom';
import RouteRounded from '@mui/icons-material/RouteRounded';
import type { EffectiveFlow } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { flowFromText } from '../lib/production';

/** The flow a piece is made by, linked to it. "set on this line" shows in the colour of a choice made here. */
export function FlowTag({ flow }: { flow: EffectiveFlow | null | undefined }) {
  const company = useCompanySlug();
  if (!flow) return null;
  const here = flow.from === 'line';
  return (
    <Tooltip title={`Made by ${flow.name} — ${flowFromText(flow)}`}>
      <Box component={Link} to={appPath(company, `flows/${flow.id}`)} onClick={(e: MouseEvent) => e.stopPropagation()} sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.125, borderRadius: 'var(--r-sm)', textDecoration: 'none',
        fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'nowrap',
        border: `1px solid ${here ? 'var(--c-primary-200)' : 'var(--c-border)'}`,
        background: here ? 'var(--c-primary-50)' : 'var(--c-surface-2)', color: here ? 'var(--c-primary-700)' : 'var(--c-text-2)',
        '& svg': { fontSize: 13 }, '&:hover': { borderColor: 'var(--c-primary-400)' },
      }}>
        <RouteRounded />{flow.code}
      </Box>
    </Tooltip>
  );
}
