import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { Evaluation, PlannerSnapshot, PlannerUnit } from '../../lib/planner/types';
import { LoadStrip } from './LoadStrip';
import { monthName } from './model';
import { UnitCard } from './UnitCard';

export interface HoverInfo { key: string; period: string; ok: boolean; reason?: string; load: Evaluation['load'] }

const TRAY = 150;
const COL = 150;
const COL_EMPTY = 104;

/**
 * The board: periods across (grouped under their month), one swimlane per order.
 * Cards wait in the tray on the lane's left until they are given a period. Drop a
 * card on a period to plan it, or on the tray to take it off the plan.
 */
export function Board({ snapshot, evaluation, units, canEdit, dragKey, hover, selectedKey, onOpen, onDragStart, onDragEnd, onHover, onDrop }: {
  snapshot: PlannerSnapshot;
  evaluation: Evaluation;
  units: Map<string, PlannerUnit>;
  canEdit: boolean;
  dragKey: string | null;
  hover: HoverInfo | null;
  selectedKey: string | null;
  onOpen: (key: string) => void;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onHover: (key: string, period: string) => void;
  onDrop: (key: string, period: string | null) => void;
}) {
  const periods = snapshot.horizon.periods;
  const fns = snapshot.functions;
  const months = useMemo(() => {
    const out: { month: string; span: number }[] = [];
    for (const p of periods) {
      const last = out[out.length - 1];
      if (last && last.month === p.month) last.span += 1; else out.push({ month: p.month, span: 1 });
    }
    return out;
  }, [periods]);

  // lane → period (or 'tray') → cards, in the snapshot's own order.
  const lanes = useMemo(() => {
    const map = new Map<string, Map<string, PlannerUnit[]>>();
    for (const u of snapshot.units) {
      const ev = evaluation.units[u.key];
      if (!ev) continue;
      const lane = String(u.orderId);
      let cells = map.get(lane);
      if (!cells) { cells = new Map(); map.set(lane, cells); }
      const cell = ev.period ?? 'tray';
      const list = cells.get(cell);
      if (list) list.push(u); else cells.set(cell, [u]);
    }
    return map;
  }, [snapshot.units, evaluation.units]);

  // a period that holds cards is a little wider than an empty one
  const busy = useMemo(() => {
    const set = new Set<string>();
    for (const cells of lanes.values()) for (const [k, list] of cells) if (list.length) set.add(k);
    return set;
  }, [lanes]);
  const template = `${TRAY}px ${periods.map((p) => `minmax(${busy.has(p.key) ? COL : COL_EMPTY}px, ${busy.has(p.key) ? 1.4 : 1}fr)`).join(' ')}`;
  const width = TRAY + periods.reduce((s, p) => s + (busy.has(p.key) ? COL : COL_EMPTY), 0);

  // codes without the order prefix, and without whatever every code of the order shares
  const shortCodes = useMemo(() => {
    const out = new Map<string, string>();
    const sep = /[-_/ .]/;
    for (const o of snapshot.orders) {
      const mine = snapshot.units.filter((u) => String(u.orderId) === String(o.id) && !((u.quantity ?? 1) > 1));
      const rest = mine.map((u) => (o.code && u.code.startsWith(o.code) ? u.code.slice(o.code.length).replace(/^[-_/ .]+/, '') : u.code));
      let common = '';
      if (rest.length > 1) {
        const first = rest[0];
        for (let i = 1; i <= first.length; i++) {
          if (!sep.test(first[i - 1])) continue;
          const cand = first.slice(0, i);
          if (rest.every((r) => r.startsWith(cand) && r.length > cand.length)) common = cand; else break;
        }
      }
      mine.forEach((u, i) => { out.set(u.key, rest[i].slice(common.length) || rest[i] || u.code); });
    }
    return out;
  }, [snapshot.orders, snapshot.units]);

  const dragUnit = dragKey ? units.get(dragKey) : undefined;
  const dragFns = useMemo(() => new Set(dragUnit ? Object.keys(dragUnit.work).filter((k) => (dragUnit.work[k] ?? 0) > 0) : []), [dragUnit]);
  const loadView = hover?.load ?? evaluation.load;

  return (
    <Box sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 230px)', minHeight: 420, border: '1px solid var(--c-border)', borderRadius: '10px', background: 'var(--c-surface)' }}>
      <Box sx={{ minWidth: width }}>
        {/* headers */}
        <Box sx={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: template }}>
            <Box />
            {months.map((m) => (
              <Box key={m.month} sx={{ gridColumn: `span ${m.span}`, px: 1, py: 0.5, fontWeight: 600, fontSize: 13, borderLeft: '1px solid var(--c-border)' }}>{monthName(m.month)}</Box>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: template }}>
            <Box sx={{ px: 1, py: 0.25, fontSize: 12, color: 'var(--c-text-3)' }}>Not planned</Box>
            {periods.map((p) => (
              <Box key={p.key} sx={{ px: 1, py: 0.25, fontSize: 12, color: 'var(--c-text-3)', borderLeft: '1px solid var(--c-divider)' }}>{p.label}</Box>
            ))}
          </Box>
        </Box>

        {snapshot.orders.map((o) => {
          const cells = lanes.get(String(o.id));
          const droppable = (key: string | null) => !!dragUnit && String(dragUnit.orderId) === String(o.id) && canEdit && key !== undefined;
          return (
            <Box key={o.id} sx={{ display: 'grid', gridTemplateColumns: template, borderBottom: '1px solid var(--c-border)' }}>
              <Box
                onDragOver={(e) => { if (droppable(null)) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (dragKey && droppable(null)) onDrop(dragKey, null); }}
                sx={{ p: 0.75, background: dragUnit && String(dragUnit.orderId) === String(o.id) ? 'var(--c-surface-2)' : undefined }}>
                <Typography sx={{ fontWeight: 600, fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)' }}>{o.code}</Typography>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {(cells?.get('tray') ?? []).map((u) => (
                    <UnitCard key={u.key} unit={u} shortCode={shortCodes.get(u.key)} ev={evaluation.units[u.key]} fns={fns} draggable={canEdit} selected={selectedKey === u.key}
                      onOpen={() => onOpen(u.key)} onDragStart={(e) => { e.dataTransfer.setData('text/plain', u.key); e.dataTransfer.effectAllowed = 'move'; onDragStart(u.key); }} onDragEnd={onDragEnd} />
                  ))}
                </Box>
              </Box>
              {periods.map((p) => {
                const mine = !!dragUnit && String(dragUnit.orderId) === String(o.id);
                const h = hover && mine && hover.period === p.key ? hover : null;
                return (
                  <Box key={p.key}
                    onDragOver={(e) => { if (droppable(p.key)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragKey) onHover(dragKey, p.key); } }}
                    onDrop={(e) => { e.preventDefault(); if (dragKey && droppable(p.key)) onDrop(dragKey, p.key); }}
                    title={h && !h.ok ? h.reason : undefined}
                    sx={{
                      p: 0.5, borderLeft: '1px solid var(--c-divider)', position: 'relative',
                      background: h ? (h.ok ? 'var(--c-success-50)' : 'var(--c-danger-50)') : mine ? 'var(--c-surface-2)' : undefined,
                      outline: h ? `2px solid ${h.ok ? 'var(--c-success-600)' : 'var(--c-danger-600)'}` : undefined, outlineOffset: -2,
                    }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {(cells?.get(p.key) ?? []).map((u) => (
                        <UnitCard key={u.key} unit={u} shortCode={shortCodes.get(u.key)} ev={evaluation.units[u.key]} fns={fns} draggable={canEdit} selected={selectedKey === u.key}
                          onOpen={() => onOpen(u.key)} onDragStart={(e) => { e.dataTransfer.setData('text/plain', u.key); e.dataTransfer.effectAllowed = 'move'; onDragStart(u.key); }} onDragEnd={onDragEnd} />
                      ))}
                    </Box>
                    {h && !h.ok && h.reason && (
                      <Typography sx={{ position: 'absolute', left: 4, right: 4, bottom: 2, fontSize: 11, color: 'var(--c-danger-800)', background: 'var(--c-danger-50)', borderRadius: '4px', px: 0.5, pointerEvents: 'none' }}>{h.reason}</Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          );
        })}

        <LoadStrip functions={fns} periods={periods} load={loadView} template={template} live={!!hover} highlight={dragFns} />
      </Box>
    </Box>
  );
}
