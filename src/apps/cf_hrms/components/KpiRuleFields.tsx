/**
 * A library KPI's "Measured in" and "Which way is better" (CF_HRMS_HIRING_SPEC.md §24 step 2) — the
 * part of the KPI dialog in Libraries that every role, position and person using the KPI inherits.
 * Both optional: "Not set" keeps the KPI as it was (its targets are read from their words).
 */
import { Box, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import {
  BETTERS, BETTER_MARK, BETTER_SHORT, MEASURES, MEASURE_UNITS, MEASURE_WORDS, asBetter, asMeasure, sentenceOf,
  type Measure, type TargetSpec,
} from './kpiTarget';

/** A sample target, to show how this KPI's targets will read. */
const SAMPLE: Record<Measure, [number, number, number]> = {
  PERCENTAGE: [95, 90, 98], NUMBER: [100, 80, 120], CURRENCY: [1200000, 1000000, 1200000], DURATION: [30, 20, 40],
  WEIGHT: [2400, 2000, 2400], LENGTH: [1000, 800, 1200], BOOLEAN: [0, 0, 0], DATE: [0, 0, 0],
};

export function KpiRuleFields({
  measurementType,
  unit,
  direction,
  onChange,
}: {
  measurementType: string;
  unit: string;
  direction: string;
  onChange: (patch: { measurementType?: string; unit?: string; direction?: string }) => void;
}) {
  const measure = asMeasure(measurementType);
  const better = asBetter(direction);
  const units = measure ? MEASURE_UNITS[measure] : [];
  const noWay = measure === 'BOOLEAN' || measure === 'DATE';

  const pickMeasure = (m: string) => {
    const next = asMeasure(m);
    const u = next ? MEASURE_UNITS[next] : [];
    onChange({
      measurementType: m,
      // The unit follows: its own for %, ₹ and m; the first of a time or a weight; a Number keeps a label.
      unit: !next ? unit : u.length ? (u.includes(unit) ? unit : u[0]) : next === 'NUMBER' ? (units.length ? '' : unit) : '',
      ...(next === 'BOOLEAN' || next === 'DATE' ? { direction: '' } : {}),
    });
  };

  let example: string | null = null;
  if (measure) {
    const [v, lo, hi] = SAMPLE[measure];
    const u = measure === 'NUMBER' ? (unit.trim() || null) : (unit || units[0] || null);
    const spec: TargetSpec | null = measure === 'BOOLEAN' ? { measure, unit: null, direction: null }
      : measure === 'DATE' ? { measure, unit: null, direction: null, date: `${new Date().getFullYear()}-12-31` }
        : better === 'TARGET_RANGE' ? { measure, unit: u, direction: better, min: lo, max: hi }
          : better ? { measure, unit: u, direction: better, value: v } : null;
    example = sentenceOf(spec);
  }

  return (
    <Box data-kpirule="" sx={{ border: '1px solid var(--c-border)', borderRadius: 1.5, p: 1.5 }}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            select
            label="Measured in"
            value={measure ?? ''}
            onChange={(e) => pickMeasure(e.target.value)}
            size="small"
            fullWidth
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">Not set — targets are words</MenuItem>
            {MEASURES.map((m) => <MenuItem key={m} value={m}>{MEASURE_WORDS[m]}</MenuItem>)}
          </TextField>
          {units.length > 1 && (
            <TextField select label="Unit" value={unit || units[0]} onChange={(e) => onChange({ unit: e.target.value })} size="small" sx={{ minWidth: { sm: 140 } }} fullWidth>
              {units.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
            </TextField>
          )}
          {measure === 'NUMBER' && (
            <TextField
              label="Counted as (optional)"
              placeholder="cylinders, count"
              value={unit}
              onChange={(e) => onChange({ unit: e.target.value.slice(0, 50) })}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
        </Stack>
        {!noWay && (
          <Box>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>Which way is better</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={better ?? ''}
              onChange={(_, v: string | null) => onChange({ direction: v ?? '' })}
              aria-label="Which way is better"
              sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 13, px: 1.25, py: 0.4 } }}
            >
              {BETTERS.map((b) => (
                <ToggleButton key={b} value={b} aria-label={BETTER_SHORT[b]}>
                  <Box component="span" sx={{ mr: 0.6, fontSize: 12 }}>{BETTER_MARK[b]}</Box>{BETTER_SHORT[b]}
                </ToggleButton>
              ))}
              <ToggleButton value="" aria-label="Not set">Not set</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {example
            ? <>Targets will read like: <Box component="span" sx={{ fontWeight: 600, color: 'var(--c-text)' }}>{example}</Box>. Every role, position and person using this KPI follows this; they give only the number.</>
            : measure
              ? 'Say which way is better, and roles, positions and people give only the number.'
              : 'Not set: each target is read from its words, as before ("95%", "Max 30 minutes").'}
        </Typography>
      </Stack>
    </Box>
  );
}
