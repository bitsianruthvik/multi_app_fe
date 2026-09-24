import { Box, Button, Tooltip } from '@mui/material';
import { Link } from 'react-router-dom';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import type { CfApiError } from '../../api/client';
import type { OrderProcessView } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { STATE_WORD } from '../../lib/process';
import { ErrorNotice, Mono, SkeletonBlock, Surface } from '../ui';
import { StageNumber, StageStateBadge } from './stageUi';

/**
 * Where the order stands, above its tabs: the same stages, in the same order,
 * with the same states as the process pop-up — because it is the same object,
 * loaded once by the page and handed to both. That is the whole design: two
 * views of one answer cannot disagree.
 *
 * Every chip opens the pop-up at its own stage. Nothing here is a gate.
 */
export function OrderStageStrip({ view, loading, error, onReload, onOpen }: {
  view: OrderProcessView | null;
  loading: boolean;
  error: CfApiError | null;
  onReload: () => void;
  /** Opens the pop-up, at the stage that was clicked or at the one that needs work. */
  onOpen: (stageKey?: string) => void;
}) {
  const company = useCompanySlug();

  if (error) return <ErrorNotice error={error} onRetry={onReload} sx={{ mb: 2.5 }} />;

  if (!view) {
    if (!loading) return null;
    return (
      <Surface e={1} sx={{ mb: 2.5, px: 2, py: 1.5, display: 'flex', gap: 1, alignItems: 'center' }} aria-busy="true" aria-label="Loading the process">
        {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} w={150} h={28} r={8} />)}
      </Surface>
    );
  }

  // No process: say why, quietly, and stop. Drawing invented stages over an
  // order nobody configured is the kind of wrong nobody notices for a month.
  if (!view.process) {
    return (
      <Box sx={{
        mb: 2.5, px: 1.5, py: 1.25, display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap',
        borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', fontSize: 13,
      }}>
        <InfoOutlined sx={{ fontSize: 17, mt: '1px', flexShrink: 0 }} aria-hidden />
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>{view.reason ?? 'This order follows no process.'}</Box>
        <Box component={Link} to={appPath(company, 'processes')} sx={{ fontSize: 13, color: 'var(--c-primary-700)', flexShrink: 0 }}>Set up processes</Box>
      </Box>
    );
  }

  const stages = view.stages;
  return (
    <Surface e={1} sx={{ mb: 2.5, p: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: { xs: 'wrap', lg: 'nowrap' }, minWidth: 0 }}>
      <Box
        component="ol"
        aria-label={`Stages of ${view.process.name}`}
        sx={{
          listStyle: 'none', m: 0, p: 0, flex: '1 1 260px', minWidth: 0,
          display: 'flex', alignItems: 'stretch', gap: 0.75, overflowX: 'auto', scrollbarWidth: 'thin',
        }}
      >
        {stages.map((s, i) => (
          <Box component="li" key={s.stageKey} sx={{ flexShrink: 0 }}>
            <Tooltip title={`${s.detail} — ${STATE_WORD[s.state]}. Click to work on it.`} placement="bottom-start">
              <Box
                component="button"
                type="button"
                onClick={() => onOpen(s.stageKey)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.75, cursor: 'pointer', font: 'inherit',
                  borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', whiteSpace: 'nowrap',
                  transition: 'background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease)',
                  '&:hover': { background: 'var(--c-surface-2)', borderColor: 'var(--c-primary-200)' },
                }}
              >
                <StageNumber n={i + 1} on={s.stageKey === view.nextStage} />
                <Box sx={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>{s.label}</Box>
                <StageStateBadge stage={s} />
              </Box>
            </Tooltip>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, pl: { lg: 0.5 } }}>
        <Mono muted sx={{ display: { xs: 'none', md: 'block' } }}>{view.process.code}</Mono>
        <Button variant="contained" startIcon={<ChecklistRounded />} onClick={() => onOpen()}>Work the process</Button>
      </Box>
    </Surface>
  );
}
