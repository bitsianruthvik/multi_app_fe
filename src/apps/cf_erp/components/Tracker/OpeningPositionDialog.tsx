import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Radio, RadioGroup, TextField, Typography,
} from '@mui/material';
import { CfApiError } from '../../api/client';
import { getOpeningView, setOpening, type OpeningAnswer, type OpeningInput, type OpeningView } from '../../api/openingPosition';
import { ErrorNotice, Mono, SkeletonRows } from '../ui';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * SET OPENING POSITION (init.sql §121; user 2026-11-28: "get the sales orders to the levels of completion they are in
 * production … give a way to easily set everything to a particular stage"). A released line's work done before the
 * system: pick the stage it has reached (Setup › Settings › Production: stages), the whole line or the pieces ticked
 * (each with everything under it), and the day it stood there. Preview says what would change; Apply marks those
 * steps done as the OPENING position — nothing is posted to stock, material or billing, and the steps show "Opening".
 * A lower stage takes opening steps back, while no real work has been recorded after them.
 */
export function OpeningPositionDialog({ lines, onClose, onDone }: {
  /** The released lines it can be set on (null = shut). One line = no picker. */
  lines: { id: number; label: string }[] | null;
  onClose: () => void;
  /** Something changed: the tree reads again. */
  onDone: () => void;
}) {
  const open = !!lines?.length;
  const [lineId, setLineId] = useState<number | null>(null);
  const [view, setView] = useState<OpeningView | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<number | ''>('');
  const [scope, setScope] = useState<'line' | 'pieces'>('line');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [units, setUnits] = useState<Set<number>>(new Set());
  const [asOf, setAsOf] = useState('');
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<OpeningAnswer | null>(null);
  const [applied, setApplied] = useState<OpeningAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  // Bumped each time the dialog opens and after Apply, so the counts are read fresh (not only when the line changes).
  const [readKey, setReadKey] = useState(0);

  useEffect(() => {
    if (!lines?.length) return;
    setLineId(lines[0].id); setReadKey((k) => k + 1); setStage(''); setScope('line'); setPicked(new Set()); setAsOf(''); setFilter(''); setPreview(null); setApplied(null); setError(null);
  }, [lines]);
  useEffect(() => {
    if (lineId == null) return undefined;
    let alive = true;
    setLoading(true); setView(null); setPreview(null); setPicked(new Set());
    getOpeningView(lineId)
      .then((v) => { if (alive) { setView(v); setUnits(new Set(v.units.map((u) => u.number))); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [lineId, readKey]);
  // Any change of what is asked makes the preview stale.
  useEffect(() => { setPreview(null); }, [stage, scope, picked, units, asOf]);

  const input = (): OpeningInput | null => {
    if (stage === '' || !view) return null;
    const allUnits = units.size === view.units.length;
    return {
      stage: Number(stage),
      ...(scope === 'pieces' ? { pieceIds: [...picked] } : {}),
      ...(view.units.length > 1 && !allUnits ? { units: [...units].sort((a, b) => a - b) } : {}),
      ...(asOf ? { asOf } : {}),
    };
  };
  const ready = stage !== '' && !!view && (scope === 'line' || picked.size > 0) && (view.units.length < 2 || units.size > 0);
  const run = async (dryRun: boolean) => {
    const body = input();
    if (!body || lineId == null) return;
    setBusy(true); setError(null);
    try {
      const r = await setOpening(lineId, { ...body, dryRun });
      if (dryRun) setPreview(r); else { setApplied(r); setReadKey((k) => k + 1); onDone(); }
    } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); } finally { setBusy(false); }
  };

  const term = filter.trim().toLowerCase();
  const shownPieces = useMemo(() => {
    const all = view?.pieces ?? [];
    if (!term) return all;
    const hit = new Set(all.filter((p) => p.code.toLowerCase().includes(term)).map((p) => p.id));
    // A parent stays when a child matches, so the tree reads.
    for (const p of all) if (hit.has(p.id) && p.parentId != null) hit.add(p.parentId);
    return all.filter((p) => hit.has(p.id));
  }, [view, term]);
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const result = applied ?? preview;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{applied ? 'Opening position set' : 'Set opening position'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1.5 }}>
        <ErrorNotice error={error} />
        {!applied && (
          <>
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
              For work done before the system: every step up to the stage is marked done as the line's <b>opening position</b>.
              Nothing is posted — no material used, no stock moved, no finished stock, no billing. The steps show <b>Opening</b>;
              the next real step can start on the floor as usual. Steps the floor has already started are left as they are.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              {(lines?.length ?? 0) > 1 && (
                <TextField select size="small" label="Line" value={lineId ?? ''} onChange={(e) => setLineId(Number(e.target.value))} sx={{ minWidth: 220 }}
                  slotProps={{ htmlInput: { 'data-testid': 'opening-line' } }}>
                  {(lines ?? []).map((l) => <MenuItem key={l.id} value={l.id}>{l.label}</MenuItem>)}
                </TextField>
              )}
              <TextField select size="small" label="Work has reached" value={stage} onChange={(e) => setStage(e.target.value === '' ? '' : Number(e.target.value))}
                sx={{ minWidth: 260 }} disabled={!view} slotProps={{ htmlInput: { 'data-testid': 'opening-stage' } }}>
                {(view?.stages ?? []).map((s) => (
                  <MenuItem key={s.number} value={s.number}>
                    <Box component="span" sx={{ color: 'var(--c-text-3)', mr: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.number}</Box>
                    {s.name}
                    <Box component="span" sx={{ color: 'var(--c-text-3)', ml: 1, fontSize: 12 }}>{s.ops.slice(0, 4).join(', ')}{s.ops.length > 4 ? '…' : ''}</Box>
                  </MenuItem>
                ))}
                <MenuItem value={0}>None — take the opening position back</MenuItem>
              </TextField>
              <TextField type="date" size="small" label="As of (optional)" value={asOf} onChange={(e) => setAsOf(e.target.value)}
                InputLabelProps={{ shrink: true }} inputProps={{ max: today(), 'data-testid': 'opening-asof' }} helperText="Empty = today; may be before the release" />
            </Box>
            {loading && <SkeletonRows rows={3} height={32} />}
            {view && (
              <>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                  {`${view.order.code} line ${view.lineNo}: ${view.steps.toLocaleString()} steps, ${view.doneSteps.toLocaleString()} done${view.openingSteps ? ` (${view.openingSteps.toLocaleString()} of them opening)` : ''}.`}
                </Typography>
                {view.units.length > 1 && (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 13 }}>Units:</Typography>
                    {view.units.map((u) => (
                      <FormControlLabel key={u.number} sx={{ mr: 1 }} label={<Typography sx={{ fontSize: 13 }}>{u.number} <Mono muted>{u.code}</Mono></Typography>}
                        control={<Checkbox size="small" checked={units.has(u.number)} onChange={() => setUnits((s) => { const n = new Set(s); if (n.has(u.number)) n.delete(u.number); else n.add(u.number); return n; })} />} />
                    ))}
                  </Box>
                )}
                <RadioGroup row value={scope} onChange={(e) => setScope(e.target.value === 'pieces' ? 'pieces' : 'line')}>
                  <FormControlLabel value="line" control={<Radio size="small" />} label={<Typography sx={{ fontSize: 13.5 }}>The whole line</Typography>} />
                  <FormControlLabel value="pieces" control={<Radio size="small" />} label={<Typography sx={{ fontSize: 13.5 }}>The pieces I tick (each with everything under it)</Typography>} />
                </RadioGroup>
                {scope === 'pieces' && (
                  <Box sx={{ display: 'grid', gap: 0.75 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <TextField size="small" placeholder="Find a code, e.g. G2" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ width: 240 }} />
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{picked.size} ticked</Typography>
                      {picked.size > 0 && <Button size="small" onClick={() => setPicked(new Set())}>Clear</Button>}
                      {shownPieces.length > 0 && <Button size="small" onClick={() => setPicked(new Set([...picked, ...shownPieces.filter((p) => p.level === 2 || !shownPieces.some((c) => c.parentId === p.id)).map((p) => p.id)]))}>Tick all shown</Button>}
                    </Box>
                    <Box data-testid="opening-pieces" sx={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', py: 0.5 }}>
                      {shownPieces.map((p) => {
                        const parentTicked = p.parentId != null && picked.has(p.parentId);
                        return (
                          <FormControlLabel key={p.id} sx={{ display: 'flex', m: 0, pl: p.level === 1 ? 1 : 4 }}
                            label={<Typography sx={{ fontSize: 13 }}><Mono>{p.code}</Mono>{p.name ? <Box component="span" sx={{ color: 'var(--c-text-3)', ml: 1 }}>{p.name}</Box> : null}</Typography>}
                            control={<Checkbox size="small" checked={picked.has(p.id) || parentTicked} disabled={parentTicked} onChange={() => toggle(p.id)} />} />
                        );
                      })}
                    </Box>
                  </Box>
                )}
              </>
            )}
          </>
        )}
        {result && (
          <Box data-testid="opening-result" sx={{ display: 'grid', gap: 1 }}>
            <Alert severity={applied ? 'success' : result.counts.mark || result.counts.reopen ? 'info' : 'warning'}>{result.message}</Alert>
            {(result.warnings ?? []).map((w) => <Alert key={w} severity="warning">{w}</Alert>)}
            {result.counts.markedUnderAssembled > 0 && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                {`${result.counts.markedUnderAssembled.toLocaleString()} of them are parts inside a piece already assembled — done through their whole flow.`}
              </Typography>
            )}
            {result.beforeRelease && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{`As of ${result.asOf}: before the line was released — kept as history.`}</Typography>}
            {result.byStage.length > 0 && (
              <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 13, '& td, & th': { px: 1, py: 0.25, textAlign: 'left', borderBottom: '1px solid var(--c-divider)' }, '& td.n, & th.n': { textAlign: 'right', fontFamily: 'var(--font-mono)' } }}>
                <thead><tr><th>Stage</th><th className="n">{result.dryRun ? 'Would mark done' : 'Marked done'}</th><th className="n">{result.dryRun ? 'Would re-open' : 'Re-opened'}</th></tr></thead>
                <tbody>
                  {result.byStage.map((s) => <tr key={s.number}><td>{s.number} · {s.name}</td><td className="n">{s.mark.toLocaleString()}</td><td className="n">{s.reopen.toLocaleString()}</td></tr>)}
                </tbody>
              </Box>
            )}
            {(result.counts.alreadyOpening > 0 || result.counts.alreadyDone > 0) && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                {`Already there: ${result.counts.alreadyOpening.toLocaleString()} opening, ${result.counts.alreadyDone.toLocaleString()} done on the floor.`}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {applied ? <Button variant="contained" onClick={onClose}>Close</Button> : (
          <>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="outlined" onClick={() => { void run(true); }} disabled={busy || !ready} data-testid="opening-preview">{busy && !preview ? 'Working…' : 'Preview'}</Button>
            <Button variant="contained" onClick={() => { void run(false); }} disabled={busy || !preview || (!preview.counts.mark && !preview.counts.reopen)} data-testid="opening-apply">
              {busy && preview ? 'Applying…' : 'Apply'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
