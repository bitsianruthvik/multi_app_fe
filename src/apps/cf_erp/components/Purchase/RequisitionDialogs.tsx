import { useEffect, useMemo, useState } from 'react';
import { Box, Button, FormControlLabel, IconButton, MenuItem, Switch, TextField, Tooltip, Typography } from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import { CfApiError } from '../../api/client';
import {
  checkStock, holdStock, makePurchaseOrders, releaseExcess, releaseExcessPlan,
  type MadePos, type ReleaseExcess, type ReqLine, type ReqStockCheck, type Requisition,
} from '../../api/requisitions';
import { assigned, draftProblems, draftsBody, initialDrafts, leftOver, undatedCount, type OpenById, type PoDraft } from '../../lib/requisition';
import { qtyText } from '../../lib/inventory';
import { FormDialog } from '../FormDialog';
import { PartyPicker } from '../ServerPicker';
import { ErrorNotice, Mono, SkeletonBlock } from '../ui';

const itemLabel = (i: { code: string | null; name: string }) => i.code ?? i.name;
const numOrNaN = (v: string) => (v.trim() === '' ? 0 : Number(v));
const miniInput = { width: 96, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, p: 0.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)' } as const;

// ───────────────────────────────── Check stock ─────────────────────────────────

/**
 * Check stock: a dry run first. It shows what would be held, with free stock exactly as the server counts it — stock
 * held or reserved for another order is simply not there. Nothing is held until "Hold".
 * `onlyLineIds` narrows it to one row; without it every material that still has something open is listed.
 */
export function StockCheckDialog({ open, requisitions, onlyLineIds, onClose, onHeld }: {
  open: boolean;
  requisitions: { id: number; code: string }[];
  onlyLineIds?: number[];
  onClose: () => void;
  onHeld: (done: Requisition[], held: number) => void;
}) {
  const [checks, setChecks] = useState<ReqStockCheck[] | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const ids = requisitions.map((r) => r.id).join(',');

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setChecks(null); setError(null); setTyped({});
    Promise.all(requisitions.map((r) => checkStock(r.id, onlyLineIds)))
      .then((rs) => {
        if (!alive) return;
        setChecks(rs);
        const t: Record<string, string> = {};
        for (const c of rs) for (const l of c.lines) t[`${c.requisition.id}:${l.lineId}`] = l.proposeHold > 0 ? String(l.proposeHold) : '';
        setTyped(t);
      })
      .catch((e) => { if (alive) setError(e instanceof CfApiError ? e : new CfApiError(0, 'Stock could not be checked.')); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ids]);

  const rows = useMemo(() => (checks ?? []).flatMap((c) => c.lines
    .filter((l) => (onlyLineIds ? onlyLineIds.includes(l.lineId) : l.open > 0))
    .map((l) => ({ req: c.requisition, l, canApply: c.canApply }))), [checks, onlyLineIds]);

  const problemOf = (reqId: number, l: ReqStockCheck['lines'][number]) => {
    const q = numOrNaN(typed[`${reqId}:${l.lineId}`] ?? '');
    if (Number.isNaN(q) || q < 0) return 'Enter a quantity.';
    if (q > l.freeInStock + 1e-9) return `Only ${qtyText(l.freeInStock)} is free for this order.`;
    if (q > l.room + 1e-9) return `The line needs only ${qtyText(l.room)} more.`;
    return null;
  };
  const wanted = rows.filter((r) => numOrNaN(typed[`${r.req.id}:${r.l.lineId}`] ?? '') > 0);
  const anyProblem = rows.some((r) => problemOf(r.req.id, r.l));

  const hold = async () => {
    const done: Requisition[] = [];
    let held = 0;
    for (const req of requisitions) {
      const lines = wanted.filter((w) => w.req.id === req.id).map((w) => ({ lineId: w.l.lineId, hold: Number(typed[`${req.id}:${w.l.lineId}`]) }));
      if (!lines.length) continue;
      const r = await holdStock(req.id, lines);
      done.push(r.requisition);
      held += r.held.length;
    }
    onHeld(done, held);
  };

  const sentence = checks && checks.length === 1 ? checks[0].sentence : null;
  return (
    <FormDialog open={open} title="Check stock" maxWidth="md" onClose={onClose} onSubmit={hold} enterSubmits={false}
      submitLabel="Hold" busyLabel="Holding…" submitDisabled={!checks || wanted.length === 0 || anyProblem}
      subtitle="This is a look, not a booking. Stock is held for the order only when you press Hold. Stock held for another order is not counted.">
      <ErrorNotice error={error} />
      {!checks && !error && <SkeletonBlock h={100} r={8} />}
      {checks && sentence && <Typography data-testid="stock-check-sentence" sx={{ fontSize: 13.5 }}>{sentence}</Typography>}
      {checks && rows.length === 0 && <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing is open here, so there is nothing to hold.</Typography>}
      {checks && rows.length > 0 && (
        <Box component="table" data-testid="stock-check-rows" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, '& td, & th': { py: 0.75, px: 0.75, borderBottom: '1px solid var(--c-divider)', textAlign: 'left', verticalAlign: 'middle' }, '& th': { color: 'var(--c-text-3)', fontWeight: 500 } }}>
          <thead><tr><th>Material</th><th style={{ textAlign: 'right' }}>Open</th><th style={{ textAlign: 'right' }}>Free for this order</th><th style={{ width: 130 }}>Hold</th></tr></thead>
          <tbody>
            {rows.map(({ req, l, canApply }) => {
              const key = `${req.id}:${l.lineId}`;
              const problem = problemOf(req.id, l);
              return (
                <tr key={key} data-testid="stock-check-row" data-line={l.lineId}>
                  <td><Mono>{itemLabel(l.item)}</Mono>{requisitions.length > 1 && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{req.code}</Box>}</td>
                  <td style={{ textAlign: 'right' }}><Mono>{qtyText(l.open)}</Mono> <Mono muted>{l.item.uom}</Mono></td>
                  <td style={{ textAlign: 'right' }}><Mono muted={l.freeInStock <= 0}>{qtyText(l.freeInStock)}</Mono></td>
                  <td>
                    <Box component="input" data-testid="hold-input" value={typed[key] ?? ''} disabled={!canApply || l.freeInStock <= 0} inputMode="decimal" aria-label={`Hold for ${itemLabel(l.item)}`}
                      aria-invalid={!!problem} onChange={(e) => setTyped({ ...typed, [key]: e.target.value })}
                      sx={{ ...miniInput, border: `1px solid ${problem ? 'var(--c-danger-500)' : 'var(--c-border)'}` }} />
                    {problem && <Box sx={{ fontSize: 11.5, color: 'var(--c-danger-700)' }}>{problem}</Box>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Box>
      )}
    </FormDialog>
  );
}

// ─────────────────────────────────── Skip ────────────────────────────────────

/** Skip buying: the material waits for stock. Says what that means before it is done; undoable. */
export function SkipDialog({ open, count, onClose, onSkip }: {
  open: boolean; count: number; onClose: () => void; onSkip: (note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setNote(''); }, [open]);
  return (
    <FormDialog open={open} title={count === 1 ? 'Skip buying this material?' : `Skip buying ${count} materials?`} maxWidth="sm" onClose={onClose} onSubmit={() => onSkip(note.trim())}
      submitLabel="Skip" busyLabel="Skipping…" enterSubmits={false}
      subtitle="Nothing is ordered and no stock is held. The work that needs it waits until the stock is in the store, and is blocked again if another order takes that stock. You can undo this.">
      <TextField label="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} fullWidth inputProps={{ 'aria-label': 'Why skip' }} helperText="For example: free-issue by the client" />
    </FormDialog>
  );
}

// ─────────────────────────────── Release excess ───────────────────────────────

/** More is held or coming than the line needs now. Shows what would be let go, then lets it go. */
export function ExcessDialog({ open, line, onClose, onDone }: {
  open: boolean; line: ReqLine | null; onClose: () => void; onDone: (r: Requisition | null) => void;
}) {
  const [plan, setPlan] = useState<ReleaseExcess | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => {
    if (!open || !line) return undefined;
    let alive = true;
    setPlan(null); setError(null);
    releaseExcessPlan(line.id).then((p) => { if (alive) setPlan(p); }).catch((e) => { if (alive) setError(e instanceof CfApiError ? e : new CfApiError(0, 'Could not look at the excess.')); });
    return () => { alive = false; };
  }, [open, line?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FormDialog open={open} title={line ? `Let the excess of ${itemLabel(line.item)} go?` : 'Let the excess go?'} maxWidth="sm" onClose={onClose}
      onSubmit={async () => { if (line) { const r = await releaseExcess(line.id); onDone(r.requisition ?? null); } }}
      submitLabel="Let it go" busyLabel="Letting go…" enterSubmits={false} submitDisabled={!plan || plan.excess <= 0}
      subtitle="The line needs less than is held or coming. What you let go becomes free for other jobs.">
      <ErrorNotice error={error} />
      {!plan && !error && <SkeletonBlock h={60} r={8} />}
      {plan && plan.excess <= 0 && <Typography sx={{ fontSize: 13.5 }}>Nothing is over now.</Typography>}
      {plan && plan.excess > 0 && (
        <Box data-testid="excess-plan" sx={{ display: 'grid', gap: 0.75 }}>
          <Typography sx={{ fontSize: 13.5 }}>The line needs {qtyText(plan.need)} {plan.item.uom}; {qtyText(plan.excess)} is over.</Typography>
          {plan.plan.map((p) => <Typography key={`${p.kind}${p.id}`} sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{p.text}</Typography>)}
        </Box>
      )}
    </FormDialog>
  );
}

// ───────────────────────────────────── Buy… ──────────────────────────────────────

type BuyLine = { req: Requisition; line: ReqLine };

/**
 * Buy…: make purchase orders for the open part of chosen materials. Start with one order for everything; reduce a
 * quantity and "Add another purchase order" to split a material over several suppliers, each with its own receiving
 * date per line. A date left blank is said so: production waits for it.
 */
export function BuyDialog({ open, lines, onClose, onDone }: {
  open: boolean; lines: BuyLine[]; onClose: () => void; onDone: (r: MadePos) => void;
}) {
  const byId = useMemo(() => new Map(lines.map((l) => [l.line.id, l])), [lines]);
  const open_: OpenById = useMemo(() => Object.fromEntries(lines.map((l) => [l.line.id, l.line.cover.open])), [lines]);
  const [drafts, setDrafts] = useState<PoDraft[]>([]);
  useEffect(() => { if (open) setDrafts(initialDrafts(lines.map((l) => l.line))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (id: number) => { const b = byId.get(id); return b ? `${b.req.order.code} line ${b.req.line.lineNo} · ${itemLabel(b.line.item)}` : `line ${id}`; };
  const problems = draftProblems(drafts, open_, label);
  const used = assigned(drafts);
  const setDraft = (key: number, patch: Partial<PoDraft>) => setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const setLine = (key: number, prLineId: number, patch: Partial<{ quantity: string; date: string }>) =>
    setDrafts((all) => all.map((d) => (d.key === key ? { ...d, lines: d.lines.map((l) => (l.prLineId === prLineId ? { ...l, ...patch } : l)) } : d)));
  const addPo = () => setDrafts((all) => {
    const rest = lines.filter((l) => leftOver(open_, all, l.line.id) > 0);
    return [...all, { key: Math.max(0, ...all.map((d) => d.key)) + 1, supplier: null, place: true, lines: rest.map((l) => ({ prLineId: l.line.id, quantity: String(leftOver(open_, all, l.line.id)), date: '' })) }];
  });
  const addMaterial = (key: number, prLineId: number) => setDrafts((all) => all.map((d) => (d.key === key
    ? { ...d, lines: [...d.lines, { prLineId, quantity: String(leftOver(open_, all, prLineId)), date: '' }] } : d)));
  const noDate = undatedCount(drafts);

  const save = async () => { onDone(await makePurchaseOrders(draftsBody(drafts))); };
  const stillOpen = lines.filter((l) => leftOver(open_, drafts, l.line.id) > 1e-9);

  return (
    <FormDialog open={open} title="Buy" maxWidth="md" onClose={onClose} onSubmit={save} enterSubmits={false}
      submitLabel={drafts.length === 1 ? 'Make the purchase order' : `Make ${drafts.length} purchase orders`} busyLabel="Making…"
      submitDisabled={drafts.length === 0 || problems.length > 0}
      subtitle="Choose the supplier and a receiving date for each line. To split a material, lower its quantity and add another purchase order.">
      {drafts.map((d, i) => {
        const free = lines.filter((l) => !d.lines.some((x) => x.prLineId === l.line.id) && leftOver(open_, drafts, l.line.id) > 1e-9);
        return (
          <Box key={d.key} data-testid="po-draft" sx={{ display: 'grid', gap: 1, p: 1.25, borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Purchase order {i + 1}</Typography>
              <Box sx={{ flex: '1 1 240px', minWidth: 200 }} data-testid="draft-supplier">
                <PartyPicker role="supplier" value={d.supplier} onChange={(p) => setDraft(d.key, { supplier: p })} label="Supplier" />
              </Box>
              <FormControlLabel control={<Switch size="small" checked={d.place} onChange={(e) => setDraft(d.key, { place: e.target.checked })} inputProps={{ 'aria-label': 'Place the order now' }} />}
                label={<Typography sx={{ fontSize: 12.5 }}>Place the order now</Typography>} />
              {drafts.length > 1 && (
                <Tooltip title="Take this purchase order out"><IconButton size="small" aria-label={`Remove purchase order ${i + 1}`} onClick={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
              )}
            </Box>
            {!d.place && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Not placed: it stays a request. Check stock, ask suppliers for quotes and place it from the purchase order.</Typography>}
            {d.lines.map((l) => {
              const b = byId.get(l.prLineId);
              return (
                <Box key={l.prLineId} data-testid="draft-line" data-line={l.prLineId} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 1.5, alignItems: 'center' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Mono>{b ? itemLabel(b.line.item) : l.prLineId}</Mono>
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }} noWrap>{b ? `${b.req.order.code} line ${b.req.line.lineNo} · open ${qtyText(b.line.cover.open)} ${b.line.item.uom}` : ''}</Typography>
                  </Box>
                  <Box component="input" data-testid="draft-qty" value={l.quantity} inputMode="decimal" aria-label={`Quantity of ${b ? itemLabel(b.line.item) : l.prLineId} on purchase order ${i + 1}`}
                    onChange={(e) => setLine(d.key, l.prLineId, { quantity: e.target.value })} sx={{ ...miniInput, border: '1px solid var(--c-border)' }} />
                  <Box component="input" data-testid="draft-date" type="date" value={l.date} aria-label={`Receiving date of ${b ? itemLabel(b.line.item) : l.prLineId} on purchase order ${i + 1}`}
                    onChange={(e) => setLine(d.key, l.prLineId, { date: e.target.value })}
                    sx={{ fontFamily: 'var(--font-mono)', fontSize: 13, p: 0.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)', border: `1px solid ${!l.date && d.place ? 'var(--c-warning-500)' : 'var(--c-border)'}` }} />
                  <Tooltip title="Take this line out"><IconButton size="small" aria-label={`Remove ${b ? itemLabel(b.line.item) : l.prLineId} from purchase order ${i + 1}`}
                    onClick={() => setDraft(d.key, { lines: d.lines.filter((x) => x.prLineId !== l.prLineId) })}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                </Box>
              );
            })}
            {free.length > 0 && (
              <TextField select size="small" label="Add a material" value="" onChange={(e) => addMaterial(d.key, Number(e.target.value))} sx={{ maxWidth: 360 }}>
                {free.map((l) => <MenuItem key={l.line.id} value={l.line.id}>{label(l.line.id)} — {qtyText(leftOver(open_, drafts, l.line.id))} {l.line.item.uom} left</MenuItem>)}
              </TextField>
            )}
          </Box>
        );
      })}
      <Box><Button size="small" startIcon={<AddRounded />} onClick={addPo} data-testid="add-po">Add another purchase order</Button></Box>
      <Box data-testid="buy-summary" sx={{ display: 'grid', gap: 0.5 }}>
        {stillOpen.length > 0 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            Not on any purchase order yet: {stillOpen.map((l) => `${itemLabel(l.line.item)} ${qtyText(leftOver(open_, drafts, l.line.id))} ${l.line.item.uom}`).join(', ')}. It stays open.
          </Typography>
        )}
        {noDate > 0 && <Typography data-testid="buy-nodate" sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>{noDate} {noDate === 1 ? 'line has' : 'lines have'} no receiving date. Production waits until a date is set.</Typography>}
        {problems.map((p) => <Typography key={p} sx={{ fontSize: 13, color: 'var(--c-danger-700)' }}>{p}</Typography>)}
        {Object.keys(used).length === 0 && drafts.length > 0 && problems.length === 0 && <Typography sx={{ fontSize: 13 }}>Add at least one line.</Typography>}
      </Box>
    </FormDialog>
  );
}
