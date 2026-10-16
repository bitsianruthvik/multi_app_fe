import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import { Link } from 'react-router-dom';
import { CfApiError } from '../../api/client';
import {
  approvePlateChange, directImpact, getLinePlateChanges, isRequested, rejectPlateChange, tickPlateChange, withdrawPlateChange,
  type LinePlateChanges, type PlateChangeFields, type PlateChangeImpact, type PlateChangeRequest, type PlateChangeRequested,
} from '../../api/plateChanges';
import {
  askedWords, checklistFacts, checklistProgress, metricRows, NEEDS_APPROVAL, plateLines, REASON_EXAMPLE, REASON_LABEL, statusBadge,
} from '../../lib/plateChange';
import { Badge, ErrorNotice, Mono } from '../ui';
import { DialogHeader } from '../FormDialog';
import { PromptDialog } from '../PromptDialog';
import { PlateChangeContext, usePlateChange, type PlateChangeApi, type Submit, type SubmitOptions } from './plateChangeContext';

/**
 * PLATE CHANGES AFTER A PURCHASE ORDER (init.sql §62, 2026-10-16).
 *
 * Once a PO covers a line, a change to its plates is a REQUEST the MD approves: the save asks why, the server
 * works the change out without saving it, and the impact sheet says what it would do — plates, steel, waste
 * (offcuts in it), cost, and what is on order. Before a PO, a save goes through as it always did and the sheet
 * shows what changed. While a request waits, the line's nesting is held.
 *
 *   PlateChangeProvider   on the Nesting screen: the line's gate, and `submit` every plate save goes through
 *   PlateChangesPanel     the line's requests, with approve / reject / withdraw and the buyer's checklist
 *   PlateChangeCard       one request (also on the Plate changes page)
 *   ImpactSheet           before / after / difference
 */

type Sheet = { mode: 'sent'; request: PlateChangeRequest } | { mode: 'saved'; impact: PlateChangeImpact; what: string };
interface Ask { what: string; send: (reason: string) => Promise<void>; cancel: () => void }

export function PlateChangeProvider({ orderId, lineId, children, onChanged }: { orderId: number; lineId: number; children: ReactNode; onChanged?: () => void }) {
  const [data, setData] = useState<LinePlateChanges | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reload = useCallback(() => {
    getLinePlateChanges(orderId, lineId).then((d) => { if (alive.current) setData(d); }).catch(() => undefined);
  }, [orderId, lineId]);
  useEffect(() => { reload(); }, [reload]);

  const submit: Submit = useCallback(<T,>(what: string, call: (f: PlateChangeFields) => Promise<T | PlateChangeRequested>, opts: SubmitOptions = {}) => new Promise<T | null>((resolve, reject) => {
    const sent = (out: T | PlateChangeRequested): boolean => {
      if (!isRequested(out)) return false;
      setSheet({ mode: 'sent', request: out.plateChange });
      reload(); opts.onSent?.();
      resolve(null);
      return true;
    };
    const viaReason = () => setAsk({
      what,
      send: async (reason) => {
        const out = await call({ reason });
        setAsk(null);
        if (!sent(out)) { reload(); resolve(out as T); }
      },
      cancel: () => { setAsk(null); resolve(null); },
    });
    const gate = data?.gate;
    if (gate?.needsApproval && !gate.held && !opts.tryFirst) { viaReason(); return; }
    (async () => {
      try {
        const out = await call(gate?.needsApproval || opts.impact === false ? {} : { impact: true });
        if (sent(out)) return;
        const imp = directImpact(out);
        if (imp) setSheet({ mode: 'saved', impact: imp, what });
        resolve(out as T);
      } catch (e) {
        // A PO arrived since the screen read the gate (or the server wants a reason for this one): ask, then send again.
        if ((e as CfApiError)?.code === 'PLATE_CHANGE_REASON') { reload(); viaReason(); } else reject(e);
      }
    })();
  }), [data, reload]);

  const changed = useCallback(() => { reload(); onChanged?.(); }, [reload, onChanged]);
  const api: PlateChangeApi = useMemo(() => ({ data, reload, changed, submit }), [data, reload, changed, submit]);
  return (
    <PlateChangeContext.Provider value={api}>
      {children}
      <ReasonDialog ask={ask} message={data?.gate.message ?? null} />
      <SheetDialog sheet={sheet} onClose={() => setSheet(null)} />
    </PlateChangeContext.Provider>
  );
}

/** "This change needs approval" — the reason, then Send for approval. */
function ReasonDialog({ ask, message }: { ask: Ask | null; message: string | null }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (ask) { setReason(''); setError(null); setBusy(false); } }, [ask]);
  const send = async () => {
    if (!ask) return;
    setBusy(true); setError(null);
    try { await ask.send(reason.trim()); } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, (e as Error)?.message ?? 'Could not send it.')); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!ask} onClose={busy ? undefined : ask?.cancel} maxWidth="sm" fullWidth data-testid="plate-change-reason">
      <DialogHeader title="This change needs approval" subtitle={ask?.what} onClose={() => ask?.cancel()} busy={busy} />
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Typography sx={{ fontSize: 13.5 }} data-testid="plate-change-why">{message ?? NEEDS_APPROVAL}</Typography>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nothing is saved until it is approved. You will see what the change does before the MD does.</Typography>
          <TextField label={REASON_LABEL} placeholder={REASON_EXAMPLE} value={reason} onChange={(e) => setReason(e.target.value)} fullWidth autoFocus multiline minRows={2}
            slotProps={{ htmlInput: { 'data-testid': 'plate-change-reason-input', maxLength: 1000 } }} />
          <ErrorNotice error={error} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => ask?.cancel()} disabled={busy}>Cancel</Button>
        <Button variant="contained" data-testid="plate-change-send" onClick={send} disabled={busy || !reason.trim()}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {busy ? 'Working it out…' : 'Send for approval'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** After a save: the request that was sent, or (no PO) what the save changed. */
function SheetDialog({ sheet, onClose }: { sheet: Sheet | null; onClose: () => void }) {
  const impact = sheet ? (sheet.mode === 'sent' ? sheet.request.impact : sheet.impact) : null;
  return (
    <Dialog open={!!sheet} onClose={onClose} maxWidth="md" fullWidth data-testid="plate-change-sheet">
      {sheet && (
        <>
          <DialogHeader
            title={sheet.mode === 'sent' ? <>Sent for approval · <Mono>{sheet.request.code}</Mono></> : 'Saved — what changed'}
            subtitle={sheet.mode === 'sent' ? 'Nothing is saved until it is approved. The line\'s nesting is held until then.' : `${sheet.what}. No purchase order covers this line yet, so it was saved straight away.`}
            onClose={onClose}
          />
          <DialogContent dividers>{impact ? <ImpactSheet impact={impact} /> : <Typography>No figures came back.</Typography>}</DialogContent>
          <DialogActions><Button variant="contained" onClick={onClose} data-testid="plate-change-sheet-close">Close</Button></DialogActions>
        </>
      )}
    </Dialog>
  );
}

const tableSx = {
  borderCollapse: 'collapse', width: '100%', fontSize: 13,
  '& th': { textAlign: 'left', fontWeight: 600, color: 'var(--c-text-2)', whiteSpace: 'nowrap' },
  '& th, & td': { p: 0.6, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'top' },
  '& .num': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
} as const;

/** The impact sheet: the sentence, the plates that change, before / after / difference, and what is on order. */
export function ImpactSheet({ impact }: { impact: PlateChangeImpact }) {
  const rows = metricRows(impact);
  const lines = plateLines(impact);
  const items = impact.buying.items.filter((x) => x.plate || Math.abs(x.change) > 1e-9);
  return (
    <Box data-testid="impact-sheet" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }} data-testid="impact-sentence">{impact.sentence}</Typography>
      {impact.reason && <Typography sx={{ fontSize: 13 }}><b>Why:</b> {impact.reason}{impact.requestedBy?.name ? ` — ${impact.requestedBy.name}` : ''}</Typography>}
      {lines.length > 0 && (
        <Box component="ul" data-testid="impact-plates" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.25, fontSize: 13 }}>
          {lines.map((l) => <li key={l.key} style={{ color: l.tone === 'remove' ? 'var(--c-danger-800)' : l.tone === 'add' ? 'var(--c-success-800)' : undefined, overflowWrap: 'anywhere' }}>{l.text}</li>)}
        </Box>
      )}
      <Box sx={{ overflowX: 'auto', minWidth: 0 }}>
        <Box component="table" sx={tableSx} data-testid="impact-table">
          <thead><tr><th>&nbsp;</th><th className="num">Before</th><th className="num">After</th><th className="num">Difference</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-testid={`impact-${r.key}`}>
                <td>{r.hint ? <Tooltip title={r.hint}><span style={{ borderBottom: '1px dotted var(--c-border)' }}>{r.label}</span></Tooltip> : r.label}</td>
                <td className="num">{r.before}</td>
                <td className="num">{r.after}</td>
                <td className="num" style={{ fontWeight: 600, color: r.worse === true ? 'var(--c-danger-800)' : r.worse === false ? 'var(--c-success-800)' : undefined }}>{r.diff}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
      {impact.choice?.text && !impact.sentence.includes(impact.choice.text) && <Typography sx={{ fontSize: 13 }}>{impact.choice.text}</Typography>}
      {/* §68: a substitute the customer sent — the line's nesting beside it (it is not re-nested by this). */}
      {impact.nesting?.text && <Typography data-testid="impact-nesting" sx={{ fontSize: 13 }}>{impact.nesting.text}</Typography>}
      <Box sx={{ display: 'grid', gap: 0.75 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} data-testid="impact-buying">{impact.buying.text}</Typography>
        {items.length > 0 && (
          <Box sx={{ overflowX: 'auto', minWidth: 0 }}>
            <Box component="table" sx={tableSx}>
              <thead><tr><th>Material</th><th className="num">Need now</th><th className="num">Need after</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Held</th></tr></thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.itemId} data-testid="impact-item">
                    <td style={{ overflowWrap: 'anywhere' }}><Mono>{x.code ?? x.name}</Mono>{x.onOrder.length > 0 && <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>{` · ${x.onOrder.map((o) => o.poCode).join(', ')}`}</Box>}</td>
                    <td className="num">{Number(x.needBefore.toFixed(3))}</td>
                    <td className="num" style={{ fontWeight: Math.abs(x.change) > 1e-9 ? 600 : undefined }}>{Number(x.needAfter.toFixed(3))}</td>
                    <td className="num">{Number(x.ordered.toFixed(3))}</td>
                    <td className="num">{Number(x.received.toFixed(3))}</td>
                    <td className="num">{Number(x.held.toFixed(3))}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** The buyer's checklist: per material, what is on order, the new need, and the actions to tick. */
function Checklist({ request, onChanged }: { request: PlateChangeRequest; onChanged: (r: PlateChangeRequest) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const c = request.checklist;
  if (!c) return null;
  const tick = async (key: string, done: boolean) => {
    setBusy(key); setError(null);
    try { onChanged(await tickPlateChange(request.id, key, done)); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };
  const progress = checklistProgress(c);
  return (
    <Box data-testid="plate-change-checklist" sx={{ display: 'grid', gap: 1 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{`For the buyer · ${progress.text}`}</Typography>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>The purchase orders are not changed by themselves. Change them, then tick each line.</Typography>
      {c.items.map((x) => (
        <Box key={x.itemId} sx={{ display: 'grid', gap: 0.25, minWidth: 0 }}>
          <Box sx={{ fontSize: 13, overflowWrap: 'anywhere' }}><Mono>{x.code ?? x.name}</Mono> <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{checklistFacts(x)}</Box></Box>
          {x.actions.map((a) => (
            <Box key={a.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 13, minWidth: 0 }} data-testid="checklist-action" data-key={a.key}>
              <Checkbox size="small" checked={a.done} disabled={!request.canTick || busy != null} onChange={(e) => void tick(a.key, e.target.checked)}
                slotProps={{ input: { 'aria-label': a.text } }} />
              <Box sx={{ minWidth: 0, overflowWrap: 'anywhere', textDecoration: a.done ? 'line-through' : undefined, color: a.done ? 'var(--c-text-3)' : undefined }}>
                {a.text}{a.done && a.doneBy?.name ? <Box component="span" sx={{ textDecoration: 'none', ml: 0.5 }}>{`· ${a.doneBy.name}`}</Box> : null}
              </Box>
              {busy === a.key && <CircularProgress size={13} />}
            </Box>
          ))}
          {x.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', pl: 1 }}>{x.note}</Typography>}
        </Box>
      ))}
      <ErrorNotice error={error} />
    </Box>
  );
}

/** One request: what, why, who; open it for the impact sheet, the decision and the checklist. */
export function PlateChangeCard({ request, onChanged, defaultOpen = false, showLine = false, lineHref }: {
  request: PlateChangeRequest;
  onChanged: (r: PlateChangeRequest) => void;
  defaultOpen?: boolean;
  /** On the page across orders: say which order and line. */
  showLine?: boolean;
  lineHref?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [prompt, setPrompt] = useState<'approve' | 'reject' | 'withdraw' | null>(null);
  const badge = statusBadge(request);
  const r = request;
  const holding = r.status === 'pending' || r.status === 'stale';
  return (
    <Box data-testid="plate-change-card" data-code={r.code} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 1.25, display: 'grid', gap: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
        <Mono>{r.code}</Mono>
        <Badge family={badge.family} label={badge.label} noIcon />
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{r.kindLabel}</Typography>
        {showLine && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', minWidth: 0, overflowWrap: 'anywhere' }}>
            {lineHref ? <Link to={lineHref}>{`${r.order.code ?? ''} · line ${r.line.lineNo ?? ''}`}</Link> : `${r.order.code ?? ''} · line ${r.line.lineNo ?? ''}`}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => setOpen((o) => !o)} endIcon={open ? <ExpandLessRounded /> : <ExpandMoreRounded />} data-testid="plate-change-open">
          {open ? 'Hide' : 'Details'}
        </Button>
      </Box>
      <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{r.reason}</Typography>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {askedWords(r)}
        {r.impact?.sentence ? ` · ${r.impact.sentence}` : ''}
      </Typography>
      {r.decisionNote && <Typography sx={{ fontSize: 12.5 }}>{`${r.status === 'rejected' ? 'Rejected' : 'Note'}${r.decidedBy?.name ? ` by ${r.decidedBy.name}` : ''}: ${r.decisionNote}`}</Typography>}
      {r.stale && <Alert severity="error" sx={{ py: 0 }}>The line's plates or its buying changed after this was asked. It cannot be approved. Withdraw it and ask again.</Alert>}
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: 'grid', gap: 1.5, pt: 0.5 }}>
          {r.impact && <ImpactSheet impact={r.impact} />}
          {r.checklist && <Checklist request={r} onChanged={onChanged} />}
        </Box>
      </Collapse>
      {(holding || r.canApprove) && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {r.canApprove && <Button size="small" variant="contained" data-testid="plate-change-approve" onClick={() => setPrompt('approve')}>Approve</Button>}
          {r.canReject && <Button size="small" color="error" variant="outlined" data-testid="plate-change-reject" onClick={() => setPrompt('reject')}>Reject</Button>}
          {r.canWithdraw && <Button size="small" data-testid="plate-change-withdraw" onClick={() => setPrompt('withdraw')}>Withdraw</Button>}
          {!r.canApprove && r.whyNotApprove && holding && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }} data-testid="plate-change-why-not">{r.whyNotApprove}</Typography>}
        </Box>
      )}
      <PromptDialog open={prompt === 'approve'} title={`Approve ${r.code}`} label="Note (optional)" required={false} confirmLabel="Approve and save"
        body="The change is saved now, the requisition follows the new need, and the buyer gets a list of purchase-order changes to make."
        onConfirm={async (note) => onChanged(await approvePlateChange(r.id, note || undefined))} onClose={() => setPrompt(null)} />
      <PromptDialog open={prompt === 'reject'} title={`Reject ${r.code}`} label="Why is it rejected?" confirmLabel="Reject" danger
        body="Nothing is saved. The person who asked sees your note."
        onConfirm={async (note) => onChanged(await rejectPlateChange(r.id, note))} onClose={() => setPrompt(null)} />
      <PromptDialog open={prompt === 'withdraw'} title={`Withdraw ${r.code}`} label="Note (optional)" required={false} confirmLabel="Withdraw"
        body="Nothing is saved. The line's nesting is free again."
        onConfirm={async (note) => onChanged(await withdrawPlateChange(r.id, note || undefined))} onClose={() => setPrompt(null)} />
    </Box>
  );
}

/**
 * On the line's Nesting screen: the gate (a PO covers the line / a request is waiting) and the line's requests.
 * Nothing at all when no PO covers the line and it has never had a request.
 */
export function PlateChangesPanel() {
  const { data, changed } = usePlateChange();
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const { gate, requests } = data;
  if (!gate.covered && !requests.length) return null;
  const open = requests.filter((r) => r.status === 'pending' || r.status === 'stale' || r.status === 'approved');
  const shown = showAll ? requests : open;
  return (
    <Box data-testid="plate-changes-panel" sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
      {gate.held
        ? <Alert severity="warning" data-testid="plate-change-held">{gate.message}</Alert>
        : gate.covered && <Alert severity="info" data-testid="plate-change-covered">{gate.message}</Alert>}
      {shown.map((r) => <PlateChangeCard key={r.id} request={r} onChanged={changed} defaultOpen={r.status === 'pending' && requests.length === 1} />)}
      {requests.length > open.length && (
        <Box>
          <Button size="small" onClick={() => setShowAll((s) => !s)} data-testid="plate-changes-all">
            {showAll ? 'Show only open changes' : `Show all ${requests.length} plate changes`}
          </Button>
        </Box>
      )}
    </Box>
  );
}
