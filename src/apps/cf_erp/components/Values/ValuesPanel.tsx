import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Alert, Box, Button, CircularProgress, FormControlLabel, InputAdornment, Switch, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import { cfApi, CfApiError } from '../../api/client';
import { useCompanySlug } from '../../hooks/useLoad';
import { DangerBadge, EmptyState, ErrorNotice, Fact, SectionCard, SkeletonRows, WarnBadge } from '../ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../toastContext';
import { ValuesGroupTable } from './ValuesGroupTable';
import {
  countEdits, effectiveCell, placeProblems, readDraft, stillMissing, usableDraft, writeDraft, writesOf,
  type Edits, type PlacedProblems, type SaveValuesResult, type ValuesRow, type ValuesView,
} from './valuesModel';

const NO_EDITS: Edits = {};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The Values stage: every specification value of one order line's structure
 * in one place — not only the required ones, everything that applies — typed
 * like a spreadsheet and saved once.
 *
 * One read (`GET /order-lines/:id/values`, 8 round trips whatever the size of
 * the structure) and one write (`PUT`, one transaction, all or nothing, every
 * problem back at once). Rows are records, grouped by kind of thing because
 * different kinds take different specifications: a part takes its size and
 * grade, an assembly mostly roll-ups. The order's own temporary items are
 * typed here; catalog records under them are shown, read-only, because their
 * values belong to the record itself. A worked-out value (fixed, calculated,
 * roll-up, inherited) is shown with the reason it is not typed.
 *
 * Nothing is saved until Save. What is typed is marked as changed, kept per
 * viewer in the browser (so a switch of tab or line does not lose it — it
 * comes back marked, with a way to discard it), and guarded: closing the tab
 * warns, and so does following a link while something is unsaved.
 */
export function ValuesPanel({ lineId, canEdit, onChanged, onPendingChange }: {
  lineId: number;
  /**
   * May this person write values here? The caller's answer — the PUT accepts
   * either grant in VALUES_WRITE_PERMISSIONS (valuesModel.ts) — and the server
   * checks again. A locked line is read-only whatever this says.
   */
  canEdit: boolean;
  /** After a save: whatever the screen around it counts (the stage tabs and their marks) is worth reading again. */
  onChanged?: () => void;
  /** Values typed but not saved, for a screen around it that wants to guard its own tab or line switch. */
  onPendingChange?: (count: number) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const company = useCompanySlug();
  const [loaded, setLoaded] = useState<{ lineId: number; view: ValuesView | null; error: CfApiError | null } | null>(null);
  const [tick, setTick] = useState(0);
  // Kept with the line it belongs to, so a switch of line can never save — or
  // store — one line's typing under the other's id.
  const [pending, setPending] = useState<{ lineId: number; edits: Edits; hydrated: boolean }>({ lineId, edits: NO_EDITS, hydrated: false });
  const [restored, setRestored] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<{ lineId: number; error: CfApiError; placed: PlacedProblems } | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [leaving, setLeaving] = useState<string | null>(null);
  const [askReload, setAskReload] = useState(false);

  useEffect(() => {
    let alive = true;
    cfApi.get<ValuesView>(`/order-lines/${lineId}/values`)
      .then((v) => {
        if (!alive) return;
        // Typing left unsaved on this line comes back — where it still means something.
        const draft = readDraft(lineId);
        const usable = draft ? usableDraft(v, draft, canEdit) : NO_EDITS;
        setLoaded({ lineId, view: v, error: null });
        setPending({ lineId, edits: usable, hydrated: true });
        setRestored(countEdits(usable));
      })
      .catch((e) => { if (alive) setLoaded({ lineId, view: null, error: e instanceof CfApiError ? e : new CfApiError(0, String(e)) }); });
    return () => { alive = false; };
  }, [lineId, tick, canEdit]);

  const view = loaded?.lineId === lineId ? loaded.view : null;
  const loadError = loaded?.lineId === lineId ? loaded.error : null;
  const edits = pending.lineId === lineId ? pending.edits : NO_EDITS;
  const problem = failed?.lineId === lineId ? failed : null;
  const pendingCount = useMemo(() => countEdits(edits), [edits]);
  const dirty = pendingCount > 0;

  useEffect(() => { if (pending.hydrated) writeDraft(pending.lineId, pending.edits); }, [pending]);
  useEffect(() => { onPendingChange?.(pendingCount); }, [pendingCount, onPendingChange]);

  // Closing or reloading the tab with something unsaved.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Following a link inside the app with something unsaved. The app runs on a
  // BrowserRouter, which has no navigation blocker, so the click itself is
  // caught — before the router sees it — and asked about first.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  const rowsById = useMemo(() => new Map<number, ValuesRow>(view ? view.groups.flatMap((g) => g.rows.map((r) => [r.id, r] as const)) : []), [view]);

  /** Gaps right now, with what is typed but not saved — per group, and on the order's own items. */
  const gaps = useMemo(() => {
    const byGroup = new Map<string, number>();
    const rows = new Set<number>();
    let own = 0;
    if (!view) return { byGroup, own, rows: 0 };
    for (const g of view.groups) {
      let n = 0;
      for (const row of g.rows) {
        for (const col of g.columns) {
          const cell = row.cells[col.code];
          if (!cell) continue;
          if (stillMissing(effectiveCell(view, col, row, cell, canEdit), edits[row.id]?.[col.code])) {
            n += 1;
            if (g.own) rows.add(row.id);
          }
        }
      }
      byGroup.set(g.key, n);
      if (g.own) own += n;
    }
    return { byGroup, own, rows: rows.size };
  }, [view, edits, canEdit]);

  // "Only what's missing" reads what is SAVED, so a row does not vanish under
  // the cursor the moment its last gap is typed; it goes after the save.
  const q = search.trim().toLowerCase();
  const shown = useMemo(() => (view ? view.groups.map((g) => ({
    g,
    rows: g.rows.filter((r) => (!onlyMissing || r.missing > 0)
      && (!q || (r.code ?? '').toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.parent?.code ?? '').toLowerCase().includes(q))),
  })) : []), [view, onlyMissing, q]);

  const onEdit = useCallback((recordId: number, code: string, value: string, saved: string) => {
    setPending((p) => {
      const rows = { ...p.edits };
      const row = { ...(rows[recordId] ?? {}) };
      if (value === saved) delete row[code]; else row[code] = value;
      if (Object.keys(row).length) rows[recordId] = row; else delete rows[recordId];
      return { ...p, edits: rows };
    });
    // A cell that is being corrected stops shouting about the last save.
    setFailed((f) => {
      if (!f?.placed.cells[recordId]?.[code]) return f;
      const cells = { ...f.placed.cells, [recordId]: { ...f.placed.cells[recordId] } };
      delete cells[recordId][code];
      return { ...f, placed: { ...f.placed, cells } };
    });
  }, []);

  const onToggle = useCallback((key: string) => {
    setCollapsed((s) => { const next = new Set(s); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }, []);

  // Each group is handed only its own edits, and the SAME object for as long as
  // none of them changes — so a keystroke re-renders one group, not all nine.
  const groupEditsRef = useRef(new Map<string, Edits>());
  const groupEdits = useMemo(() => {
    const next = new Map<string, Edits>();
    for (const g of view?.groups ?? []) {
      const mine: Edits = {};
      let n = 0;
      for (const r of g.rows) {
        const e = edits[r.id];
        if (e) { mine[r.id] = e; n += 1; }
      }
      const prev = groupEditsRef.current.get(g.key);
      const same = !!prev && Object.keys(prev).length === n && Object.keys(mine).every((id) => prev[Number(id)] === mine[Number(id)]);
      next.set(g.key, same && prev ? prev : n ? mine : NO_EDITS);
    }
    groupEditsRef.current = next;
    return next;
  }, [view, edits]);

  const discard = useCallback(() => {
    setPending((p) => ({ ...p, edits: NO_EDITS }));
    writeDraft(lineId, NO_EDITS);
    setRestored(0);
    setFailed(null);
  }, [lineId]);

  const save = async () => {
    if (!view || !dirty || saving) return;
    setSaving(true);
    setFailed(null);
    try {
      const out = await cfApi.put<SaveValuesResult>(`/order-lines/${lineId}/values`, { writes: writesOf(edits) });
      setLoaded({ lineId, view: out.view, error: null });
      setPending({ lineId, edits: NO_EDITS, hydrated: true });
      setRestored(0);
      toast.success(out.summary.sentence);
      onChanged?.();
    } catch (e) {
      const error = e instanceof CfApiError ? e : new CfApiError(0, String(e));
      setFailed({ lineId, error, placed: placeProblems(error.problems, edits, rowsById) });
      // Closed or released since the screen was opened: read it again, so the lock shows.
      if (error.status === 409) setTick((t) => t + 1);
    } finally {
      setSaving(false);
    }
  };

  const onRootKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
    }
  };

  if (loadError) return <ErrorNotice error={loadError} onRetry={() => setTick((t) => t + 1)} />;
  if (!view) return <SkeletonRows rows={6} height={36} />;

  const c = view.counts;
  const typedHere = canEdit && view.editable;
  const barUp = typedHere && (dirty || saving);
  const visibleGroups = shown.filter((s) => s.rows.length > 0);
  const allCollapsed = view.groups.every((g) => collapsed.has(g.key));

  return (
    <Box onKeyDown={onRootKeyDown} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <SectionCard title="Values"
        subtitle={`Line ${view.line.lineNo} — every specification of ${view.root.code ?? view.root.name} and what it is made of, grouped by kind of thing.`}
        actions={(
          <>
            {view.groups.length > 1 && (
              <Button size="small" startIcon={allCollapsed ? <UnfoldMoreRounded /> : <UnfoldLessRounded />}
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(view.groups.map((g) => g.key)))}>
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </Button>
            )}
            <Button size="small" startIcon={<RefreshRounded />} disabled={saving}
              onClick={() => { if (dirty) setAskReload(true); else { setFailed(null); setTick((t) => t + 1); } }}>Reload</Button>
          </>
        )}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
          <ValuesSummary view={view} canEdit={canEdit} gapsOwn={gaps.own} gapsRows={gaps.rows}
            restored={dirty ? restored : 0} onDiscard={discard}
            search={search} onSearch={setSearch} onlyMissing={onlyMissing} onOnlyMissing={setOnlyMissing}
            // While the save bar is up, a refused save's problems are listed in it — next to the button that was pressed.
            error={barUp ? null : problem?.error ?? null} />

          {c.rows === 0 ? (
            <EmptyState title="Nothing under this line takes values" hint="No specification rule reaches the items of this structure." />
          ) : visibleGroups.length === 0 ? (
            <EmptyState title={onlyMissing && !q ? 'Nothing is missing' : 'Nothing matches'}
              hint={onlyMissing && !q ? 'Every required value on this line is filled.' : 'No item’s code or name has that in it.'}
              action={<Button onClick={() => { setSearch(''); setOnlyMissing(false); }}>Show everything</Button>} />
          ) : visibleGroups.map(({ g, rows }) => (
            <ValuesGroupTable key={g.key} view={view} group={g} rows={rows} edits={groupEdits.get(g.key) ?? NO_EDITS} problems={problem?.placed ?? null}
              canEdit={canEdit} busy={saving} collapsed={collapsed.has(g.key)} missingNow={gaps.byGroup.get(g.key) ?? 0}
              onToggle={onToggle} onEdit={onEdit} company={company} />
          ))}
        </Box>
      </SectionCard>

      {barUp && (
        <Box role="region" aria-label="Unsaved values" sx={{
          position: 'sticky', bottom: 0, zIndex: 5, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1,
          px: 2, py: 1.25, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', boxShadow: 'var(--e-2)',
        }}>
          {problem && !saving && (
            <Box sx={{ maxHeight: '30vh', overflowY: 'auto' }}>
              <ErrorNotice error={problem.error} sx={{ mb: 0 }} />
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--c-warning-600)', flexShrink: 0 }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 500, flex: '1 1 180px', minWidth: 0 }}>
              {saving ? `Saving ${plural(pendingCount, 'value')}…` : `${plural(pendingCount, 'change')} not saved yet`}
              {problem && !saving && (
                <Box component="span" sx={{ color: 'var(--c-danger-800)', fontWeight: 400 }}> — {plural(problem.error.problems.length || 1, 'problem')} to fix first</Box>
              )}
            </Typography>
            <Button onClick={discard} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={() => void save()} disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveRounded />}>
              {saving ? 'Saving…' : `Save ${plural(pendingCount, 'value')}`}
            </Button>
          </Box>
        </Box>
      )}

      <ConfirmDialog open={leaving != null} danger title="Leave without saving?" confirmLabel="Leave without saving"
        body={`${plural(pendingCount, 'value')} typed here ${pendingCount === 1 ? 'is' : 'are'} not saved. Leaving now throws ${pendingCount === 1 ? 'it' : 'them'} away.`}
        onClose={() => setLeaving(null)}
        onConfirm={async () => {
          const to = leaving;
          discard();
          setLeaving(null);
          if (to) navigate(to);
        }} />
      <ConfirmDialog open={askReload} danger title="Reload and lose what is typed?" confirmLabel="Discard and reload"
        body={`${plural(pendingCount, 'value')} typed here ${pendingCount === 1 ? 'is' : 'are'} not saved. Reading the line again throws ${pendingCount === 1 ? 'it' : 'them'} away.`}
        onClose={() => setAskReload(false)}
        onConfirm={async () => { discard(); setTick((t) => t + 1); }} />
    </Box>
  );
}

/**
 * The notices, the counts and the filters above the grids. Memoised: typing a
 * value changes none of this until a gap is filled, so a keystroke does not
 * re-render its MUI fields.
 */
const ValuesSummary = memo(function ValuesSummary({
  view, canEdit, gapsOwn, gapsRows, restored, onDiscard, search, onSearch, onlyMissing, onOnlyMissing, error,
}: {
  view: ValuesView;
  canEdit: boolean;
  gapsOwn: number;
  gapsRows: number;
  /** Values brought back from an unsaved draft — 0 once they are saved or discarded. */
  restored: number;
  onDiscard: () => void;
  search: string;
  onSearch: (s: string) => void;
  onlyMissing: boolean;
  onOnlyMissing: (on: boolean) => void;
  error: CfApiError | null;
}) {
  const c = view.counts;
  const typedHere = canEdit && view.editable;
  return (
    <>
      {view.lock && <Alert severity="info">{view.lock.message}</Alert>}
      {!view.lock && !canEdit && (
        <Alert severity="info">You can see these values, but your role cannot change them. Ask an administrator for the orders permission.</Alert>
      )}
      {restored > 0 && (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={onDiscard}>Discard</Button>}>
          {plural(restored, 'value')} typed here earlier {restored === 1 ? 'was' : 'were'} never saved — {restored === 1 ? 'it is' : 'they are'} back, marked as changed. Save, or discard {restored === 1 ? 'it' : 'them'}.
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 3, rowGap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Fact label="Missing">
          {gapsOwn > 0
            ? <DangerBadge label={`${gapsOwn} in ${plural(gapsRows, 'item')}`} title="Required values that are still empty. An item cannot be activated until they are filled, and a draft item stops release." />
            : <Typography sx={{ fontSize: 13, color: 'var(--c-success-800)' }}>Every required value is filled</Typography>}
        </Fact>
        <Fact label="Items">
          <Typography sx={{ fontSize: 13 }}>{c.own} of its own{c.shared ? ` · ${c.shared} shared` : ''}</Typography>
        </Fact>
        {c.missingShared > 0 && (
          <Fact label="On shared records">
            <WarnBadge label={`${c.missingShared} missing`} title="Required values missing on catalog records under this line. They are set on each record itself, not here." />
          </Fact>
        )}
        {c.unresolved > 0 && (
          <Fact label="Not chosen yet">
            <WarnBadge label={plural(c.unresolved, 'selection')} title="A selection's values come with the catalog item chosen for it — choose it in the structure first." />
          </Fact>
        )}
        {c.noValues > 0 && (
          <Fact label="Take no values">
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{plural(c.noValues, 'item')}</Typography>
          </Fact>
        )}
        {view.truncated && <WarnBadge label="Deeper levels not shown" title="The structure is deeper than this view goes." />}
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, rowGap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Find a code or name"
          inputProps={{ 'aria-label': 'Find a code or name' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          sx={{ flex: '1 1 200px', maxWidth: 320, minWidth: 0 }} />
        <FormControlLabel
          control={<Switch size="small" checked={onlyMissing} onChange={(e) => onOnlyMissing(e.target.checked)} disabled={!onlyMissing && c.rowsMissing === 0} />}
          label={<Typography sx={{ fontSize: 13 }}>Only what’s missing{c.rowsMissing ? ` (${plural(c.rowsMissing, 'item')})` : ''}</Typography>}
          sx={{ mr: 0 }} />
        {typedHere && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flex: '1 1 100%' }}>
            Enter moves down · Tab moves across · Esc undoes a cell · Ctrl+S saves
          </Typography>
        )}
      </Box>

      <ErrorNotice error={error} sx={{ mb: 0 }} />
    </>
  );
});
