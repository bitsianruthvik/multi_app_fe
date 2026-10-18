import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, Tooltip, Typography } from '@mui/material';
import { cfApi, type CfApiError } from '../../api/client';
import {
  cancelNestCompare, getNestCompare, startAutoCompare, stopNestCompare, swapNestAlternative,
  type CompareAnswer, type ComparePlate,
} from '../../api/nesting';
import type { Nest, NestingPlan } from '../../api/types';
import { autoRanLine, compareTabRows, mm, mmPair, pct, rupees, swapPlan, thicknessLine, NOT_COSTED } from '../../lib/nesting';
import { Badge, CapsLabel, ErrorNotice, Mono, SectionCard, SkeletonRows } from '../ui';
import { NestRunCard } from './NestRunCard';
import { PlateDiagram } from './PlateDiagram';
import { DialogHeader } from '../FormDialog';
import { usePlateChange } from './plateChangeContext';

/**
 * THE COMPARE TAB (2026-10-16). The user: "whenever we are uploading the nesting done manually by the customer, can you
 * actually run a standard nesting and show a comparison. Don't block the user but run it in parallel and when the result is
 * there, have a compare tab on the nesting screen to compare. Store the auto generated one. Even if the user opens it later,
 * he can see."
 *
 * The server starts our Standard nesting of the SAME pieces the upload holds when the upload is saved, and keeps it. This tab
 * only reads it: running → the progress; done → both sides, the difference, per thickness, and the plates drawn. Pieces the
 * upload left over are in neither side and said apart. Taking our nesting instead is not offered here (the upload stays the
 * saved nesting). If the server's start was lost (a restart in the moment after the save) the tab starts it once itself.
 *
 * AI'S NESTING STORED BESIDE THE CUSTOMER'S (§87, the user 2026-10-18): the run above IS the line's alternative, kept
 * beside the upload. "Make AI's nesting the main one" swaps them — AI's plates are saved on the line and the customer's
 * are kept — and "Switch back to the customer's nesting" brings the customer's back exactly as they were. Both go through
 * the plate-change gate (the before / after sheet; a request when a PO covers the line and approval is on) and stop
 * once the line has a production order. The confirm says what changes first (lib/nesting.swapPlan).
 */

const POLL_MS = 2000;

function PlateList({ title, plates, nests, openKey, onOpen, testid }: {
  title: string; plates: ComparePlate[]; nests: (Nest | undefined)[]; openKey: string | null; onOpen: (key: string | null) => void; testid: string;
}) {
  const key = (p: ComparePlate, i: number) => `${testid}|${p.lotNo ?? i}`;
  const shown = plates.findIndex((p, i) => key(p, i) === openKey);
  const nest = shown >= 0 ? nests[shown] : undefined;
  return (
    <Box data-testid={testid} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0, alignContent: 'start' }}>
      <CapsLabel>{`${title} · ${plates.length} ${plates.length === 1 ? 'plate' : 'plates'}`}</CapsLabel>
      {plates.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No plates yet.</Typography>}
      {plates.map((p, i) => {
        const on = key(p, i) === openKey;
        return (
          <Box key={key(p, i)} component="button" type="button" aria-pressed={on} data-plate={p.lotNo ?? i} onClick={() => onOpen(on ? null : key(p, i))}
            sx={{
              display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', textAlign: 'left', font: 'inherit', fontSize: 12.5, cursor: 'pointer',
              p: 0.75, minWidth: 0, background: on ? 'var(--c-surface-2)' : 'var(--c-surface)', color: 'var(--c-text-1)',
              border: on ? '2px solid var(--c-primary-600)' : '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflowWrap: 'anywhere',
            }}>
            <Mono>{p.lotNo ?? `#${i + 1}`}</Mono>
            <span>{p.length && p.width ? mmPair(p.length, p.width) : (p.plateCode ?? 'Plate')}</span>
            {p.thickness ? <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`${mm(p.thickness)} mm`}</Box> : null}
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`${p.pieces} ${p.pieces === 1 ? 'piece' : 'pieces'} · waste ${pct(p.wastePct)}`}</Box>
            <Box component="span" sx={{ color: 'var(--c-text-2)', ml: 'auto' }}>{p.cost == null ? NOT_COSTED : rupees(p.cost)}</Box>
          </Box>
        );
      })}
      {shown >= 0 && (nest
        ? <PlateDiagram nest={nest} kerfMm={plates[shown].kerfMm ?? 0} title={`${title}: plate ${plates[shown].lotNo ?? ''}`} />
        : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>There is no drawing for this plate.</Typography>)}
    </Box>
  );
}

export function NestCompareTab({ orderId, lineId, version = 0, canManage = false, onSwapped }: {
  orderId: number;
  lineId: number;
  /** Bumped when the line's nesting is saved again (an upload, an approval): read again. */
  version?: number;
  /** May swap which nesting is the main one (orders manage). */
  canManage?: boolean;
  /** A swap saved: the Nesting tab reads the line's plates again. */
  onSwapped?: () => void;
}) {
  const [data, setData] = useState<CompareAnswer | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [saved, setSaved] = useState<NestingPlan | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState<'start' | 'stop' | 'cancel' | null>(null);
  const [openPlate, setOpenPlate] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapDone, setSwapDone] = useState<string | null>(null);
  const plateChange = usePlateChange();
  const alive = useRef(true);
  // The tab starts our run itself at most once per opening (when the server's own start was lost).
  const healed = useRef(false);
  const path = `/orders/${orderId}/lines/${lineId}/nesting`;

  const load = useCallback(async (detail: boolean) => {
    try {
      const a = await getNestCompare(orderId, lineId, { detail });
      if (!alive.current) return null;
      setData(a); setReceivedAt(Date.now()); setError(null);
      return a;
    } catch (e) { if (alive.current) setError(e as CfApiError); return null; }
  }, [orderId, lineId]);

  useEffect(() => {
    alive.current = true;
    healed.current = false;
    setOpenPlate(null);
    void load(true);
    // The customer's plates, to draw them (the saved plan; the comparison carries only their figures).
    cfApi.get<NestingPlan>(path).then((p) => { if (alive.current) setSaved(p); }).catch(() => undefined);
    return () => { alive.current = false; };
  }, [load, path, version]);

  const running = data?.auto.status === 'running' || data?.run?.status === 'running';
  const waiting = !running && data?.autoCompare?.status === 'waiting';
  const queued = !running && data?.autoCompare?.status === 'queued';
  // While it runs (or waits to start), ask again; when it is done, fetch the whole answer (with our plan, to draw it).
  useEffect(() => {
    if (!running && !waiting && !queued) return undefined;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      const a = await load(false);
      if (stop) return;
      const still = a && (a.auto.status === 'running' || a.run?.status === 'running' || a.autoCompare?.status === 'waiting' || a.autoCompare?.status === 'queued');
      if (a && !still) { await load(true); return; }
      timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => { stop = true; window.clearTimeout(timer); };
  }, [running, waiting, queued, load]);

  const start = useCallback(async (rerun: boolean) => {
    setBusy('start'); setError(null);
    try { await startAutoCompare(orderId, lineId, { rerun }); await load(false); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  }, [orderId, lineId, load]);

  // THE SERVER'S START WAS LOST (a restart in the moment after the save, or an upload from before this tab existed): an
  // upload is saved, nothing answers it, nothing runs, nothing failed — start it once, as the server would have.
  const status = data?.auto.status ?? 'none';
  const lost = !!data?.uploaded && !running && !waiting && !queued && (status === 'none' || status === 'stale') && !data.lastFailure;
  useEffect(() => {
    if (!lost || healed.current) return;
    healed.current = true;
    void start(false);
  }, [lost, start]);

  const stop = async () => {
    setBusy('stop'); setError(null);
    try { await stopNestCompare(orderId, lineId); await load(false); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };
  const cancel = async () => {
    setBusy('cancel'); setError(null);
    try { await cancelNestCompare(orderId, lineId); await load(true); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };

  const plan = useMemo(() => swapPlan(data, plateChange.data?.gate ?? null), [data, plateChange.data]);
  const swap = async () => {
    setSwapBusy(true); setError(null); setSwapDone(null);
    try {
      const out = await plateChange.submit(plan.label, (f) => swapNestAlternative(orderId, lineId, plan.to, plan.to === 'ai' ? data?.auto.runId ?? null : null, f));
      setSwapOpen(false);
      // null: sent for approval (or no reason was given) — nothing changed yet.
      if (!out) return;
      setSwapDone(out.message);
      await load(true);
      cfApi.get<NestingPlan>(path).then((p) => { if (alive.current) setSaved(p); }).catch(() => undefined);
      onSwapped?.();
    } catch (e) { setError(e as CfApiError); } finally { setSwapBusy(false); }
  };

  const auto = data?.auto;
  const hasRun = status === 'ready' || status === 'accepted' || status === 'discarded';
  const rows = useMemo(() => compareTabRows(data?.uploaded?.metrics ?? null, hasRun ? auto?.metrics ?? null : null), [data, hasRun, auto]);
  const savedNests = useMemo(() => (saved?.groups ?? []).flatMap((g) => g.nests), [saved]);
  const autoNests = useMemo(() => ((auto?.plan?.groups ?? []) as { nests?: Nest[] }[]).flatMap((g) => g.nests ?? []), [auto]);
  const upPlates = data?.uploaded?.perPlate ?? [];
  const autoPlates = hasRun ? auto?.perPlate ?? [] : [];

  if (error && !data) return <ErrorNotice error={error} onRetry={() => { void load(true); }} />;
  if (!data) {
    return <SectionCard title="Compare"><SkeletonRows rows={4} height={44} /></SectionCard>;
  }
  if (!data.uploaded) {
    return (
      <SectionCard title="Compare">
        <Typography data-testid="compare-tab-empty" sx={{ fontSize: 13.5 }}>
          No customer nesting is saved on this line. Upload the nesting files first. Our own nesting of the same pieces then runs by itself.
        </Typography>
      </SectionCard>
    );
  }

  const unlike = hasRun && data.likeForLike && !data.likeForLike.same;
  return (
    <Box data-testid="compare-tab" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <SectionCard
        title="The customer's nesting beside AI's"
        subtitle={`AI nests the same ${data.likeForLike?.uploadedPieces ?? data.demand?.pieces ?? ''} pieces the upload holds, at Standard effort, and keeps the result.`}
        actions={hasRun && !running ? (
          <Button size="small" onClick={() => { void start(true); }} disabled={busy != null}
            startIcon={busy === 'start' ? <CircularProgress size={14} color="inherit" /> : undefined}>Run AI again</Button>
        ) : undefined}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
          {error && <Alert severity="error" data-testid="compare-tab-error">{error.message}</Alert>}

          {/* Where our side stands. */}
          {running && (
            <Box data-testid="compare-tab-running" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>AI is nesting…</Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>You can keep working. The figures show here when it is done.</Typography>
              {data.run && <NestRunCard run={data.run} receivedAt={receivedAt} onStop={stop} onCancel={cancel} busy={busy != null} />}
            </Box>
          )}
          {(waiting || queued) && (
            <Alert severity="info" data-testid="compare-tab-waiting">{data.autoCompare?.message ?? "AI's nesting starts in a moment."}</Alert>
          )}
          {!running && !waiting && !queued && !hasRun && data.lastFailure?.error?.message && (
            <Alert severity="error" data-testid="compare-tab-failed" action={<Button color="inherit" size="small" onClick={() => { void start(true); }} disabled={busy != null}>Run again</Button>}>
              {`AI's nesting did not finish. ${data.lastFailure.error.message}`}
            </Alert>
          )}
          {!running && !waiting && !queued && !hasRun && !data.lastFailure && (
            <Alert severity="info" data-testid="compare-tab-starting">{status === 'unavailable' ? (auto?.reason ?? "AI's nesting cannot run on this line yet.") : "Starting AI's nesting…"}</Alert>
          )}
          {data.stale && !hasRun && (
            <Typography data-testid="compare-tab-stale" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              The last comparison was for an earlier upload with other pieces. It is out of date and not shown.
            </Typography>
          )}

          {/* The verdict, first. */}
          {hasRun && (
            <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
              <Alert severity="info" icon={false} data-testid="compare-tab-headline"><strong>{data.headline ?? data.verdict ?? data.deltaReason ?? ''}</strong></Alert>
              <Typography data-testid="compare-tab-ran" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{autoRanLine(auto)}</Typography>
            </Box>
          )}
          {/* §87: which nesting is the main one, and the swap. */}
          {hasRun && plan.show && (
            <Box data-testid="compare-tab-swap" data-main={data.alternative?.main ?? 'uploaded'} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
              <Badge family={data.alternative?.main === 'ai' ? 'info' : 'neutral'} noIcon label={plan.mainLabel} />
              {canManage && (
                <Button size="small" variant="outlined" data-testid="compare-tab-swap-button" disabled={!plan.ok || busy != null || swapBusy || running}
                  onClick={() => { setSwapDone(null); setSwapOpen(true); }}>{plan.label}</Button>
              )}
              {plan.why && <Typography data-testid="compare-tab-swap-why" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{plan.why}</Typography>}
            </Box>
          )}
          {swapDone && <Alert severity="success" data-testid="compare-tab-swap-done" onClose={() => setSwapDone(null)}>{swapDone}</Alert>}
          {unlike && (
            <Alert severity="warning" data-testid="compare-tab-unlike">
              {`The two sides do not hold the same pieces (${data.likeForLike?.uploadedPieces} and ${data.likeForLike?.autoPieces}). Read the figures with care.`}
            </Alert>
          )}

          {/* The figures, side by side. Fixed layout: no sideways scroll on a phone. */}
          <Box component="table" data-testid="compare-tab-table" sx={{
            borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: 13,
            '& th, & td': { textAlign: 'left', py: 0.6, pr: 1, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'top', overflowWrap: 'anywhere' },
            '& th': { color: 'var(--c-text-3)', fontWeight: 600, fontSize: 12 },
            '& td.n': { fontVariantNumeric: 'tabular-nums' },
          }}>
            <thead>
              <tr><th style={{ width: '26%' }}>Figure</th><th>Customer&rsquo;s</th><th>By AI</th><th>AI vs customer</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-row={r.key} data-better={r.better}>
                  <td>{r.help ? <Tooltip title={r.help}><span>{r.label}</span></Tooltip> : r.label}</td>
                  <td className="n" data-col="customer">{r.customerWhy ? <Tooltip title={r.customerWhy}><span tabIndex={0}>{r.customer}</span></Tooltip> : r.customer}</td>
                  <td className="n" data-col="ours">
                    {!hasRun ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{running ? 'running…' : '—'}</Box>
                      : r.oursWhy ? <Tooltip title={r.oursWhy}><span tabIndex={0}>{r.ours}</span></Tooltip> : r.ours}
                  </td>
                  <td data-col="diff">
                    {hasRun ? r.diff : '—'}
                    {hasRun && (r.better === 'ours' || r.better === 'customer') && (
                      <Box component="span" sx={{ display: 'block', fontSize: 11.5, color: 'var(--c-text-2)' }}>{r.better === 'ours' ? 'AI is better' : "the customer's is better"}</Box>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Box>

          {/* What neither side holds. */}
          {data.leftOverSummary?.sentence && (
            <Typography data-testid="compare-tab-left" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{data.leftOverSummary.sentence}</Typography>
          )}
        </Box>
      </SectionCard>

      {(data.byThickness?.length ?? 0) > 0 && (
        <SectionCard title="By thickness">
          <Box data-testid="compare-tab-thickness" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
            {data.byThickness!.map((t) => (
              <Box key={String(t.thickness)} data-thickness={t.thickness ?? ''} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.25, minWidth: 0, pb: 1, borderBottom: '1px solid var(--c-divider)' }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{t.thickness ? `${mm(t.thickness)} mm` : 'Thickness not known'}</Typography>
                <Typography data-side="customer" sx={{ fontSize: 13, overflowWrap: 'anywhere' }}><Box component="span" sx={{ color: 'var(--c-text-3)' }}>Customer&rsquo;s: </Box>{thicknessLine(t.uploaded)}</Typography>
                <Typography data-side="ours" sx={{ fontSize: 13, overflowWrap: 'anywhere' }}><Box component="span" sx={{ color: 'var(--c-text-3)' }}>By AI: </Box>{hasRun ? thicknessLine(t.auto) : (running ? 'running…' : '—')}</Typography>
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}

      <SectionCard title="The plates" subtitle="Open a plate to see its drawing.">
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, minWidth: 0 }}>
          <PlateList title="Customer's" testid="compare-tab-plates-customer" plates={upPlates} nests={upPlates.map((p) => savedNests.find((n) => n.id === p.lotId))} openKey={openPlate} onOpen={setOpenPlate} />
          <PlateList title="By AI" testid="compare-tab-plates-ours" plates={autoPlates} nests={autoPlates.map((p) => autoNests.find((n) => n.lotNo === p.lotNo))} openKey={openPlate} onOpen={setOpenPlate} />
        </Box>
        {hasRun && <Box sx={{ mt: 1 }}><Badge family="neutral" noIcon label={data.alternative ? plan.mainLabel : 'The upload stays the saved nesting'} /></Box>}
      </SectionCard>

      <Dialog open={swapOpen} onClose={swapBusy ? undefined : () => setSwapOpen(false)} maxWidth="sm" fullWidth data-testid="compare-tab-swap-dialog">
        <DialogHeader title={plan.title} subtitle={plan.mainLabel} onClose={() => setSwapOpen(false)} busy={swapBusy} />
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
            {plan.onOrder && <Alert severity="warning" data-testid="compare-tab-swap-po">{plan.onOrder}</Alert>}
            <Box component="ul" data-testid="compare-tab-swap-lines" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 13.5, overflowWrap: 'anywhere' }}>
              {plan.lines.filter((l) => l !== plan.onOrder).map((l) => <li key={l}>{l}</li>)}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSwapOpen(false)} disabled={swapBusy}>Cancel</Button>
          <Button variant="contained" data-testid="compare-tab-swap-confirm" onClick={() => { void swap(); }} disabled={swapBusy || !plan.ok}
            startIcon={swapBusy ? <CircularProgress size={14} color="inherit" /> : undefined}>{swapBusy ? 'Saving…' : plan.confirm}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
