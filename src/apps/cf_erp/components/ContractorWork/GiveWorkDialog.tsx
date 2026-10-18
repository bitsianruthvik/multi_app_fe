import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { CfApiError } from '../../api/client';
import {
  createWorkOrder, getContractorGrid, previewWorkOrder, type ContractorGrid, type CreatePlan, type GridRow, type WoDetail,
} from '../../api/contractorWorkOrders';
import { useFullScreen } from '../../hooks/useFullScreen';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { rupeeText } from '../../lib/money';
import {
  cellKey, filterRows, prefillRates, selectionSummary, splitKey, toggleBlock, toggleCell, tonnesText,
} from '../../lib/contractorWorkOrders';
import { DialogCloseButton } from '../FormDialog';
import { FullScreenToggle } from '../FullScreen';
import { ErrorNotice, Mono } from '../ui';

/**
 * GIVE WORK TO A CONTRACTOR (Step 6): the production order's BOM rows × operations. Click a cell to pick it, a row's
 * name for its whole row, an operation's head for its column, Shift-click for a block; arrows move, Space picks. The
 * picks stay through scrolling and the filter until Clear. On the right: the contractor, each operation's tonnes and its
 * rate per tonne (prefilled from the contractor's last work order) → "Raise contractor PO" (Ctrl+Enter). The PO goes
 * to Management; once approved the work order is issued (Accounts › Work orders).
 */
export function GiveWorkDialog({ open, productionOrderId, onClose, onMade }: {
  open: boolean; productionOrderId: number; onClose: () => void; onMade: (wo: WoDetail) => void;
}) {
  const fs = useFullScreen('contractor-give-work');
  const [grid, setGrid] = useState<ContractorGrid | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [contractorId, setContractorId] = useState<number | null>(null);
  const [typedRates, setTypedRates] = useState<Record<string, string>>({});
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<CreatePlan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGrid(null); setError(null); setSel(new Set()); setFilter(''); setPlan(null); setTypedRates({}); setDueDate(''); setNotes('');
    getContractorGrid(productionOrderId).then((g) => { setGrid(g); setContractorId((id) => id ?? g.contractors[0]?.id ?? null); })
      .catch((e) => setError(e as CfApiError));
  }, [open, productionOrderId]);

  const rows = useMemo(() => filterRows(grid?.rows ?? [], filter), [grid, filter]);
  const ops = useMemo(() => grid?.operations ?? [], [grid]);
  const summary = useMemo(() => selectionSummary(grid, sel), [grid, sel]);
  const opIds = summary.map((s) => s.operation.id);
  const rates = prefillRates(grid, contractorId, typedRates, opIds);
  const ratesKey = JSON.stringify(rates);
  const selKey = [...sel].sort().join(',');

  // The live check (dry run) whenever the picks, contractor or rates change.
  useEffect(() => {
    if (!open || !grid || !sel.size || !contractorId) { setPlan(null); return undefined; }
    let alive = true;
    const t = window.setTimeout(() => {
      previewWorkOrder(productionOrderId, body())
        .then((p) => { if (alive) setPlan(p); })
        .catch((e) => { if (alive) setError(e as CfApiError); });
    }, 300);
    return () => { alive = false; window.clearTimeout(t); };
    // body() reads the same state the key strings stand for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grid, selKey, contractorId, ratesKey, dueDate]);

  function body() {
    return {
      contractorId: contractorId as number,
      cells: [...sel].map((k) => splitKey(k)),
      rates: Object.fromEntries(Object.entries(rates).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      dueDate: dueDate || null, notes: notes || null,
    };
  }
  const blocked = !sel.size ? 'Pick the cells to give.' : !contractorId ? 'Choose the contractor.'
    : !plan ? 'Checking…' : plan.problems.length ? plan.problems[0] : null;
  const make = async () => {
    if (blocked || busy) return;
    setBusy(true); setError(null);
    try {
      const wo = await createWorkOrder(productionOrderId, body());
      invalidateNavCounts();
      onMade(wo);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };

  const clickCell = (ri: number, ci: number, shift: boolean) => {
    const row = rows[ri];
    const op = ops[ci];
    if (!row || !op) return;
    setFocus({ r: ri, c: ci });
    if (shift && anchor) {
      const [r0, r1] = [Math.min(anchor.r, ri), Math.max(anchor.r, ri)];
      const [c0, c1] = [Math.min(anchor.c, ci), Math.max(anchor.c, ci)];
      setSel((s) => toggleBlock(s, rows.slice(r0, r1 + 1), ops.slice(c0, c1 + 1).map((o) => o.id)));
      return;
    }
    setAnchor({ r: ri, c: ci });
    setSel((s) => toggleCell(s, row, op.id));
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void make(); return; }
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const move = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
    if (move) {
      e.preventDefault();
      setFocus((f) => ({ r: Math.max(0, Math.min(rows.length - 1, f.r + move[0])), c: Math.max(0, Math.min(ops.length - 1, f.c + move[1])) }));
    } else if (e.key === ' ') {
      e.preventDefault();
      clickCell(focus.r, focus.c, e.shiftKey);
    }
  };
  const colorOf = useMemo(() => {
    const ids = [...new Set((grid?.workOrders ?? []).map((w) => w.contractor.id))];
    const tints = ['#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff3e0', '#fce4ec', '#e0f7fa'];
    return (id: number) => tints[ids.indexOf(id) % tints.length];
  }, [grid]);

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xl" fullWidth fullScreen={fs.on} data-testid="give-work-dialog" onKeyDown={onKey}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          Give work to a contractor{grid ? ` — ${grid.productionOrder.code}` : ''}
          <Box sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.5 }}>
            Pick BOM rows × operations. Click a row&rsquo;s name for the whole row, an operation for its column, Shift-click for a block, arrows and Space from the keyboard.
          </Box>
        </Box>
        <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
        <DialogCloseButton onClose={onClose} disabled={busy} />
      </DialogTitle>
      <DialogContent>
        <ErrorNotice error={error} />
        {grid?.why && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>{grid.why}</Typography>}
        {!grid && !error && <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={22} /></Box>}
        {grid && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 2, alignItems: 'start' }}>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                <TextField size="small" placeholder="Filter rows" value={filter} onChange={(e) => setFilter(e.target.value)} inputProps={{ 'aria-label': 'Filter rows', 'data-testid': 'give-filter' }} />
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }} data-testid="give-picked">{sel.size} cell{sel.size === 1 ? '' : 's'} picked{filter && rows.length < grid.rows.length ? ` · ${grid.rows.length - rows.length} rows hidden by the filter (picks kept)` : ''}</Typography>
                {sel.size > 0 && <Button size="small" onClick={() => setSel(new Set())} data-testid="give-clear">Clear</Button>}
              </Box>
              <Box sx={{ overflow: 'auto', maxHeight: fs.on ? 'calc(100vh - 260px)' : '60vh', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }} tabIndex={0} data-testid="give-grid">
                <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%', '& td, & th': { borderBottom: '1px solid var(--c-divider)', px: 1, py: 0.5, whiteSpace: 'nowrap' } }}>
                  <thead>
                    <tr>
                      <Box component="th" sx={{ position: 'sticky', top: 0, left: 0, zIndex: 2, background: 'var(--c-surface-2)', textAlign: 'left' }}>Row</Box>
                      <Box component="th" sx={{ position: 'sticky', top: 0, background: 'var(--c-surface-2)', textAlign: 'right' }}>Qty</Box>
                      <Box component="th" sx={{ position: 'sticky', top: 0, background: 'var(--c-surface-2)', textAlign: 'right' }}>Tonnes</Box>
                      {ops.map((o) => (
                        <Box component="th" key={o.id} title={`Pick every free ${o.name} cell shown`} data-testid="give-col"
                          onClick={() => setSel((s) => toggleBlock(s, rows, [o.id]))}
                          sx={{ position: 'sticky', top: 0, background: 'var(--c-surface-2)', cursor: 'pointer', '&:hover': { color: 'var(--c-primary-700)' } }}>{o.name}</Box>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: GridRow, ri) => (
                      <tr key={r.key} data-testid="give-row" data-row={r.key}>
                        <Box component="td" onClick={() => setSel((s) => toggleBlock(s, [r], ops.map((o) => o.id)))} title="Pick the whole row"
                          sx={{ position: 'sticky', left: 0, background: 'var(--c-surface)', cursor: 'pointer', pl: `${8 + Math.min(r.depth, 8) * 14}px !important` }}>
                          {r.code ? <Mono>{r.code}</Mono> : r.name}
                        </Box>
                        <Box component="td" sx={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.quantity}</Box>
                        <Box component="td" sx={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.tonnes == null ? 'var(--c-text-3)' : undefined }} title={r.tonnes == null ? 'No weight yet' : `${r.unitKg} kg each`}>{tonnesText(r.tonnes)}</Box>
                        {ops.map((o, ci) => {
                          const cl = r.cells[o.id];
                          const picked = sel.has(cellKey(r.key, o.id));
                          const focused = focus.r === ri && focus.c === ci;
                          if (!cl) return <Box component="td" key={o.id} sx={{ background: 'var(--c-surface-2)' }} />;
                          return (
                            <Box component="td" key={o.id} data-testid="give-cell" data-cell={cellKey(r.key, o.id)} data-picked={picked ? '1' : '0'}
                              title={cl.why ?? (picked ? 'Picked — click to drop' : 'Click to pick')}
                              onClick={(e) => clickCell(ri, ci, e.shiftKey)}
                              sx={{
                                cursor: cl.editable ? 'pointer' : 'default', textAlign: 'center', minWidth: 90,
                                background: picked ? 'var(--c-primary-100, #d6e4ff)' : cl.workOrder ? colorOf(cl.workOrder.contractor.id) : undefined,
                                outline: focused ? '2px solid var(--c-primary-500)' : undefined, outlineOffset: -2,
                                color: cl.started ? 'var(--c-text-3)' : undefined,
                              }}>
                              {cl.workOrder ? <span>{cl.workOrder.contractor.name} <Mono muted>({cl.workOrder.code})</Mono></span> : cl.started ? 'in-house' : picked ? '✓' : ''}
                            </Box>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gap: 1.5 }} data-testid="give-side">
              <TextField select label="Contractor" value={contractorId ?? ''} onChange={(e) => { setContractorId(Number(e.target.value)); setTypedRates({}); }}
                inputProps={{ 'data-testid': 'give-contractor' }} helperText={grid.contractors.length ? 'Parties with the Subcontractor role.' : 'No contractor yet — add one under Production › Contractors.'}>
                {grid.contractors.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
              {summary.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Pick cells on the left. One PO line is made per operation, paid by the tonne.</Typography>}
              {summary.map((s) => (
                <Box key={s.operation.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px', gap: 1, alignItems: 'center' }} data-testid="give-op">
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{s.operation.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: s.unweighed ? 'var(--c-danger-700)' : 'var(--c-text-2)' }}>
                      {s.rows} row{s.rows === 1 ? '' : 's'} · {tonnesText(s.tonnes)}{s.unweighed ? ` · ${s.unweighed} with no weight` : ''}
                      {plan?.lines.find((l) => l.operation.id === s.operation.id)?.amount != null ? ` · ${rupeeText(plan.lines.find((l) => l.operation.id === s.operation.id)!.amount)}` : ''}
                    </Typography>
                  </Box>
                  <TextField size="small" label="₹ / t" value={rates[s.operation.id] ?? ''} onChange={(e) => setTypedRates((t) => ({ ...t, [s.operation.id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                    inputProps={{ inputMode: 'decimal', 'data-testid': 'give-rate', style: { fontFamily: 'var(--font-mono)', textAlign: 'right' } }} />
                </Box>
              ))}
              <TextField type="date" size="small" label="Due by (optional)" value={dueDate} onChange={(e) => setDueDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField size="small" label="Note to the contractor (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
              {plan && (
                <Box sx={{ p: 1.25, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)' }} data-testid="give-total">
                  <Typography sx={{ fontSize: 13 }}>{tonnesText(plan.tonnes)} · <Mono>{rupeeText(plan.amount, 2)}</Mono> before tax</Typography>
                  {plan.problems.map((p) => <Typography key={p} sx={{ fontSize: 12.5, color: 'var(--c-danger-700)', mt: 0.5 }}>{p}</Typography>)}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {blocked && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mr: 'auto', pl: 1 }} data-testid="give-blocked">{blocked}</Typography>}
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void make()} disabled={busy || !!blocked} data-testid="give-save"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Raising…' : 'Raise contractor PO (Ctrl+Enter)'}</Button>
      </DialogActions>
    </Dialog>
  );
}
