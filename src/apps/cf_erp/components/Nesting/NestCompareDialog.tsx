import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { CfApiError } from '../../api/client';
import {
  acceptNestCompare, cancelNestCompare, getNestCompare, startNestCompare, stopNestCompare,
  type CompareAnswer, type CompareMetrics, type ComparePlate,
} from '../../api/nesting';
import type { Nest } from '../../api/types';
import {
  COMPARE_ROWS, DELTA_KEY, EFFORTS, EFFORT_LINE, EFFORT_LONG_LINE, offlineLine, NO_MANAGE, differenceText, metricText, missingReason, mmPair, pct, ranAgo, type Effort,
} from '../../lib/nesting';
import { Badge, CapsLabel, Mono } from '../ui';
import { NestRunCard } from './NestRunCard';
import { PlateDiagram } from './PlateDiagram';

/**
 * THE CUSTOMER'S NESTING BESIDE OURS.
 *
 * Two columns of the same figures and a third that says the difference and who
 * is better — in words and an arrow, never colour alone. The automatic side is
 * pulled up if a run already answers this line; otherwise one is started and
 * this dialog waits for it. A missing figure is "—" with the reason on hover,
 * never a zero. Picking a side is the only thing here that writes.
 */

const POLL_MS = 1500;

type View = 'same' | 'whole';

function PlateList({ title, plates, nests, openKey, onOpen }: {
  title: string; plates: ComparePlate[]; nests: (Nest | undefined)[]; openKey: string | null; onOpen: (key: string | null) => void;
}) {
  const key = (p: ComparePlate, i: number) => `${title}|${p.lotNo ?? i}`;
  const shown = plates.findIndex((p, i) => key(p, i) === openKey);
  const nest = shown >= 0 ? nests[shown] : undefined;
  return (
    <Box data-testid="compare-plates" data-side={title} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
      <CapsLabel>{`${title} · plates (${plates.length})`}</CapsLabel>
      {plates.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No plates yet.</Typography>}
      {plates.map((p, i) => {
        const on = key(p, i) === openKey;
        return (
          <Box key={key(p, i)} component="button" type="button" aria-pressed={on} onClick={() => onOpen(on ? null : key(p, i))}
            sx={{
              display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', textAlign: 'left', font: 'inherit', fontSize: 12.5, cursor: 'pointer',
              p: 0.75, minWidth: 0, background: on ? 'var(--c-surface-2)' : 'var(--c-surface)',
              border: on ? '2px solid var(--c-primary-600)' : '1px solid var(--c-border)', borderRadius: 'var(--r-sm)',
            }}>
            <Mono>{p.lotNo ?? `#${i + 1}`}</Mono>
            <span>{p.plateCode ?? 'Plate'}</span>
            {p.length && p.width ? <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{mmPair(p.length, p.width)}</Box> : null}
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`${p.pieces} ${p.pieces === 1 ? 'piece' : 'pieces'}`}</Box>
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`${pct(p.wastePct)} waste`}</Box>
            <Box component="span" sx={{ color: 'var(--c-text-2)', ml: 'auto' }}>{p.cost == null ? 'cost —' : metricText(p.cost, 0, '₹')}</Box>
          </Box>
        );
      })}
      {shown >= 0 && (nest
        ? <PlateDiagram nest={nest} kerfMm={plates[shown].kerfMm ?? 0} title={`${title}: plate ${plates[shown].lotNo ?? ''}`} />
        : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>There is no drawing for this plate.</Typography>)}
    </Box>
  );
}

function MetricsTable({ up, auto, delta, deltaReason, upReason, autoReason }: {
  up: CompareMetrics | null | undefined; auto: CompareMetrics | null | undefined;
  /** The backend's difference for this view (null = it has none, and says why in deltaReason). */
  delta: Record<string, number | string | null> | null | undefined; deltaReason: string | null | undefined;
  upReason?: string | null; autoReason?: string | null;
}) {
  const cell = (m: CompareMetrics | null | undefined, row: typeof COMPARE_ROWS[number], sideReason?: string | null) => {
    const v = m ? row.get(m) : null;
    return v == null
      ? <Tooltip title={missingReason(row.key, m, sideReason)}><span tabIndex={0} data-null="1">{'—'}</span></Tooltip>
      : <span>{metricText(v, row.digits, row.unit)}</span>;
  };
  return (
    <Box component="table" data-testid="compare-table" sx={{
      borderCollapse: 'collapse', width: '100%', fontSize: 13,
      '& th, & td': { textAlign: 'left', py: 0.6, pr: 1.5, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'top' },
      '& th': { color: 'var(--c-text-3)', fontWeight: 600, fontSize: 12 },
      '& td.n, & th.n': { fontVariantNumeric: 'tabular-nums' },
    }}>
      <thead>
        <tr><th>Figure</th><th className="n">Customer&rsquo;s nesting</th><th className="n">Auto nesting</th><th>Difference</th></tr>
      </thead>
      <tbody>
        {COMPARE_ROWS.filter((row) => row.key !== 'wasteGaps' || [up, auto].some((m) => m && Number(row.get(m)) > 0)).map((row) => {
          const key = DELTA_KEY[row.key];
          // The backend's own difference where it gives one; null means a dash with its reason.
          const given = delta === null || delta === undefined ? delta : (key && key in delta ? delta[key] : undefined);
          const d = differenceText(row, up ? row.get(up) : null, auto ? row.get(auto) : null, given);
          const dash = d.text === '—';
          const why = !dash ? null
            : (row.key === 'cost' && typeof delta?.costReason === 'string' ? delta.costReason : (deltaReason || missingReason(row.key, auto, autoReason)));
          return (
            <tr key={row.key} data-row={row.key} data-better={d.side}>
              <td style={row.sub ? { paddingLeft: 18, color: 'var(--c-text-2)' } : undefined}>
                {row.help ? <Tooltip title={row.help}><span>{row.label}</span></Tooltip> : row.label}
              </td>
              <td className="n" data-col="uploaded">{cell(up, row, upReason)}</td>
              <td className="n" data-col="auto">{cell(auto, row, autoReason)}</td>
              <td data-col="diff">
                {d.arrow && <Box component="span" aria-hidden sx={{ mr: 0.5, fontWeight: 700 }}>{d.arrow}</Box>}
                {why ? <Tooltip title={why}><span tabIndex={0} data-null="1">{d.text}</span></Tooltip> : d.text}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Box>
  );
}

export function NestCompareDialog({
  open, orderId, lineId, canManage, savedNests, onClose, onDecided,
}: {
  open: boolean;
  orderId: number;
  lineId: number;
  canManage: boolean;
  /** The saved plan's plates, to draw the customer's side. */
  savedNests: Nest[];
  onClose: () => void;
  /** A side was taken: the panel reloads and says what happened. */
  onDecided: (message: string) => void;
}) {
  const [data, setData] = useState<CompareAnswer | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [view, setView] = useState<View>('same');
  const [effort, setEffort] = useState<Effort>('quick');
  const [busy, setBusy] = useState<'start' | 'accept' | 'cancel' | 'stop' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [openPlate, setOpenPlate] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const alive = useRef(true);

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
    if (open) { setData(null); setError(null); setView('same'); setOpenPlate(null); setConfirm(false); void load(true); }
    return () => { alive.current = false; };
  }, [open, load]);

  const running = data?.auto.status === 'running' || data?.run?.status === 'running';
  // While the comparison runs, ask again. When it stops, fetch the whole answer (with the proposal to draw).
  useEffect(() => {
    if (!open || !running) return undefined;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      const a = await load(false);
      if (stop) return;
      if (a && a.auto.status !== 'running' && a.run?.status !== 'running') { await load(true); return; }
      timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => { stop = true; window.clearTimeout(timer); };
  }, [open, running, load]);

  const start = async (rerun: boolean) => {
    setBusy('start'); setError(null);
    try {
      await startNestCompare(orderId, lineId, { effort, rerun });
      await load(true);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };

  const stop = async () => {
    setBusy('stop'); setError(null);
    try { await stopNestCompare(orderId, lineId); await load(false); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };

  const cancel = async () => {
    setBusy('cancel'); setError(null);
    try { await cancelNestCompare(orderId, lineId); await load(true); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };

  const take = async (side: 'uploaded' | 'auto') => {
    if (!data?.auto.runId) return;
    setBusy('accept'); setError(null);
    try {
      const out = await acceptNestCompare(orderId, lineId, side, data.auto.runId);
      setConfirm(false);
      onDecided(out.message);
    } catch (e) { setConfirm(false); setError(e as CfApiError); } finally { setBusy(null); }
  };

  const auto = data?.auto;
  const status = auto?.status ?? 'none';
  const ready = status === 'ready';
  const hasRun = ready || status === 'accepted' || status === 'discarded';
  const whole = view === 'whole';
  const delta = whole ? data?.wholeLine?.delta : data?.delta;
  const deltaReason = whole ? data?.wholeLine?.deltaReason : data?.deltaReason;
  const verdict = hasRun ? (whole ? (data?.wholeLine?.verdict ?? deltaReason) : (data?.verdict ?? deltaReason)) : null;
  const autoReason = whole ? (data?.wholeLine?.auto?.reason ?? auto?.reason) : auto?.reason;
  const leftOverNote = whole && (data?.wholeLine?.saved?.leftOverPieces ?? 0) > 0
    ? `${data?.wholeLine?.saved?.leftOverPieces} pieces are still left over, so the saved side leaves them out.` : null;
  const upMetrics = whole ? data?.wholeLine?.saved?.metrics : data?.uploaded?.metrics;
  const autoMetrics = whole ? data?.wholeLine?.auto?.metrics : auto?.metrics;
  const upPlates = (whole ? data?.wholeLine?.saved?.perPlate : data?.uploaded?.perPlate) ?? [];
  const autoPlates = (whole ? data?.wholeLine?.auto?.perPlate : auto?.perPlate) ?? [];
  const autoNests = useMemo(() => {
    const groups = (auto?.plan?.groups ?? []) as { nests?: Nest[] }[];
    return groups.flatMap((g) => g.nests ?? []);
  }, [auto]);
  const upNests = upPlates.map((p) => savedNests.find((n) => n.id === p.lotId));
  const autoDrawn = autoPlates.map((p) => autoNests.find((n) => n.lotNo === p.lotNo));
  const upCount = data?.uploaded?.metrics.plates ?? upPlates.length;
  const autoCount = data?.wholeLine?.auto?.metrics?.plates ?? auto?.metrics?.plates ?? 0;
  const canAuto = canManage && ready && (data?.canAccept?.auto ?? true);
  const canKeep = canManage && ready && (data?.canAccept?.uploaded ?? true);
  const why = !canManage ? NO_MANAGE : !ready ? 'Run auto nesting first.' : data?.canAccept?.reason ?? null;
  const decided = status === 'accepted' || status === 'discarded' || !!auto?.decision;

  return (
    <Dialog open={open} onClose={busy === 'accept' ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle>Compare with auto nesting</DialogTitle>
      <DialogContent dividers>
        {!data && !error && <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}><CircularProgress size={26} aria-label="Loading" /></Box>}
        {error && (
          <Alert severity={error.code === 'CHANGED_MEANWHILE' ? 'warning' : 'error'} data-testid="compare-error" sx={{ mb: 1.5 }}
            action={error.code === 'CHANGED_MEANWHILE' ? <Button color="inherit" size="small" onClick={() => { setError(null); void load(true); }}>Reload</Button> : undefined}>
            {error.message}
          </Alert>
        )}
        {data && !data.uploaded && (
          <Alert severity="info">No customer files are saved on this line, so there is nothing to compare. Upload the nesting files first.</Alert>
        )}
        {data && data.uploaded && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.75, minWidth: 0 }}>
            {/* The verdict, first. */}
            {hasRun && verdict && (
              <Alert severity="info" data-testid="compare-verdict" icon={false}><strong>{verdict}</strong></Alert>
            )}
            {/* The automatic side: where it stands. */}
            {running && data.run && <NestRunCard run={data.run} receivedAt={receivedAt} onStop={stop} onCancel={cancel} busy={busy != null} />}
            {running && !data.run && (
              <Alert severity="info" data-testid="compare-running" action={<Button color="inherit" size="small" onClick={cancel} disabled={busy != null}>Cancel</Button>}>
                Auto nesting is running. This page updates when it is done.
              </Alert>
            )}
            {!running && status === 'stale' && (
              <Alert severity="warning" data-testid="compare-stale" action={(
                <Button color="inherit" size="small" onClick={() => start(true)} disabled={busy != null}>Run again</Button>
              )}>
                {data.stale?.reason ?? 'The saved auto run is for an older version of this line.'} Its figures are not shown.
              </Alert>
            )}
            {!running && (status === 'none' || status === 'unavailable') && (
              <Box data-testid="compare-none" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 13.5, flex: '1 1 240px' }}>
                  {status === 'unavailable' ? (auto?.reason ?? 'Auto nesting cannot run on this line yet.') : 'No auto nesting has been run for this line yet.'}
                </Typography>
                {data.lastFailure?.error?.message && <Alert severity="error" sx={{ flex: '1 1 100%' }}>{data.lastFailure.error.message}</Alert>}
                <ToggleButtonGroup exclusive size="small" aria-label="How hard to look" value={effort} onChange={(_, v) => { if (v) setEffort(v as Effort); }}>
                  {EFFORTS.map((e) => <ToggleButton key={e.value} value={e.value}>{e.label}</ToggleButton>)}
                </ToggleButtonGroup>
                <Typography data-testid="effort-line" sx={{ fontSize: 12, color: 'var(--c-text-2)', flex: '1 1 100%' }}>{EFFORT_LINE}</Typography>
                <Typography data-testid="effort-long-line" sx={{ fontSize: 12, color: 'var(--c-text-2)', flex: '1 1 100%' }}>{EFFORT_LONG_LINE}</Typography>
                <Button variant="contained" onClick={() => start(false)} disabled={busy != null || status === 'unavailable'}
                  startIcon={busy === 'start' ? <CircularProgress size={14} color="inherit" /> : undefined}>
                  Run auto nesting to compare
                </Button>
              </Box>
            )}
            {ready && !decided && (
              <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge family="success" noIcon label="Auto nesting" />
                <Typography data-testid="compare-ran" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                  {ranAgo(auto?.ranAt)}{auto?.startedBy ? ` · ${offlineLine(auto.startedBy, auto.ranAt) ?? `by ${auto.startedBy}`}` : ''}
                </Typography>
                <Button size="small" onClick={() => start(true)} disabled={busy != null}>Run again</Button>
              </Box>
            )}
            {decided && (
              <Alert severity="info" data-testid="compare-decided">
                {auto?.decision === 'auto' ? 'Auto nesting was taken for this comparison.' : 'The customer’s nesting was kept for this comparison.'} Run again to decide again.
                <Box sx={{ mt: 0.5 }}><Button size="small" onClick={() => start(true)} disabled={busy != null}>Run again</Button></Box>
              </Alert>
            )}

            {data.wholeLine && (
              <ToggleButtonGroup exclusive size="small" aria-label="Which figures" value={view} onChange={(_, v) => { if (v) { setView(v as View); setOpenPlate(null); } }}>
                <ToggleButton value="same">Same pieces</ToggleButton>
                <ToggleButton value="whole">Whole line</ToggleButton>
              </ToggleButtonGroup>
            )}
            {hasRun && !whole && data.likeForLike && !data.likeForLike.same && (
              <Alert severity="warning" data-testid="compare-unlike">
                {`The two sides do not hold the same pieces (${data.likeForLike.uploadedPieces} against ${data.likeForLike.autoPieces}), so these figures do not compare cleanly. Try Whole line.`}
              </Alert>
            )}

            <Box sx={{ overflowX: 'auto' }}>
              {leftOverNote && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>{leftOverNote}</Typography>}
              <MetricsTable up={upMetrics} auto={hasRun ? autoMetrics : null}
                delta={hasRun ? delta : null} deltaReason={hasRun ? deltaReason : (autoReason ?? 'Run auto nesting to see the difference.')}
                autoReason={hasRun ? autoReason : (autoReason ?? 'No automatic run yet. Run auto nesting to compare.')} />
            </Box>

            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, minWidth: 0 }}>
              <PlateList title="Customer's nesting" plates={upPlates} nests={upNests} openKey={openPlate} onOpen={setOpenPlate} />
              <PlateList title="Auto nesting" plates={hasRun ? autoPlates : []} nests={autoDrawn} openKey={openPlate} onOpen={setOpenPlate} />
            </Box>

            {why && !canKeep && !canAuto && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{why}</Typography>}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        <Button onClick={onClose} disabled={busy === 'accept'}>Close</Button>
        <Tooltip title={canKeep ? 'The customer’s plates stay exactly as saved.' : (why ?? '')}>
          <span>
            <Button variant="outlined" disabled={!canKeep || busy != null} onClick={() => take('uploaded')}>Keep the customer&rsquo;s nesting</Button>
          </span>
        </Tooltip>
        <Tooltip title={canAuto ? '' : (why ?? '')}>
          <span>
            <Button variant="contained" color="warning" disabled={!canAuto || busy != null} onClick={() => setConfirm(true)}>Use auto nesting instead</Button>
          </span>
        </Tooltip>
      </DialogActions>

      <Dialog open={confirm} onClose={busy === 'accept' ? undefined : () => setConfirm(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Use auto nesting instead?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14 }} data-testid="compare-confirm">
            {data?.willReplace?.message
              ?? `This replaces everything saved on this line (${upCount} uploaded ${upCount === 1 ? 'plate' : 'plates'}) with the ${autoCount} ${autoCount === 1 ? 'plate' : 'plates'} from the automatic run.`}
          </Typography>
          {data?.willReplace && (
            <Box component="ul" data-testid="compare-replace-facts" sx={{ m: 0, mt: 1, pl: 2.5, fontSize: 13, color: 'var(--c-text-2)', display: 'grid', gap: 0.3 }}>
              <li>{`Goes: ${data.willReplace.plates} ${data.willReplace.plates === 1 ? 'plate' : 'plates'} (${data.willReplace.customerPlates} uploaded, ${data.willReplace.ourPlates} ours), ${data.willReplace.customerFiles} customer ${data.willReplace.customerFiles === 1 ? 'file' : 'files'}.`}</li>
              <li>{data.willReplace.withPlates != null
                ? `Comes: ${data.willReplace.withPlates} ${data.willReplace.withPlates === 1 ? 'plate' : 'plates'} holding ${data.willReplace.withPieces} pieces.${data.willReplace.notNestedAfter ? ` ${data.willReplace.notNestedAfter} stay un-nested.` : ''}`
                : (data.willReplace.withReason ?? 'The whole-line plan is not worked out yet.')}</li>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)} disabled={busy === 'accept'}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={() => take('auto')} disabled={busy === 'accept'}
            startIcon={busy === 'accept' ? <CircularProgress size={14} color="inherit" /> : undefined}>
            Replace with auto nesting
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
