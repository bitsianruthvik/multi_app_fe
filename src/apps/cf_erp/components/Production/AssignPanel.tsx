import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Menu, MenuItem, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import { SheetGrid, type SheetCell, type SheetRange, type SheetWrite } from '@shared/ui';
import { CfApiError } from '../../api/client';
import { getAssignment, postAssignment, postAssignments } from '../../api/production';
import type { AssignCell, AssignRow, AssignmentView, Contractor, Party } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { appPath } from '../../navMeta';
import { ErrorNotice, Mono, SkeletonRows } from '../ui';
import { FormDialog } from '../FormDialog';
import { PartyDialog } from '../PartyDialog';
import { InHouseChip, WorkOrderChip } from './workOrderUi';
import { useTreeRows } from './treeRows';
import { opShortLabel } from '../../lib/stripLayout';

/** A soft tint per contractor, from the chart tokens so it follows light and dark. */
const tintFor = (index: number) => `color-mix(in srgb, var(--c-chart-${(index % 8) + 1}) 20%, var(--c-surface))`;
const NONE: never[] = [];
const IN_HOUSE = { id: null as number | null, code: '', name: 'In-house' };
type Choice = { id: number | null; code: string; name: string };

/**
 * Open the tree folded to the girder lines: the first depth where one parent
 * holds several pieces of the SAME bom line (the repeated L11, L12 ...) stays
 * visible and everything below it is folded.
 */
function girderDepth(rows: AssignRow[]): number | undefined {
  const seen = new Set<string>();
  let best: number | undefined;
  for (const r of rows) {
    if (r.bomLineId == null || r.parentKey == null) continue;
    const k = `${r.parentKey}:${r.bomLineId}`;
    if (seen.has(k) && (best === undefined || r.depth < best)) best = r.depth;
    seen.add(k);
  }
  return best;
}

/** A row and everything under it, folded or not, keyed by its BOM path relative to it. */
function pathsUnder(kids: Map<string | null, AssignRow[]>, root: AssignRow) {
  const out = new Map<string, AssignRow>();
  const walk = (r: AssignRow, path: string) => {
    out.set(path, r);
    const seen = new Map<number | null, number>();
    for (const k of kids.get(r.key) ?? []) {
      const n = seen.get(k.bomLineId ?? null) ?? 0;
      seen.set(k.bomLineId ?? null, n + 1);
      walk(k, `${path}/${k.bomLineId ?? 'x'}.${n}`);
    }
  };
  walk(root, '');
  return out;
}

/**
 * Contractors: who does each operation on each piece. Blank means this shop.
 * Pick boxes (or a whole piece with its parts, or a whole column), press
 * Assign, choose a contractor. It needs the line locked because the pieces
 * (L11, L12 …) only exist from then on.
 */
export function AssignPanel({ orderId, lineId }: { orderId: number; lineId: number }) {
  const company = useCompanySlug();
  const canProduce = useIsPermitted()('cf_erp_production_manage');
  const load = useLoad(() => getAssignment(orderId, lineId), [orderId, lineId]);
  const [view, setView] = useState<AssignmentView | null>(null);
  const [sel, setSel] = useState<SheetRange>({ rows: [], cols: [] });
  const [problem, setProblem] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [creating, setCreating] = useState(false);
  const [added, setAdded] = useState<Contractor[]>([]);
  useEffect(() => { if (load.data) setView(load.data); }, [load.data]);
  const [, setParams] = useSearchParams();
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; rowKey: string } | null>(null);
  const [copied, setCopied] = useState<{ rowKey: string; code: string } | null>(null);
  const tree = useTreeRows(view?.rows ?? NONE, { openDepth: girderDepth(view?.rows ?? NONE), resetKey: lineId });
  const contractors = useMemo(() => {
    const all = [...(view?.contractors ?? [])];
    for (const a of added) if (!all.some((c) => c.id === a.id)) all.push(a);
    return all;
  }, [view?.contractors, added]);

  if (load.error && !view) return <ErrorNotice error={load.error} onRetry={load.reload} />;
  if (!view) return <SkeletonRows rows={4} height={36} />;
  if (!view.line.locked) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Freeze the design first — contractors are assigned to pieces.</Typography>
        <Button variant="contained" size="small" onClick={() => setParams((prev) => { const p = new URLSearchParams(prev); p.set('tab', 'lock'); return p; }, { replace: true })}>Go to Freeze design</Button>
      </Box>
    );
  }

  const rowByKey = new Map(view.rows.map((r) => [r.key, r]));
  const tint = new Map(contractors.map((c, i) => [c.id, tintFor(i)]));
  const cell = (rowKey: string, colKey: string): AssignCell | undefined => rowByKey.get(rowKey)?.cells[colKey];

  const cellAt = (rowKey: string, colKey: string): SheetCell => {
    const c = cell(rowKey, colKey);
    if (!c) {
      const op = view.operations.find((o) => String(o.id) === colKey)?.name ?? 'This operation';
      return { text: '', applies: false, why: `${op} is not in this piece's flow` };
    }
    const can = c.editable && !c.started && canProduce;
    const why = c.started ? c.why || 'Already started — it belongs to whoever started it.' : !canProduce ? 'Your role cannot assign work.' : c.why || undefined;
    return {
      // A drop-down of the contractors (blank = in-house); typing still finds one by the start of its name.
      text: c.contractorName ?? '', input: c.contractorName ?? '', restore: c.contractorName ?? '', editable: can, why: can ? undefined : why, kind: 'option',
      options: [{ value: IN_HOUSE.name, label: IN_HOUSE.name }, ...contractors.map((k) => ({ value: k.name, label: k.name }))],
      tint: c.contractorId != null ? tint.get(c.contractorId) : undefined,
      title: c.contractorName ? `${c.contractorName}${c.started ? ' — started' : ''}` : c.started ? why : 'In-house',
    };
  };

  /** The boxes in the selection that can change hands. */
  // In the strip layout each row has its own operations, so the selection names its cells exactly.
  const picked = sel.cells ? sel.cells.map((x) => ({ r: x.rowKey, k: x.colKey })) : sel.rows.flatMap((r) => sel.cols.map((k) => ({ r, k })));
  const assignable = picked.map((x) => ({ ...x, c: cell(x.r, x.k) })).filter((x) => x.c && x.c.editable && !x.c.started && canProduce);
  const skipped = picked.length - assignable.length;

  const send = async (cells: { r: string; k: string }[], contractorId: number | null) => {
    setView(await postAssignment(orderId, lineId, cells.map((x) => ({ pieceId: Number(x.r), operationId: Number(x.k) })), contractorId));
  };

  const findContractor = (text: string): Choice | null | undefined => {
    const t = text.trim().toLowerCase();
    if (t === '' || t === 'in-house' || t === 'in house') return IN_HOUSE;
    return contractors.find((c) => c.name.toLowerCase() === t || c.code.toLowerCase() === t);
  };

  /** Ctrl+V of contractor names (or Delete) over a range: the same as Assign, one contractor at a time. */
  const onWrites = async (writes: SheetWrite[]) => {
    const groups = new Map<number | null, { r: string; k: string }[]>();
    for (const w of writes) {
      const who = findContractor(w.text);
      if (!who) { setProblem(`No contractor called “${w.text}”. Use “Assign…” and “+ New contractor” to add one first.`); return; }
      groups.set(who.id, [...(groups.get(who.id) ?? []), { r: w.rowKey, k: w.colKey }]);
    }
    setProblem(null);
    try { for (const [id, cells] of groups) await send(cells, id); } catch (e) { setProblem(e instanceof CfApiError ? e.message : 'Could not assign that.'); load.reload(); }
  };

  const kidsOf = new Map<string | null, AssignRow[]>();
  for (const x of view.rows) kidsOf.set(x.parentKey, [...(kidsOf.get(x.parentKey) ?? []), x]);

  /** Right-click on a row header: copy the contractors of that piece and its parts, or paste what was copied. */
  const pasteHere = async (clickedKey: string) => {
    const source = copied && rowByKey.get(copied.rowKey);
    if (!copied || !source) return;
    // Targets: the selected rows when the clicked one is among them (top-most only), else just the clicked row.
    const chosen = new Set(sel.rows.includes(clickedKey) ? sel.rows : [clickedKey]);
    const roots = [...chosen].map((k) => rowByKey.get(k)).filter((x): x is AssignRow => !!x && !(x.parentKey && chosen.has(x.parentKey)));
    const from = pathsUnder(kidsOf, source);
    const groups = new Map<number | null, { pieceId: number; operationId: number }[]>();
    const unmatched: string[] = [];
    let pieces = 0;
    for (const root of roots) {
      for (const [path, target] of pathsUnder(kidsOf, root)) {
        const src = from.get(path);
        if (!src) { unmatched.push(target.code ?? target.name); continue; }
        let touched = false;
        for (const [op, tc] of Object.entries(target.cells)) {
          const sc = src.cells[op];
          const want = sc ? sc.contractorId : tc.contractorId; // an operation the source piece lacks stays as it is
          if (want === tc.contractorId) continue;
          groups.set(want, [...(groups.get(want) ?? []), { pieceId: Number(target.key), operationId: Number(op) }]);
          touched = true;
        }
        if (touched) pieces += 1;
      }
    }
    const missed = unmatched.length ? ` ${unmatched.length} ${unmatched.length === 1 ? 'piece' : 'pieces'} had no match and stayed as they were (${unmatched.slice(0, 4).join(', ')}${unmatched.length > 4 ? ', …' : ''}).` : '';
    setProblem(null);
    if (!groups.size) { setNote(`Nothing to change — they already match ${copied.code}.${missed}`); return; }
    try {
      setView(await postAssignments(orderId, lineId, [...groups].map(([contractorId, cells]) => ({ cells, contractorId }))));
      setNote(`Copied contractors from ${copied.code} onto ${pieces} ${pieces === 1 ? 'piece' : 'pieces'}.${missed}`);
    } catch (e) {
      setNote(null);
      setProblem(e instanceof CfApiError ? e.message : 'Could not paste those contractors.');
      load.reload();
    }
  };
  const inHouse = view.rows.reduce((n, x) => n + Object.values(x.cells).filter((c) => c.workOrderId == null).length, 0);

  const openDialog = () => { setChoice(null); setDialog(true); };
  const workOrders = view.workOrders.filter((w) => w.status !== 'cancelled');

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minHeight: 36 }}>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', flex: '1 1 260px' }}>
          {contractors.length === 0
            ? 'No contractors yet. Add one here (or in Production › Contractors), then select boxes and assign them.'
            : 'Blank means we do it here. Select boxes (drag, or click a piece name for its whole subtree), then Assign. A started operation cannot change hands.'}
        </Typography>
        {assignable.length === 0 && (
          <Button size="small" variant={contractors.length === 0 ? 'contained' : 'text'} startIcon={<AddRounded />} onClick={() => setCreating(true)}>New contractor</Button>
        )}
        {assignable.length > 0 && <>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{assignable.length} {assignable.length === 1 ? 'box' : 'boxes'} selected</Typography>
          <Button variant="contained" onClick={openDialog}>Assign…</Button>
        </>}
      </Box>
      {workOrders.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {workOrders.map((w) => (
            <WorkOrderChip key={w.id} to={appPath(company, `work-orders/${w.id}`)} tint={w.contractorId != null ? tint.get(w.contractorId) : undefined}
              contractor={w.contractorName ?? 'Contractor'} code={w.code} count={w.cellCount} />
          ))}
          <InHouseChip count={inHouse} />
        </Box>
      )}
      <ErrorNotice error={load.error} onRetry={load.reload} />
      <SheetGrid ariaLabel="Contractors" cornerHeader="Piece" rowHeaderWidth={360} fillViewport busy={load.loading} onProblem={setProblem} hint={null}
        onSelectionChange={setSel}
        rowColumns={(key) => { const r = rowByKey.get(key); return r ? view.operations.filter((o) => r.cells[o.id]).map((o) => String(o.id)) : []; }} prefKey="contractors"
        columns={view.operations.map((o) => ({ key: String(o.id), label: o.name, short: opShortLabel(o), stripWidth: 120, header: o.name, width: 130 }))}
        rows={tree.visible.map((r) => ({
          key: r.key, label: r.code ?? r.name, depth: r.depth, collapsible: tree.hasChildren(r.key), collapsed: tree.isCollapsed(r.key),
          header: <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
            {r.code && <Mono>{r.code}</Mono>}
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.code ? 'var(--c-text-2)' : undefined }}>{r.name}</Box>
            {r.quantity > 1 && <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11, flexShrink: 0 }}>×{r.quantity}</Box>}
          </Box>,
        }))}
        cellAt={cellAt} onWrites={onWrites} onToggleRow={tree.toggle} rowSelect={tree.subtree} historyKey={String(lineId)}
        rowProps={(rowKey) => ({
          onContextMenu: (e) => {
            if (!(e.target as HTMLElement).closest('[role="rowheader"]')) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, rowKey });
          },
        })} />
      <Menu open={!!menu} onClose={() => setMenu(null)} anchorReference="anchorPosition" anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}>
        <MenuItem onClick={() => { const x = menu && rowByKey.get(menu.rowKey); if (x) { setCopied({ rowKey: x.key, code: x.code ?? x.name }); setNote(`Copied the contractors of ${x.code ?? x.name}. Right-click another piece to paste them.`); } setMenu(null); }}>
          Copy contractors from this row
        </MenuItem>
        {canProduce && <MenuItem disabled={!copied} onClick={() => { const k = menu?.rowKey; setMenu(null); if (k) void pasteHere(k); }}>
          Paste contractors here{copied ? ` (from ${copied.code})` : ''}
        </MenuItem>}
      </Menu>
      {note && !problem && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{note}</Typography>}
      {problem && <Typography role="alert" sx={{ fontSize: 13, color: 'var(--c-danger-800)' }}>{problem}</Typography>}

      <FormDialog open={dialog} title="Assign to" onClose={() => setDialog(false)} maxWidth="xs" submitLabel="Assign" busyLabel="Assigning…"
        submitDisabled={!choice}
        subtitle={`${assignable.length} ${assignable.length === 1 ? 'box' : 'boxes'}${skipped > 0 ? ` — ${skipped} more cannot change (started, or not in the flow)` : ''}`}
        onSubmit={async () => {
          if (!choice) return;
          await send(assignable.map((x) => ({ r: x.r, k: x.k })), choice.id);
          setDialog(false);
        }}>
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Autocomplete<Choice, false, true> autoHighlight disableClearable options={[IN_HOUSE, ...contractors]} value={choice ?? undefined}
            getOptionLabel={(o) => o.name} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, v) => setChoice(v)}
            renderInput={(p) => <TextField {...p} autoFocus label="Contractor" placeholder="Choose one, or In-house" />} />
          <Box><Button size="small" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New contractor</Button></Box>
        </Box>
      </FormDialog>
      <PartyDialog open={creating} existing={null} defaultRole="subcontractor" onClose={() => setCreating(false)}
        onSaved={(p: Party) => { setCreating(false); const c = { id: p.id, code: p.code, name: p.name }; setAdded((a) => [...a, c]); setChoice(c); }} />
    </Box>
  );
}
