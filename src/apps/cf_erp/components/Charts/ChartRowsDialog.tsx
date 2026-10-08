import { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, TextField, Tooltip, Typography, styled,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ContentPasteGoRounded from '@mui/icons-material/ContentPasteGoRounded';
import SortRounded from '@mui/icons-material/SortRounded';
import { cfApi, CfApiError } from '../../api/client';
import type { Chart, ChartAxis, ChartLevel, ChartRow } from '../../api/charts';
import type { Specification, Tree } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import {
  LEVEL_DEPTH, axisHeading, draftToRows, parsePastedRows, resolveLevel, resolveOption, rowsToDraft, sortDraft,
  type EditorLookups, type LevelNode,
} from '../../lib/charts';
import { flattenTree } from '../../lib/tree';
import { DialogHeader } from '../FormDialog';
import { ErrorNotice } from '../ui';

const PasteArea = styled('textarea')({
  width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)', fontSize: 12, padding: 8,
  border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)', resize: 'vertical',
});

const Grid = styled('table')({
  borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 13, color: 'var(--c-text)',
  '& th, & td': { borderBottom: '1px solid var(--c-divider)', borderRight: '1px solid var(--c-divider)', padding: 0, textAlign: 'left' },
  '& thead th': { position: 'sticky', top: 0, zIndex: 2, background: 'var(--c-surface-2)', padding: '4px 8px', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' },
  '& .cell-in': {
    boxSizing: 'border-box', width: '100%', minWidth: 110, height: 32, border: 0, margin: 0, padding: '0 8px', background: 'transparent', color: 'inherit',
    font: 'inherit', fontSize: 13, outline: 'none',
  },
  '& .cell-num': { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  '& .cell-in:focus': { boxShadow: 'inset 0 0 0 2px var(--c-primary-500)', background: 'var(--c-surface)' },
  '& .cell-in::placeholder': { color: 'var(--c-text-3)', opacity: 1 },
});

const emptyLevels = (): Record<ChartLevel, LevelNode[]> => ({ FAMILY: [], SUBFAMILY: [], VARIANT: [] });

/**
 * The rows of a chart in a grid: one column per input and the result last.
 * Numbers are number cells, pick-lists a choice, text a text cell and a tree
 * level a search over the nodes at that level. Rows can be added, deleted,
 * sorted, or pasted in from Excel. Names a paste cannot place are sent as typed
 * and the server's words come back here.
 *
 * `onSave` gets the rows to send (it may throw a CfApiError, which is shown here);
 * `null` means "clear".
 */
export function ChartRowsDialog({ open, onClose, title, axes, resultLabel, rows, nodes, onSave, disabled, canClear = true }: {
  open: boolean;
  onClose: () => void;
  title: string;
  axes: ChartAxis[];
  /** Heading of the result column with its unit, e.g. "Drill time (s)". */
  resultLabel: string;
  rows: ChartRow[] | null;
  /** Names of the tree nodes the level cells already use. */
  nodes?: Chart['nodes'];
  onSave: (rows: ChartRow[] | null) => Promise<void> | void;
  disabled?: boolean;
  canClear?: boolean;
}) {
  const needsTree = axes.some((a) => a.kind === 'level');
  const needsSpecs = axes.some((a) => a.kind === 'spec' && a.dataType === 'option');
  const tree = useLoad(() => (open && needsTree ? cfApi.get<Tree>('/classification') : Promise.resolve(null)), [open, needsTree]);
  const specs = useLoad(() => (open && needsSpecs ? cfApi.get<Specification[]>('/specifications') : Promise.resolve(null)), [open, needsSpecs]);

  const lookups = useMemo<EditorLookups>(() => {
    const levels = emptyLevels();
    for (const n of flattenTree(tree.data)) {
      if (n.scope === 'machine' || n.status === 'inactive') continue;
      (Object.keys(LEVEL_DEPTH) as ChartLevel[]).forEach((l) => { if (n.depth === LEVEL_DEPTH[l]) levels[l].push({ id: n.id, code: n.code, name: n.name }); });
    }
    // A node the rows already use is always a choice, even if the tree could not be read.
    for (const [id, nd] of Object.entries(nodes ?? {})) {
      for (const a of axes) {
        if (a.kind === 'level' && !levels[a.level].some((n) => n.id === Number(id))) levels[a.level].push({ id: Number(id), code: nd.code, name: nd.name });
      }
    }
    const options: EditorLookups['options'] = {};
    for (const a of axes) {
      if (a.kind !== 'spec' || a.dataType !== 'option') continue;
      const sp = (specs.data ?? []).find((s) => s.code === a.field);
      options[a.field] = (sp?.options ?? []).filter((o) => o.status !== 'inactive').map((o) => ({ value: o.value, label: o.label }));
    }
    return { levels, options };
  }, [tree.data, specs.data, nodes, axes]);

  const nameOf = (a: ChartAxis, text: string) => {
    if (a.kind === 'level') return resolveLevel(text, lookups.levels[a.level])?.name ?? text;
    return text;
  };
  const columns = axes.length + 1;

  const [draft, setDraft] = useState<string[][]>(() => sortDraft(axes, rowsToDraft(rows), (a, t) => (a.kind === 'level' ? nodes?.[Number(t)]?.name ?? t : t)));
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  const result = useMemo(() => draftToRows(axes, draft, lookups), [axes, draft, lookups]);
  const set = (r: number, c: number, v: string) => setDraft((d) => d.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  const addRow = () => setDraft((d) => [...d, Array(columns).fill('')]);
  const removeRow = (r: number) => setDraft((d) => d.filter((_, i) => i !== r));

  const applyPaste = () => {
    const out = parsePastedRows(pasteText, columns);
    if ('error' in out) { setPasteError(out.error); return; }
    // Place what we can (a level name -> its node, an option label -> its value); the rest goes as typed.
    const placed = out.rows.map((cells) => cells.map((t, i) => {
      const a = axes[i];
      if (!a) return t;
      if (a.kind === 'level') { const n = resolveLevel(t, lookups.levels[a.level]); return n ? String(n.id) : t; }
      if (a.dataType === 'option') return resolveOption(t, lookups.options[a.field] ?? []) ?? t;
      return t;
    }));
    setDraft(placed);
    setPasteError(null);
    setPasting(false);
    setPasteText('');
  };

  const save = async (clear = false) => {
    setBusy(true); setError(null);
    try {
      await onSave(clear ? null : result.rows);
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e)));
    }
  };

  const locked = disabled || busy;
  const loadingLists = tree.loading || specs.loading;

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="md" fullWidth>
      <DialogHeader title={`${title} — rows`} busy={busy} onClose={onClose}
        subtitle={`${[...axes.map(axisHeading), resultLabel].join(' · ')}`} />
      <DialogContent>
        <ErrorNotice error={error} />
        <ErrorNotice error={tree.error} onRetry={tree.reload} />
        <ErrorNotice error={specs.error} onRetry={specs.reload} />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {result.rows.length} row{result.rows.length === 1 ? '' : 's'}. An empty result means the machine cannot.
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button size="small" startIcon={<SortRounded fontSize="small" />} onClick={() => setDraft((d) => sortDraft(axes, d, nameOf))} disabled={locked || draft.length < 2}>
              Sort rows
            </Button>
            <Button size="small" startIcon={<ContentPasteGoRounded fontSize="small" />} onClick={() => setPasting((p) => !p)} disabled={locked}>
              Paste from Excel
            </Button>
          </Box>
        </Box>
        {pasting && (
          <Box sx={{ mb: 2, p: 1.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>
              Copy {columns} columns from Excel, one row per line: {[...axes.map(axisHeading), resultLabel].join(', ')}. Families and pick-list choices can be written by name.
            </Typography>
            <PasteArea value={pasteText} onChange={(e) => { setPasteText(e.target.value); setPasteError(null); }} rows={5} aria-label="Pasted rows" />
            {pasteError && <Alert severity="error" sx={{ mt: 1, borderRadius: 'var(--r-sm)' }}>{pasteError}</Alert>}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button size="small" variant="contained" onClick={applyPaste} disabled={!pasteText.trim()}>Replace the rows with this</Button>
              <Button size="small" onClick={() => { setPasting(false); setPasteText(''); setPasteError(null); }}>Cancel</Button>
            </Box>
          </Box>
        )}

        <Box sx={{ overflow: 'auto', border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm)', maxHeight: 440 }}>
          <Grid data-testid="chart-rows-grid">
            <thead>
              <tr>
                {axes.map((a, i) => <th key={i}>{axisHeading(a)}</th>)}
                <th>{resultLabel}</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {draft.map((row, r) => (
                <tr key={r}>
                  {axes.map((a, c) => (
                    <td key={c}>
                      {a.kind === 'level' ? (
                        <LevelCell nodes={lookups.levels[a.level]} text={row[c] ?? ''} label={a.label} disabled={locked} onPick={(id) => set(r, c, id == null ? '' : String(id))} />
                      ) : a.dataType === 'option' ? (
                        <OptionCell choices={lookups.options[a.field] ?? []} text={row[c] ?? ''} label={a.label} disabled={locked} onChange={(v) => set(r, c, v)} />
                      ) : a.dataType === 'number' ? (
                        <input className="cell-in cell-num" inputMode="decimal" aria-label={`${a.label}, row ${r + 1}`} value={row[c] ?? ''} disabled={locked}
                          onChange={(e) => set(r, c, e.target.value)} />
                      ) : (
                        <input className="cell-in" aria-label={`${a.label}, row ${r + 1}`} value={row[c] ?? ''} disabled={locked} onChange={(e) => set(r, c, e.target.value)} />
                      )}
                    </td>
                  ))}
                  <td>
                    <input className="cell-in cell-num" inputMode="decimal" placeholder="cannot" aria-label={`${resultLabel}, row ${r + 1}`} value={row[axes.length] ?? ''} disabled={locked}
                      onChange={(e) => set(r, axes.length, e.target.value)} />
                  </td>
                  <td>
                    <Tooltip title="Delete row">
                      <span><IconButton size="small" aria-label={`Delete row ${r + 1}`} disabled={locked} onClick={() => removeRow(r)}><DeleteOutlineRounded fontSize="small" /></IconButton></span>
                    </Tooltip>
                  </td>
                </tr>
              ))}
              {!draft.length && <tr><td colSpan={columns + 1} style={{ padding: 12, color: 'var(--c-text-3)', textAlign: 'center' }}>No rows yet. Add one, or paste from Excel.</td></tr>}
            </tbody>
          </Grid>
        </Box>
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button size="small" startIcon={<AddRounded fontSize="small" />} onClick={addRow} disabled={locked}>Add row</Button>
          {loadingLists && <CircularProgress size={14} />}
        </Box>
        {result.problems.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 'var(--r-sm)' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {result.problems.slice(0, 6).map((p) => <span key={p}>{p}</span>)}
              {result.problems.length > 6 && <span>and {result.problems.length - 6} more.</span>}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {canClear && <Button color="error" onClick={() => void save(true)} disabled={locked || !rows?.length}>Clear chart</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={locked || result.problems.length > 0 || !result.rows.length}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Save rows'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** A pick-list cell. A value the list does not have (a paste) is kept and shown as typed. */
function OptionCell({ choices, text, label, disabled, onChange }: {
  choices: { value: string; label: string | null }[]; text: string; label: string; disabled?: boolean; onChange: (v: string) => void;
}) {
  const known = !text || choices.some((c) => c.value === text);
  return (
    <select className="cell-in" aria-label={label} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {!known && <option value={text}>{text} (not in the list)</option>}
      {choices.map((c) => <option key={c.value} value={c.value}>{c.label && c.label !== c.value ? `${c.label} (${c.value})` : c.value}</option>)}
    </select>
  );
}

/** A tree-level cell: search the nodes at that level. Text the tree cannot place stays as typed. */
function LevelCell({ nodes, text, label, disabled, onPick }: {
  nodes: LevelNode[]; text: string; label: string; disabled?: boolean; onPick: (id: number | null) => void;
}) {
  const node = resolveLevel(text, nodes);
  return (
    <Autocomplete size="small" options={nodes} value={node} disabled={disabled} blurOnSelect
      getOptionLabel={(n) => n.name} isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, n) => onPick(n ? n.id : null)}
      renderInput={(p) => (
        <TextField {...p} variant="standard" placeholder={!node && text ? `${text} (not found)` : label}
          inputProps={{ ...p.inputProps, 'aria-label': label }} InputProps={{ ...p.InputProps, disableUnderline: true, sx: { px: 1, height: 32, fontSize: 13 } }} />
      )} />
  );
}
