/**
 * MachineLoadPanel — what every machine is due to put out, and what is queued
 * behind it.
 *
 * TONNES, not hours. Hours say whether a machine is full; tonnes say whether the
 * job is moving, and the order the customer signed is denominated in steel.
 *
 * The same steel appears at every station it passes — a 13 t segment that is
 * cut, welded and painted gives 13 t to each of those three, because each of
 * them really handles 13 t. So a machine's row is meaningful and a column total
 * would not be, which is why there is no total row.
 *
 * Grouped under the resource type, because "SAW Welding 2 is quiet" only means
 * something next to the other three welders.
 */

import { useMemo } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import type { MachineLoadRow } from '../../api/planner';

/** A short label for a bucket key — "8 Sep" for a week, "Sep" for a month. */
function bucketLabel(key: string, bucket: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return bucket === 'month'
    ? at.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })
    : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function MachineLoadPanel({
  rows, bucketKeys, bucket, selectedMachineId, onPick,
}: {
  rows: MachineLoadRow[];
  bucketKeys: string[];
  bucket: string;
  selectedMachineId?: number | null;
  onPick?: (machineId: number) => void;
}) {
  /**
   * The busiest single cell sets the scale for every bar.
   *
   * Scaling each machine to its own maximum would make a quiet welder look as
   * busy as the crane, which is the one comparison this panel exists to make.
   */
  const peak = useMemo(() => {
    let max = 0;
    for (const r of rows) for (const b of r.buckets) if (b.tonnes > max) max = b.tonnes;
    return max || 1;
  }, [rows]);

  const byType = useMemo(() => {
    const groups = new Map<string, MachineLoadRow[]>();
    for (const r of rows) {
      if (!groups.has(r.typeName)) groups.set(r.typeName, []);
      groups.get(r.typeName)!.push(r);
    }
    return [...groups.entries()];
  }, [rows]);

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        Nothing planned on any machine in this window.
      </Typography>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ minWidth: 520 }}>
        <Stack direction="row" sx={{ pl: '200px', pr: '108px', mb: 0.5 }}>
          {bucketKeys.map((k) => (
            <Typography
              key={k}
              variant="caption"
              sx={{ flex: 1, textAlign: 'center', color: 'text.secondary' }}
            >
              {bucketLabel(k, bucket)}
            </Typography>
          ))}
        </Stack>

        {byType.map(([typeName, machines]) => (
          <Box key={typeName} sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              {typeName}
            </Typography>
            {machines.map((m) => {
              const cells = new Map(m.buckets.map((b) => [b.bucket, b]));
              const selected = selectedMachineId === m.machineId;
              return (
                <Stack
                  key={m.machineId}
                  direction="row"
                  alignItems="center"
                  onClick={onPick ? () => onPick(m.machineId) : undefined}
                  sx={{
                    cursor: onPick ? 'pointer' : 'default',
                    borderRadius: 1,
                    bgcolor: selected ? 'action.selected' : 'transparent',
                    '&:hover': onPick ? { bgcolor: 'action.hover' } : undefined,
                    py: 0.25,
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ width: 200, pl: 1, pr: 1, flexShrink: 0 }}
                    title={m.name}
                  >
                    {m.name}
                  </Typography>

                  {bucketKeys.map((k) => {
                    const cell = cells.get(k);
                    const t = cell?.tonnes ?? 0;
                    return (
                      <Box key={k} sx={{ flex: 1, px: 0.25 }}>
                        <Tooltip
                          title={cell
                            ? `${cell.tonnes} t · ${cell.hours} h · ${cell.tasks} tasks · ${cell.backlogTonnes} t still queued after this`
                            : 'nothing planned'}
                        >
                          <Box sx={{ height: 20, display: 'flex', alignItems: 'flex-end' }}>
                            <Box
                              sx={{
                                width: '100%',
                                // Floored at 2px so a machine with a little work
                                // reads as "some", not as "none".
                                height: t > 0 ? `${Math.max(2, (t / peak) * 20)}px` : 0,
                                bgcolor: selected ? 'primary.main' : 'primary.light',
                                borderRadius: 0.5,
                              }}
                            />
                          </Box>
                        </Tooltip>
                      </Box>
                    );
                  })}

                  <Typography
                    variant="caption"
                    sx={{ width: 100, textAlign: 'right', pr: 1, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {m.totalTonnes} t
                    {m.beyondWindowTonnes > 0 && (
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        {' '}+{m.beyondWindowTonnes} q
                      </Box>
                    )}
                  </Typography>
                </Stack>
              );
            })}
          </Box>
        ))}

        <Typography variant="caption" color="text.secondary">
          Tonnes of steel each machine is planned to process. The same piece counts at every
          station it passes, so a machine&rsquo;s row is meaningful and a column total is not.
          <b> q</b> is what is still queued beyond this window.
        </Typography>
      </Box>
    </Box>
  );
}
