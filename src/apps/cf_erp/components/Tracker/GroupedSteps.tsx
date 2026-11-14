import { useMemo, useState, type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import type { TrackerStepRow } from '../../api/types';
import { Mono, Surface } from '../ui';

/**
 * Production › Tracker › Steps, grouped (user, 2026-11-14: "by machines and by order + machines"). Each group is a
 * header with its counts — running, ready, waiting, done — and opens to the same table as the flat list. A step not
 * on a machine yet goes under the machine the planner put it on; with no plan either, under "No machine yet".
 * Groups with work running or ready come first. Only opened groups draw their table.
 */

export type StepGroupBy = 'none' | 'machine' | 'order' | 'order_machine' | 'operation';

type Row = TrackerStepRow & { planned?: { machine: { id: number; code: string; name: string } | null; start: string | null; end: string | null } };

interface Key { id: string; title: string; sub: string | null }
const machineKey = (s: Row): Key => {
  const m = s.machine ?? s.planned?.machine ?? null;
  if (!m) return { id: 'm-none', title: 'No machine yet', sub: 'not on a machine and not planned on one' };
  return { id: `m${m.id}`, title: m.code, sub: `${m.name}${!s.machine && s.planned?.machine ? ' · planned' : ''}` };
};
const orderKey = (s: Row): Key => ({ id: `o${s.order.id}`, title: s.order.code, sub: null });
const operationKey = (s: Row): Key => ({ id: `op${s.operation.id}`, title: s.operation.name, sub: s.operation.code });

interface Group { key: Key; rows: Row[]; children: Group[] | null }

function counts(rows: Row[]) {
  const c = { running: 0, ready: 0, waiting: 0, held: 0, done: 0 };
  for (const s of rows) {
    if (s.status === 'in_progress') c.running += 1;
    else if (s.status === 'ready') c.ready += 1;
    else if (s.status === 'on_hold') c.held += 1;
    else if (s.status === 'done') c.done += 1;
    else c.waiting += 1;
  }
  return c;
}

function groupBy(rows: Row[], keyOf: (s: Row) => Key): Group[] {
  const by = new Map<string, Group>();
  for (const s of rows) {
    const k = keyOf(s);
    const g = by.get(k.id) ?? { key: k, rows: [], children: null };
    // A machine group names "planned" only when none of its steps is on it yet.
    if (k.sub && !k.sub.endsWith('planned') && g.key.sub?.endsWith('planned')) g.key = k;
    g.rows.push(s);
    by.set(k.id, g);
  }
  const score = (g: Group) => { const c = counts(g.rows); return (c.running ? 2 : 0) + (c.ready ? 1 : 0); };
  return [...by.values()].sort((a, b) => score(b) - score(a) || (a.key.id === 'm-none' ? 1 : b.key.id === 'm-none' ? -1 : a.key.title.localeCompare(b.key.title)));
}

function buildGroups(rows: Row[], by: StepGroupBy): Group[] {
  if (by === 'machine') return groupBy(rows, machineKey);
  if (by === 'order') return groupBy(rows, orderKey);
  if (by === 'operation') return groupBy(rows, operationKey);
  if (by === 'order_machine') return groupBy(rows, orderKey).map((g) => ({ ...g, children: groupBy(g.rows, machineKey) }));
  return [];
}

function Counts({ rows }: { rows: Row[] }) {
  const c = counts(rows);
  const chip = (n: number, label: string, color: string) => (n ? (
    <Box component="span" sx={{ fontSize: 12, color, whiteSpace: 'nowrap' }}><Mono sx={{ fontSize: 12, fontWeight: 600, color }}>{n}</Mono> {label}</Box>
  ) : null);
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'baseline' }}>
      {chip(c.running, 'running', 'var(--c-info-700)')}
      {chip(c.ready, 'ready', 'var(--c-success-700)')}
      {chip(c.held, 'on hold', 'var(--c-danger-700)')}
      {chip(c.waiting, 'waiting', 'var(--c-text-2)')}
      {chip(c.done, 'done', 'var(--c-text-3)')}
    </Box>
  );
}

function GroupBox({ g, depth, open, onToggle, table }: { g: Group; depth: number; open: Set<string>; onToggle: (id: string) => void; table: (rows: Row[]) => ReactNode }) {
  const id = `${depth}:${g.key.id}`;
  const isOpen = open.has(id);
  return (
    <Box sx={{ borderBottom: '1px solid var(--c-divider)' }}>
      <Box role="button" tabIndex={0} aria-expanded={isOpen} data-testid="step-group" onClick={() => onToggle(id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id); } }}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, pl: 1.5 + depth * 2.5, cursor: 'pointer', background: depth ? 'transparent' : 'var(--c-surface-2)', '&:hover': { background: 'var(--c-surface-2)' } }}>
        {isOpen ? <ExpandMoreRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} /> : <ChevronRightRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} />}
        <Mono sx={{ fontWeight: 700, fontSize: 13 }}>{g.key.title}</Mono>
        {g.key.sub && <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mr: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.key.sub}</Typography>}
        <Box sx={{ flex: '1 1 auto' }} />
        <Counts rows={g.rows} />
      </Box>
      {isOpen && (g.children
        ? g.children.map((c) => <GroupBox key={c.key.id} g={c} depth={depth + 1} open={open} onToggle={onToggle} table={table} />)
        : <Box sx={{ pl: depth * 2.5 }}>{table(g.rows)}</Box>)}
    </Box>
  );
}

export function GroupedSteps({ rows, by, table }: { rows: Row[]; by: StepGroupBy; table: (rows: Row[]) => ReactNode }) {
  const groups = useMemo(() => buildGroups(rows, by), [rows, by]);
  // The first group with work running or ready opens by itself.
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups[0] ? [`0:${groups[0].key.id}`] : []));
  const toggle = (id: string) => setOpen((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  if (!groups.length) return null;
  return (
    <Surface e={1} sx={{ overflow: 'hidden' }} data-testid="grouped-steps">
      {groups.map((g) => <GroupBox key={g.key.id} g={g} depth={0} open={open} onToggle={toggle} table={table} />)}
    </Surface>
  );
}
