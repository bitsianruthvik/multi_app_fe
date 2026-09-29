import { useMemo, useState } from 'react';
import { Box, MenuItem, Select, Typography } from '@mui/material';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import type { Evaluation, PlannerOrder } from '../../lib/planner/types';
import { shortDate } from './model';

/**
 * Orders in the order they are built: drag to rank (first = most important). Each
 * line says how finely it is planned — whole, or down through its structure.
 */
export function OrdersRail({ orders, evaluation, unitLines, canEdit, onReorder, onLevel }: {
  orders: PlannerOrder[];
  evaluation: Evaluation;
  /** unit key → line id, to count what is still unplanned per line. */
  unitLines: Map<string, string>;
  canEdit: boolean;
  onReorder: (ids: (number | string)[]) => void;
  onLevel: (lineId: number | string, level: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const unplanned = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, ev] of Object.entries(evaluation.units)) {
      if (ev.period) continue;
      const line = unitLines.get(k);
      if (line) m.set(line, (m.get(line) ?? 0) + 1);
    }
    return m;
  }, [evaluation.units, unitLines]);

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = orders.map((o) => String(o.id)).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    const byId = new Map(orders.map((o) => [String(o.id), o.id]));
    onReorder(ids.map((id) => byId.get(id)!));
  }

  return (
    <Box aria-label="Orders" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 13 }}>Orders{canEdit ? ' — drag to rank' : ''}</Typography>
      {orders.map((o, i) => (
        <Box key={o.id}
          onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(String(o.id)); } }}
          onDrop={(e) => { e.preventDefault(); drop(String(o.id)); setDragId(null); setOverId(null); }}
          sx={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '10px', p: 1,
            outline: overId === String(o.id) && dragId && dragId !== String(o.id) ? '2px solid var(--c-primary-400)' : undefined, opacity: dragId === String(o.id) ? 0.5 : 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {canEdit && (
              <Box draggable aria-label={`Drag to rank ${o.code}`} title="Drag to rank"
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', `order:${o.id}`); e.dataTransfer.effectAllowed = 'move'; setDragId(String(o.id)); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                sx={{ display: 'flex', cursor: 'grab', color: 'var(--c-text-3)' }}><DragIndicatorRounded sx={{ fontSize: 18 }} /></Box>
            )}
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', width: 16 }}>{i + 1}</Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-mono, monospace)' }}>{o.code}</Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.customer}{o.committedDate ? ` · due ${shortDate(o.committedDate)}` : ''}
              </Typography>
            </Box>
          </Box>
          {o.lines.map((l) => {
            const n = unplanned.get(String(l.id)) ?? 0;
            return (
              <Box key={l.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, pl: 3.5 }}>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.name}>
                  {l.lineNo}. {l.name}
                </Typography>
                {n > 0 && <Typography sx={{ fontSize: 11.5, color: 'var(--c-warning-800)' }}>{n} to plan</Typography>}
                {l.levels.length > 1 && (
                  <Select variant="standard" disableUnderline value={l.levels.some((x) => x.value === l.level) ? l.level : ''} disabled={!canEdit}
                    onChange={(e) => onLevel(l.id, String(e.target.value))} inputProps={{ 'aria-label': `Plan ${l.name} by` }}
                    sx={{ fontSize: 12, color: 'var(--c-primary-700)', '& .MuiSelect-select': { py: 0 } }}>
                    {l.levels.map((x) => <MenuItem key={x.value} value={x.value} sx={{ fontSize: 13 }}>{x.label}</MenuItem>)}
                  </Select>
                )}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
