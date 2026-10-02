import { Fragment } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RadioButtonCheckedRounded from '@mui/icons-material/RadioButtonCheckedRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import TrendingFlatRounded from '@mui/icons-material/TrendingFlatRounded';
import { getProcurementTrace, type BuyingDocType, type ProcurementTrace } from '../../api/buying';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { stageBarModel, stageBarSummary, type StageBarState } from '../../lib/buying';
import { ErrorNotice, SkeletonBlock } from '../ui';

/**
 * The buying stages across the top of a purchase request, an RFQ or a purchase
 * order (user, 2026-10-02: "a stage bar on each document"). The same sequence as
 * the Buying board; this document's stage is highlighted, and under each stage
 * are the documents that stand there — the request it came from, the RFQ it went
 * to, the purchase orders and the receipts — each a link, so the chain can be
 * walked back and forward from any page of it.
 */

const STEP_SX: Record<StageBarState, object> = {
  current: { background: 'var(--c-primary-50)', borderColor: 'var(--c-primary-200)', color: 'var(--c-primary-700)', fontWeight: 600 },
  done: { background: 'transparent', borderColor: 'transparent', color: 'var(--c-text-2)', fontWeight: 500 },
  ahead: { background: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text-2)', fontWeight: 500 },
  todo: { background: 'transparent', borderColor: 'transparent', color: 'var(--c-text-3)', fontWeight: 500 },
};
const STATE_TITLE: Record<StageBarState, string> = {
  current: 'This document is here',
  done: 'Passed',
  ahead: 'Reached by a document this one led to',
  todo: 'Not reached yet',
};

function Mark({ state }: { state: StageBarState }) {
  const sx = { fontSize: 15, flexShrink: 0 };
  if (state === 'done') return <CheckCircleRounded aria-hidden sx={{ ...sx, color: 'var(--c-success-600)' }} />;
  if (state === 'current') return <RadioButtonCheckedRounded aria-hidden sx={{ ...sx, color: 'var(--c-primary-600)' }} />;
  if (state === 'ahead') return <TrendingFlatRounded aria-hidden sx={{ ...sx, color: 'var(--c-info-600)' }} />;
  return <RadioButtonUncheckedRounded aria-hidden sx={{ ...sx, color: 'var(--c-text-3)' }} />;
}

export function BuyingStageBarView({ trace }: { trace: ProcurementTrace }) {
  const company = useCompanySlug();
  const steps = stageBarModel(trace);
  return (
    <Box data-testid="buying-stage-bar" sx={{ mb: 1.5, minWidth: 0 }}>
      <Box role="list" aria-label="Buying stages"
        sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.25, overflowX: 'auto', pb: 0.5, scrollbarWidth: 'thin', boxShadow: 'inset 0 -1px 0 var(--c-border)' }}>
        {steps.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <ChevronRightRounded aria-hidden sx={{ fontSize: 15, color: 'var(--c-text-3)', flexShrink: 0, mt: '6px' }} />}
            <Box role="listitem" data-stage={s.key} data-state={s.state} aria-current={s.state === 'current' ? 'step' : undefined}
              sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0, minWidth: 0 }}>
              <Tooltip title={`${STATE_TITLE[s.state]}. ${s.hint}`} placement="bottom-start" enterDelay={350}>
                <Box sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, py: '3px', fontSize: 13, whiteSpace: 'nowrap',
                  border: '1px solid', borderRadius: 'var(--r-sm)', ...STEP_SX[s.state],
                }}>
                  <Mark state={s.state} />{s.label}
                </Box>
              </Tooltip>
              {s.links.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px', pl: 0.75 }}>
                  {s.links.slice(0, 4).map((l) => (
                    <Tooltip key={l.key} title={l.title} placement="bottom-start">
                      {l.current
                        ? <Box component="span" data-link={l.key} sx={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--c-primary-700)', fontWeight: 600 }}>{l.label}</Box>
                        : (
                          <Box component={Link} to={appPath(company, l.link)} data-link={l.key}
                            sx={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--c-text-2)', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } }}>
                            {l.label}
                          </Box>
                        )}
                    </Tooltip>
                  ))}
                  {s.links.length > 4 && <Box component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>+{s.links.length - 4} more</Box>}
                </Box>
              )}
            </Box>
          </Fragment>
        ))}
      </Box>
      <Typography data-testid="buying-stage-summary" sx={{ mt: 0.5, fontSize: 12.5, color: 'var(--c-text-3)' }}>{stageBarSummary(trace)}</Typography>
    </Box>
  );
}

/** Loads the document's trace and draws the bar. `version` reloads it after the document changes. */
export function BuyingStageBar({ type, id, version }: { type: BuyingDocType; id: number; version?: string | number }) {
  const load = useLoad(() => getProcurementTrace(type, id), [type, id, version]);
  if (load.error) return <ErrorNotice error={load.error} onRetry={load.reload} sx={{ mb: 1.5 }} />;
  if (!load.data) {
    return (
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }} aria-busy="true" aria-label="Loading the buying stages">
        {[70, 80, 76, 64, 72, 70, 68, 90, 74].map((w, i) => <SkeletonBlock key={i} w={w} h={24} r={6} />)}
      </Box>
    );
  }
  return <BuyingStageBarView trace={load.data} />;
}
