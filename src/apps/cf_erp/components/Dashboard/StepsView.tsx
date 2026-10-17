/**
 * Dashboard › By order: the "Own steps" / "Including everything below" choice (lib/stepsView.ts)
 * and the per-operation totals it shows on a tree row.
 */
import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { STEPS_VIEWS, opTotalTitle, type OpTotal, type StepsView } from '../../lib/stepsView';

export function StepsViewToggle({ view, onChange, testId = 'steps-view' }: { view: StepsView; onChange: (v: StepsView) => void; testId?: string }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: StepsView | null) => { if (v) onChange(v); }} aria-label="Which steps to count" data-testid={testId}
      sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { px: 1, py: 0.1, fontSize: 12, textTransform: 'none', lineHeight: 1.6 } }}>
      {STEPS_VIEWS.map((s) => (
        <Tooltip key={s.key} title={s.hint} arrow disableInteractive>
          <ToggleButton value={s.key} data-view={s.key} aria-pressed={view === s.key}>{s.label}</ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}

/** One pill per operation: "CUT 3/4" with done, total, minutes and % on hover. */
export function OpTotalStrip({ totals }: { totals: OpTotal[] }) {
  if (!totals.length) return null;
  return (
    <Box data-testid="op-totals" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
      {totals.map((t) => {
        const full = t.pct != null && t.pct >= 99.95;
        const some = (t.pct ?? 0) > 0;
        return (
          <Tooltip key={t.operationId} title={opTotalTitle(t)} arrow disableInteractive>
            <Box component="span" data-testid="op-total" data-op={t.operationId} aria-label={opTotalTitle(t)}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 18, px: 0.625, borderRadius: '5px', flexShrink: 0,
                border: '1px solid', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, lineHeight: 1,
                background: full ? 'var(--c-success-50)' : some ? 'var(--c-primary-50)' : 'var(--c-surface)',
                borderColor: full ? 'var(--c-success-600)' : some ? 'var(--c-primary-300)' : 'var(--c-border)',
                color: full ? 'var(--c-success-800)' : 'var(--c-text-2)',
              }}>
              {t.code ?? t.name.slice(0, 4)} {Number.isInteger(t.done) ? t.done : Number(t.done.toFixed(1))}/{t.total}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
