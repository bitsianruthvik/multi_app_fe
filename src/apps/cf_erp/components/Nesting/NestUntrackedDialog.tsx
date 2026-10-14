import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Tooltip, Typography,
} from '@mui/material';
import UndoRounded from '@mui/icons-material/UndoRounded';
import { CfApiError } from '../../api/client';
import { getUntracked, markUntracked, unmarkUntracked, type UntrackedPiece, type UntrackedState } from '../../api/nesting';
import { cutPieceNamer, kg, untrackedLine, untrackedRequest } from '../../lib/nesting';
import { rupeeText } from '../../lib/money';
import { Mono } from '../ui';

/**
 * CUT FROM UNTRACKED OFFCUTS (init.sql §61, 2026-10-14).
 *
 * What the nesting files leave over is mostly packings and small plates the shop cuts from loose
 * offcuts in the yard that are not in the system. This dialog lists the left-over cut pieces —
 * short names (size + part), how many, kg and cost at the plate rate — all ticked; saving marks
 * them. A marked piece is not left over any more: it needs no plate and no heat number, our
 * nesting never places it, and its steel is charged at the plate rate per kg. It adds no plate and
 * no waste, so the plan shows it on a line of its own, with Undo (UntrackedStrip).
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The server's refusal, in its words: the message, then every problem it listed. */
function ErrorBlock({ error }: { error: CfApiError }) {
  return (
    <Alert severity="error" data-testid="untracked-error" sx={{ overflowWrap: 'anywhere' }}>
      <Box sx={{ fontWeight: 600 }}>{error.message}</Box>
      {error.problems.length > 0 && (
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3 }}>
          {error.problems.map((p) => <li key={p}>{p}</li>)}
        </Box>
      )}
    </Alert>
  );
}

/** "₹62 / kg (list price of PL-…)" — the rate a piece is charged, or why there is none. */
const rateWords = (r: UntrackedPiece) => (r.rate
  ? `${rupeeText(r.rate.perKg, 2)} / kg — ${r.rate.basis} of ${r.ratePlate?.code ?? 'the plate'}`
  : r.ratePlate ? `${r.ratePlate.code ?? 'The plate'} has no price yet` : 'No catalog plate of this steel');

export function NestUntrackedDialog({ open, orderId, lineId, onClose, onSaved }: {
  open: boolean;
  orderId: number;
  lineId: number;
  onClose: () => void;
  /** After a save: the new state (the plan reloads). */
  onSaved: (out: UntrackedState) => void;
}) {
  const [state, setState] = useState<UntrackedState | null>(null);
  const [loadError, setLoadError] = useState<CfApiError | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setState(null); setLoadError(null); setError(null);
    getUntracked(orderId, lineId).then((s) => {
      if (!alive) return;
      setState(s);
      // All ticked by default.
      setTicked(new Set(s.leftOver.map((r) => r.cutPlateId)));
    }).catch((e) => { if (alive) setLoadError(e as CfApiError); });
    return () => { alive = false; };
  }, [open, orderId, lineId]);

  const rows = useMemo(() => state?.leftOver ?? [], [state]);
  const nameOf = useMemo(() => cutPieceNamer(
    [...rows, ...(state?.marked ?? [])].map((r) => r.code ?? ''),
    [...rows, ...(state?.marked ?? [])].map((r) => ({ code: r.code ?? '', parts: r.parts })),
  ), [rows, state]);
  const chosen = rows.filter((r) => ticked.has(r.cutPlateId));
  const sum = {
    pieces: chosen.reduce((a, r) => a + r.qty, 0),
    kg: chosen.reduce((a, r) => a + (r.kg ?? 0), 0),
    cost: chosen.reduce((a, r) => a + (r.cost ?? 0), 0),
    uncosted: chosen.reduce((a, r) => a + (r.cost == null ? r.qty : 0), 0),
  };
  const every = chosen.length === rows.length;

  const toggle = (id: number, on: boolean) => setTicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const save = async () => {
    setBusy(true); setError(null);
    try {
      // Every piece ticked = "the rest": the server marks whatever is left over, as it is now.
      const out = await markUntracked(orderId, lineId, every ? 'all' : untrackedRequest(rows, ticked));
      onSaved(out);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth data-testid="untracked-dialog" aria-labelledby="untracked-title">
      <DialogTitle id="untracked-title">Mark the rest as cut from offcuts</DialogTitle>
      <DialogContent dividers sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5 }}>
            These pieces are not in the nesting files. Mark the ones the shop cuts from loose offcuts in the yard.
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3, fontSize: 13, color: 'var(--c-text-2)' }}>
            <li>They are not nested and need no plate.</li>
            <li>They need no heat number. Release does not wait for them.</li>
            <li>Their steel is charged at the plate rate per kg.</li>
            <li>You can undo this.</li>
          </Box>
          {loadError && <ErrorBlock error={loadError} />}
          {!state && !loadError && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', fontSize: 13 }}><CircularProgress size={16} /> Reading what is left over…</Box>}
          {state && !state.canMark && <Alert severity="warning" data-testid="untracked-readonly">{state.readOnlyReason ?? 'This line cannot be changed now.'}</Alert>}
          {state && rows.length === 0 && <Typography data-testid="untracked-nothing" sx={{ fontSize: 13.5 }}>Nothing is left over.</Typography>}
          {state && rows.length > 0 && (
            <>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" data-testid="untracked-all" disabled={busy} onClick={() => setTicked(new Set(rows.map((r) => r.cutPlateId)))}>Select all</Button>
                <Button size="small" data-testid="untracked-none" disabled={busy} onClick={() => setTicked(new Set())}>Select none</Button>
              </Box>
              <Box sx={{ overflowX: 'auto', minWidth: 0 }}>
                <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, '& th': { textAlign: 'left', fontWeight: 600, color: 'var(--c-text-2)' }, '& th, & td': { p: 0.75, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'middle' }, '& .num': { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}>
                  <thead>
                    <tr>
                      <th><span style={{ position: 'absolute', left: -9999 }}>Mark</span></th>
                      <th>Cut piece</th><th className="num">Pieces</th><th className="num">kg</th><th className="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const n = nameOf(r.code ?? '');
                      return (
                        <tr key={r.cutPlateId} data-testid="untracked-row" data-id={r.cutPlateId}>
                          <td><Checkbox size="small" checked={ticked.has(r.cutPlateId)} disabled={busy || !state.canMark} onChange={(e) => toggle(r.cutPlateId, e.target.checked)} slotProps={{ input: { 'aria-label': `Mark ${n.short}` } }} /></td>
                          <td style={{ overflowWrap: 'anywhere' }}>
                            <Tooltip title={n.title}><span><Mono>{n.short}</Mono>{n.part && <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` · ${n.part}`}</Box>}</span></Tooltip>
                            {r.heldBack && <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}> · held back</Box>}
                          </td>
                          <td className="num">{r.qty}</td>
                          <td className="num">{kg(r.kg)}</td>
                          <td className="num"><Tooltip title={rateWords(r)}><span>{r.cost == null ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>not costed</Box> : rupeeText(r.cost)}</span></Tooltip></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Box>
              </Box>
              <Typography data-testid="untracked-sum" sx={{ fontSize: 13.5, fontWeight: 600 }}>
                {`${plural(sum.pieces, 'piece', 'pieces')} · ${kg(sum.kg)} kg · ${rupeeText(sum.cost)} at the plate rate`}
                {sum.uncosted > 0 && <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-2)' }}>{` · ${plural(sum.uncosted, 'piece has', 'pieces have')} no plate rate yet`}</Box>}
              </Typography>
            </>
          )}
          {error && <ErrorBlock error={error} />}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" data-testid="untracked-save" onClick={save} disabled={busy || !state?.canMark || chosen.length === 0}
          startIcon={busy ? <CircularProgress size={15} color="inherit" /> : undefined}>
          {`Mark ${plural(sum.pieces, 'piece', 'pieces')}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The line on the plan: "n pieces · x kg cut from untracked offcuts", with Undo. On no plate, so
 * apart from every plate and waste figure — nobody should take the line for efficient.
 */
export function UntrackedStrip({ summary, orderId, lineId, canUndo, onUndone }: {
  summary: { pieces: number; kg: number } | null | undefined;
  orderId: number;
  lineId: number;
  /** The sales-order grant, and the line open to nesting. */
  canUndo: boolean;
  onUndone: (out: UntrackedState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const words = untrackedLine(summary);
  if (!words) return null;
  const undo = async () => {
    setBusy(true); setError(null);
    try { onUndone(await unmarkUntracked(orderId, lineId)); } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  return (
    <Box data-testid="untracked-strip" sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
        <span data-testid="untracked-line">{words}</span>
        {canUndo && (
          <Button size="small" data-testid="untracked-undo" onClick={undo} disabled={busy}
            startIcon={busy ? <CircularProgress size={13} color="inherit" /> : <UndoRounded fontSize="small" />}>
            Undo
          </Button>
        )}
      </Box>
      {error && <ErrorBlock error={error} />}
    </Box>
  );
}
