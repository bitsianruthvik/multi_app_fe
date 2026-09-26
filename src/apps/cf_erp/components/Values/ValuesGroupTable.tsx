import { memo, useRef, type KeyboardEvent } from 'react';
import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Link } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { appPath } from '../../navMeta';
import { recordPath } from '../../lib/paths';
import {
  RULE_LABEL, effectiveCell, formatInput, stillMissing,
  type EffectiveCell, type Edits, type PlacedProblems, type ValuesColumn, type ValuesGroup, type ValuesRow, type ValuesView,
} from './valuesModel';

/** Width of a value column, by what goes in it. */
const COL_WIDTH: Record<ValuesColumn['dataType'], number> = { number: 112, option: 140, text: 168, date: 150, boolean: 96 };

/**
 * One kind of thing's grid: its own columns, one row per record.
 *
 * Built for typing down a column, not clicking through a form. Every typed
 * value is a plain native input or select — about 1,400 of them on a bridge, so
 * a MUI field per cell is out of the question — styled by ONE static class on
 * the table (`GridTable`), so no cell and no render builds styles. The group
 * and its rows are memoised, and the panel hands each group only its own
 * edits: a keystroke re-renders the one row it lands in and the group around
 * it, nothing else.
 *
 * Keys: Enter moves down the column (Shift+Enter up), Tab moves across (the
 * browser's own order: only typed cells take focus), ↑ ↓ move in a text or
 * number cell, Esc puts a changed cell back to what is saved.
 */
export const ValuesGroupTable = memo(function ValuesGroupTable({
  view, group, rows, edits, problems, canEdit, busy, collapsed, missingNow, onToggle, onEdit, company,
}: {
  view: ValuesView;
  group: ValuesGroup;
  /** The rows the filters leave, in tree order. */
  rows: ValuesRow[];
  /** This group's edits only — the same object until one of them changes. */
  edits: Edits;
  problems: PlacedProblems | null;
  canEdit: boolean;
  busy: boolean;
  collapsed: boolean;
  /** Gaps in this group right now, with what is typed but not saved. */
  missingNow: number;
  onToggle: (key: string) => void;
  onEdit: (recordId: number, code: string, value: string, saved: string) => void;
  company: string;
}) {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const cls = group.classification;
  const notTyped = group.columns.filter((c) => !['entered', 'defaulted'].includes(c.rule));
  // An option column is as wide as its longest choice (within reason), so a
  // label like "BO — no impact test" is not cut off in the closed select.
  const widthOf = (col: ValuesColumn) => {
    if (col.dataType !== 'option' || !col.options) return COL_WIDTH[col.dataType];
    const longest = (view.optionLists[col.options] ?? []).reduce((n, o) => Math.max(n, (o.label || o.value).length), 0);
    return Math.min(260, Math.max(COL_WIDTH.option, Math.round(longest * 7.4) + 44));
  };

  const move = (from: number, code: string, delta: number) => {
    const table = tableRef.current;
    if (!table) return;
    for (let i = from + delta; i >= 0 && i < rows.length; i += delta) {
      const el = table.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-row="${i}"][data-col="${CSS.escape(code)}"]`);
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement && el.type === 'text') el.select();
        return;
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const { row, col, rec, saved } = t.dataset;
    if (row === undefined || !col) return;
    const i = Number(row);
    const isSelect = t.tagName === 'SELECT';
    const isDate = t instanceof HTMLInputElement && t.type === 'date';
    if (e.key === 'Enter') {
      e.preventDefault();
      move(i, col, e.shiftKey ? -1 : 1);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isSelect && !isDate && !e.altKey) {
      e.preventDefault();
      move(i, col, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Escape' && rec && edits[Number(rec)]?.[col] !== undefined) {
      // Put this cell back — and only this. The Esc goes no further, so a
      // dialog around the grid does not close over a half-undone edit.
      e.preventDefault();
      e.stopPropagation();
      onEdit(Number(rec), col, saved ?? '', saved ?? '');
    }
  };

  return (
    <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', minWidth: 0, overflow: 'hidden' }}>
      <Box component="button" type="button" onClick={() => onToggle(group.key)} aria-expanded={!collapsed}
        sx={{
          all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
          px: 1.5, py: 1.25, background: 'var(--c-surface-2)', borderBottom: collapsed ? 'none' : '1px solid var(--c-divider)',
          '&:focus-visible': { outline: '2px solid var(--c-focus)', outlineOffset: '-2px' },
        }}>
        {collapsed ? <ChevronRightRounded fontSize="small" aria-hidden /> : <ExpandMoreRounded fontSize="small" aria-hidden />}
        <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{cls.name}</Typography>
        <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', minWidth: 0, overflowWrap: 'anywhere' }}>{cls.path}</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {rows.length === group.rows.length ? `${group.rows.length} item${group.rows.length === 1 ? '' : 's'}` : `${rows.length} of ${group.rows.length}`}
        </Typography>
        {missingNow > 0 && (
          <Box component="span" sx={{ fontSize: 12, fontWeight: 500, color: 'var(--c-danger-800)', background: 'var(--c-danger-50)', borderRadius: 'var(--r-sm)', px: 1, py: 0.25 }}>
            {missingNow} missing
          </Box>
        )}
        {!group.own && (
          <Box component="span" sx={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-2)', background: 'var(--c-surface-3)', borderRadius: 'var(--r-sm)', px: 1, py: 0.25 }}>
            Shared · read only
          </Box>
        )}
      </Box>

      {!collapsed && (
        <>
          <Box sx={{ px: 1.5, py: 0.75, fontSize: 12, color: 'var(--c-text-2)', borderBottom: '1px solid var(--c-divider)', overflowWrap: 'anywhere' }}>
            {group.own
              ? notTyped.length > 0
                ? <>Not typed here — {notTyped.map((c, i) => (
                  <Box component="span" key={c.code} title={c.why ?? undefined}>
                    {i > 0 && ' · '}{c.name} ({RULE_LABEL[c.rule].toLowerCase()})
                  </Box>
                ))}.</>
                : 'Every value here is typed.'
              : 'Catalog records shared with other work. Their values belong to each record itself — change them there.'}
          </Box>
          <Box sx={{ overflow: 'auto', maxHeight: 'min(64vh, 560px)' }}>
            <GridTable ref={tableRef} onKeyDown={onKeyDown} aria-label={`${cls.name} values`} aria-busy={busy || undefined}>
              <thead>
                <tr>
                  <th scope="col" className="cfv-head">Item</th>
                  {group.columns.map((col) => (
                    <th key={col.code} scope="col" style={{ width: widthOf(col), minWidth: widthOf(col) }}
                      title={[`${col.name} (${col.code})`, col.why].filter(Boolean).join(' — ')}>
                      <span className="cfv-th-name">{col.name}{col.required && <span className="cfv-req" aria-label="required"> *</span>}</span>
                      <span className="cfv-th-meta">{[col.unit, RULE_LABEL[col.rule]].filter(Boolean).join(' · ')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <ValuesRowView key={row.id} index={i} view={view} columns={group.columns} row={row}
                    rowEdits={edits[row.id]} rowProblems={problems?.cells[row.id]} rowProblem={problems?.rows[row.id]}
                    canEdit={canEdit} busy={busy} onEdit={onEdit} company={company} />
                ))}
              </tbody>
            </GridTable>
          </Box>
        </>
      )}
    </Box>
  );
});

const ValuesRowView = memo(function ValuesRowView({
  index, view, columns, row, rowEdits, rowProblems, rowProblem, canEdit, busy, onEdit, company,
}: {
  index: number;
  view: ValuesView;
  columns: ValuesColumn[];
  row: ValuesRow;
  rowEdits: Record<string, string> | undefined;
  rowProblems: Record<string, string> | undefined;
  rowProblem: string | undefined;
  canEdit: boolean;
  busy: boolean;
  onEdit: (recordId: number, code: string, value: string, saved: string) => void;
  company: string;
}) {
  const label = row.code ?? row.name;
  let gaps = 0;
  const cells = columns.map((col) => {
    const raw = row.cells[col.code];
    if (!raw) return <td key={col.code} className="cfv-na" title={`${col.name} does not apply to ${label}.`}><span aria-hidden>·</span></td>;
    const c = effectiveCell(view, col, row, raw, canEdit);
    const pending = rowEdits?.[col.code];
    const gap = stillMissing(c, pending);
    if (gap) gaps += 1;
    return (
      <CellView key={col.code} col={col} c={c} row={row} index={index} pending={pending} gap={gap}
        problem={rowProblems?.[col.code]} busy={busy} onEdit={onEdit} />
    );
  });
  const where = row.parent ? `in ${row.parent.code ?? row.parent.name}` : 'what the line sells';
  return (
    <tr className={rowProblem ? 'cfv-row-problem' : undefined} title={rowProblem}>
      <th scope="row" className="cfv-head">
        <span className="cfv-code">
          <Link to={appPath(company, recordPath(row.kind, row.id))} tabIndex={-1}>{row.code ?? '—'}</Link>
        </span>
        <span className="cfv-sub" title={`${row.name} · ${where}${row.places > 1 ? ` and ${row.places - 1} other place${row.places > 2 ? 's' : ''}` : ''}`}>
          {row.name} · {where}{row.places > 1 && ` +${row.places - 1}`}
        </span>
        {(gaps > 0 || (row.readOnly && row.kind === 'temporary')) && (
          <span className="cfv-flags">
            {gaps > 0 && <span className="cfv-flag-gap">{gaps} missing</span>}
            {/* A shared record says so on its group; only an own item frozen on its own needs a word here. */}
            {row.readOnly && row.kind === 'temporary' && <span className="cfv-flag-ro" title={row.readOnly}>Frozen</span>}
          </span>
        )}
      </th>
      {cells}
    </tr>
  );
});

function CellView({ col, c, row, index, pending, gap, problem, busy, onEdit }: {
  col: ValuesColumn;
  c: EffectiveCell;
  row: ValuesRow;
  index: number;
  pending: string | undefined;
  gap: boolean;
  problem: string | undefined;
  busy: boolean;
  onEdit: (recordId: number, code: string, value: string, saved: string) => void;
}) {
  const classes = ['cfv-cell'];
  if (gap) classes.push('cfv-missing');
  if (pending !== undefined) classes.push('cfv-pending');
  if (problem) classes.push('cfv-problem');

  if (!c.editable) {
    // Shown, not typed: a worked-out value, a shared record's, a locked line's.
    const text = c.display ?? (c.typeable ? formatInput(col, c.input, c.options) : '');
    const why = [c.problem, c.why, row.readOnly, c.note].filter(Boolean).join(' ');
    classes.push('cfv-ro');
    if (c.problem) classes.push('cfv-bad');
    return (
      <td className={classes.join(' ')} title={why || undefined}>
        {text || (gap ? <span className="cfv-gap-text">Missing</span> : <span aria-hidden>—</span>)}
      </td>
    );
  }

  const value = pending ?? c.input;
  const change = (v: string) => onEdit(row.id, col.code, v, c.input);
  const common = {
    className: `cfv-in${col.dataType === 'number' ? ' cfv-num' : ''}`,
    value,
    disabled: busy,
    'data-row': index,
    'data-col': col.code,
    'data-rec': row.id,
    'data-saved': c.input,
    'aria-label': `${col.name} for ${row.code ?? row.name}`,
    'aria-invalid': problem ? true : undefined,
  };
  const hint = gap ? 'Required' : c.defaultDisplay ? `${c.defaultDisplay} (default)` : '';
  const title = [problem, pending !== undefined ? 'Changed — not saved yet.' : null, c.note].filter(Boolean).join(' ') || undefined;

  let input;
  if (col.dataType === 'option' || col.dataType === 'boolean') {
    const choices = col.dataType === 'boolean'
      ? [{ value: 'true', text: 'Yes' }, { value: 'false', text: 'No' }]
      : (c.options ?? []).map((o) => ({ value: String(o.id), text: o.label || o.value }));
    // A saved value the list no longer offers (retired, or narrowed out) is
    // still shown for what it is, rather than as an empty select.
    const stray = value !== '' && !choices.some((x) => x.value === value);
    input = (
      <select {...common} onChange={(e) => change(e.target.value)}>
        <option value="">{hint || '—'}</option>
        {choices.map((x) => <option key={x.value} value={x.value}>{x.text}</option>)}
        {stray && <option value={value}>{`#${value} — not offered here`}</option>}
      </select>
    );
  } else {
    input = (
      <input {...common} type={col.dataType === 'date' ? 'date' : 'text'} inputMode={col.dataType === 'number' ? 'decimal' : undefined}
        placeholder={hint} maxLength={col.dataType === 'text' ? 500 : undefined} autoComplete="off" spellCheck={false}
        onChange={(e) => change(e.target.value)} />
    );
  }
  return <td className={classes.join(' ')} title={title}>{input}</td>;
}

/**
 * Every style of the grid, on the table — cells use class names. A styled
 * component, not an `sx`: its styles are worked out once for the app, not on
 * every render of every group (the `sx` form cost a few milliseconds per group
 * per keystroke). Plain CSS values, since MUI's spacing shorthands are sx-only.
 */
const GridTable = styled('table')({
  borderCollapse: 'separate',
  borderSpacing: 0,
  width: 'max-content',
  minWidth: '100%',
  fontSize: 13,
  color: 'var(--c-text)',
  '& th, & td': { borderBottom: '1px solid var(--c-divider)', borderRight: '1px solid var(--c-divider)', padding: 0, textAlign: 'left', verticalAlign: 'middle' },
  '& thead th': {
    position: 'sticky', top: 0, zIndex: 2, background: 'var(--c-surface-2)', padding: '6px 8px', fontWeight: 500,
  },
  '& .cfv-th-name': { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'normal', lineHeight: 1.3 },
  '& .cfv-th-meta': { display: 'block', fontSize: 11, color: 'var(--c-text-3)', fontWeight: 400, whiteSpace: 'nowrap' },
  '& .cfv-req': { color: 'var(--c-danger-600)' },
  // The item column stays put while the values scroll sideways under it.
  '& .cfv-head': {
    position: 'sticky', left: 0, zIndex: 1, background: 'var(--c-surface)', width: 280, minWidth: 280, maxWidth: 280,
    padding: '4px 10px', fontWeight: 400, boxShadow: '1px 0 0 var(--c-border)',
  },
  '& thead .cfv-head': { zIndex: 3, background: 'var(--c-surface-2)', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' },
  '@media (max-width: 600px)': { '& .cfv-head': { width: 150, minWidth: 150, maxWidth: 150 } },
  '& .cfv-code': { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 12, overflowWrap: 'anywhere', lineHeight: 1.35 },
  '& .cfv-code a': { color: 'inherit', textDecoration: 'none' },
  '& .cfv-code a:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' },
  '& .cfv-sub': { display: 'block', fontSize: 12, color: 'var(--c-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  '& .cfv-flags': { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 2 },
  '& .cfv-flag-gap': { fontSize: 11, fontWeight: 500, color: 'var(--c-danger-800)' },
  '& .cfv-flag-ro': { fontSize: 11, color: 'var(--c-text-3)' },
  '& tbody tr:hover > td, & tbody tr:hover > th': { background: 'var(--c-surface-2)' },
  '& tr.cfv-row-problem > th': { boxShadow: 'inset 3px 0 0 var(--c-danger-600), 1px 0 0 var(--c-border)' },
  '& td.cfv-cell': { position: 'relative', height: 36 },
  '& .cfv-in': {
    boxSizing: 'border-box', width: '100%', height: 36, border: 0, margin: 0, padding: '0 8px', background: 'transparent', color: 'inherit',
    font: 'inherit', fontSize: 13, outline: 'none', borderRadius: 0,
  },
  '& select.cfv-in': { cursor: 'pointer', paddingRight: 4 },
  '& .cfv-in.cfv-num': { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  '& .cfv-in:focus': { boxShadow: 'inset 0 0 0 2px var(--c-primary-500)', background: 'var(--c-surface)' },
  '& .cfv-in:disabled': { opacity: 0.6, cursor: 'progress' },
  '& .cfv-in::placeholder': { color: 'var(--c-text-3)', opacity: 1 },
  // A gap: tinted, marked on its edge, and saying "Required" in words.
  '& td.cfv-missing': { background: 'var(--c-danger-50)', boxShadow: 'inset 3px 0 0 var(--c-danger-600)' },
  '& td.cfv-missing .cfv-in::placeholder': { color: 'var(--c-danger-800)' },
  '& tbody tr:hover > td.cfv-missing': { background: 'var(--c-danger-50)' },
  // Changed, not saved: tinted, with a corner mark — never colour alone.
  '& td.cfv-pending': { background: 'var(--c-warning-50)' },
  '& tbody tr:hover > td.cfv-pending': { background: 'var(--c-warning-50)' },
  '& td.cfv-pending::after': {
    content: '""', position: 'absolute', top: 0, right: 0, width: 0, height: 0, pointerEvents: 'none',
    borderStyle: 'solid', borderWidth: '0 8px 8px 0', borderColor: 'transparent var(--c-warning-600) transparent transparent',
  },
  '& td.cfv-problem': { boxShadow: 'inset 0 0 0 2px var(--c-danger-600)' },
  '& td.cfv-ro': { padding: '0 8px', color: 'var(--c-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220, cursor: 'default' },
  '& td.cfv-ro.cfv-bad': { color: 'var(--c-danger-800)' },
  '& .cfv-gap-text': { color: 'var(--c-danger-800)', fontSize: 12 },
  '& td.cfv-na': { background: 'var(--c-surface-2)', color: 'var(--c-text-3)', textAlign: 'center' },
});
