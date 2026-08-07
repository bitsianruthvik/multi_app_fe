/**
 * MachineTabs.tsx — one tab per machine, each with a completeness dot.
 *
 * Replaces a dropdown, for two reasons. A supervisor moving between their
 * machines does it constantly, and a dropdown costs two clicks and hides the
 * other machines entirely. And a row of dots creates the instinct to clear
 * them — you can see at a glance which machine still owes you an answer.
 *
 * THE DOT IS NOT A SCORE. Three states, and the grey one is the important one:
 *
 *   grey     nothing to account for — no shift, plant closed. NOT a failure, and
 *            colouring it red would train people to ignore the dot inside a week.
 *            The nudge only works while it is believed.
 *   amber    real unaccounted time remains
 *   green    fully accounted
 *
 * Deliberately not aggregated or ranked across people. The moment it grades a
 * person rather than describing a machine, it gets fed fiction — and these
 * streams are shared, so that fiction reaches every estimate downstream
 * (FAB_ERP_PEOPLE_PLAN §0).
 *
 * SCROLLS HORIZONTALLY, because there is no per-machine access scoping yet:
 * production has 43 machines in one company. Once supervisors are scoped to a
 * plant the strip becomes a handful, but it must not break before then.
 */

import { Box, Tab, Tabs, Tooltip } from '@mui/material';
import type { CoverageState, MachineCoverage } from '../api/gaps';

const DOT: Record<CoverageState, { colour: string; title: (m: MachineCoverage) => string }> = {
  none: {
    colour: 'var(--c-text-3)',
    title: () => 'Nothing to account for — no working time in this range',
  },
  partial: {
    colour: 'var(--c-warning-600, #D97706)',
    title: (m) => `${fmt(m.gapMinutes)} still unaccounted`,
  },
  complete: {
    colour: 'var(--c-success-600, #16A34A)',
    title: (m) => `All ${fmt(m.workingMinutes)} accounted for`,
  },
};

function fmt(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

export function MachineTabs({ machines, value, onChange }: {
  machines: MachineCoverage[];
  value: number | null;
  onChange: (resourceId: number) => void;
}) {
  if (!machines.length) return null;

  // Never let an unknown value throw MUI's out-of-range warning — on first load
  // and after a company switch the selection can legitimately not be in the list.
  const safeValue = machines.some((m) => m.resourceId === value) ? value : false;

  return (
    <Tabs
      value={safeValue}
      onChange={(_e, v) => onChange(Number(v))}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      sx={{ minHeight: 40, borderBottom: '1px solid var(--c-border)', mb: 2 }}
    >
      {machines.map((m) => {
        const d = DOT[m.state] ?? DOT.none;
        return (
          <Tab
            key={m.resourceId}
            value={m.resourceId}
            sx={{ minHeight: 40, fontSize: 12.5, textTransform: 'none', py: 0.5 }}
            label={
              <Tooltip title={d.title(m)}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: d.colour, flexShrink: 0,
                  }} />
                  {m.name}
                </Box>
              </Tooltip>
            }
          />
        );
      })}
    </Tabs>
  );
}
