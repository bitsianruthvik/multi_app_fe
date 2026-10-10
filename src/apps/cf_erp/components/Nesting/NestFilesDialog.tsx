import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import { CfApiError } from '../../api/client';
import {
  sendNestFiles, type NestFileRead, type NestFileUpload, type NestFilesResult, type NestLeftOver, type NestProblem,
} from '../../api/nesting';
import { REPLACE_WARNING, fileNest, kg, mm, mmPair } from '../../lib/nesting';
import { Badge, CapsLabel, Mono } from '../ui';
import { PlateDiagram } from './PlateDiagram';

/**
 * WHAT THE CUSTOMER'S NESTING FILES WOULD DO — read, never written, until Save.
 *
 * One DXF is one plate. The server reads every file (dry run) and answers with
 * one row per file, the DIFF against what the line already holds (added /
 * replaced / unchanged / removed), every problem as a sentence that already
 * names its file, plate and part, and what is left over. A blocker disables
 * Save; a warning that needs force turns it into "Save anyway".
 *
 * Choosing a plate or settling an ambiguous part changes the request, so the
 * dry run is sent again. Nothing here invents a sentence the server did not say.
 */

interface Seen {
  key: string; filename: string; kind: 'part' | 'plate'; partId?: string; message: string;
  options: { value: string; label: string }[];
}

/** The problems of one file, exactly as the server lists them (files[].errors / warnings). */
const problemsOf = (file: NestFileRead) => ({ errors: file.errors, warnings: file.warnings });

/** Request-level sentences no file lists (a line state, a surplus across files). */
function looseSentences(list: string[], result: NestFilesResult): string[] {
  const own = new Set(result.files.flatMap((f) => [...f.errors, ...f.warnings].map((p) => p.message)));
  return list.filter((x) => !own.has(x));
}

function DiffBlock({ result }: { result: NestFilesResult }) {
  const d = result.diff;
  const counts = [
    { key: 'added', label: 'Added', n: d.added.length, family: 'success' as const },
    { key: 'replaced', label: 'Replaced', n: d.replaced.length, family: 'info' as const },
    { key: 'unchanged', label: 'Unchanged', n: d.unchanged.length, family: 'neutral' as const },
    { key: 'removed', label: 'Removed', n: d.removed.length, family: 'warning' as const },
  ];
  const nothing = counts.every((c) => c.n === 0) && d.droppedAuto.length === 0;
  return (
    <Box data-testid="nest-diff" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
      <CapsLabel>What changes on the line</CapsLabel>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {counts.map((c) => <Badge key={c.key} family={c.family} noIcon label={`${c.label} ${c.n}`} />)}
      </Box>
      {nothing && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nothing changes on the line.</Typography>}
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 13, overflowWrap: 'anywhere' }}>
        {d.added.map((a) => (
          <li key={`a${a.lotNo}${a.filename}`} data-diff="added">
            <strong>{`${a.lotNo} is new`}</strong>{` — ${a.filename} on ${a.plateCode}, ${a.pieces} ${a.pieces === 1 ? 'piece' : 'pieces'}`}
            {a.parts.length > 0 && <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`: ${a.parts.map((p) => `${p.cutPlateCode} ×${p.qty}`).join(', ')}`}</Box>}
          </li>
        ))}
        {d.replaced.map((r) => (
          <li key={`r${r.lotId}`} data-diff="replaced">
            <strong>{`${r.lotNo} is replaced`}</strong>{` — ${r.filename}: was ${r.was.pieces} ${r.was.pieces === 1 ? 'piece' : 'pieces'}, now ${r.now.pieces}`}
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` · ${r.moved} moved, ${r.added} added, ${r.removed} removed`}</Box>
            {r.parts.length > 0 && (
              <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`. ${r.parts.map((p) => `${p.cutPlateCode} ${p.was ?? 0} → ${p.now ?? 0}`).join(', ')}`}</Box>
            )}
            {(r.droppedOurs?.length ?? 0) > 0 && (
              <Box sx={{ color: 'var(--c-warning-800)' }}>{`Our additions on this plate are dropped: ${r.droppedOurs!.map((p) => `${p.cutPlateCode} ×${p.qty}`).join(', ')}.`}</Box>
            )}
          </li>
        ))}
        {d.unchanged.map((u) => (
          <li key={`u${u.lotId}`} data-diff="unchanged">
            <strong>{`${u.lotNo} is unchanged`}</strong>
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` — ${u.filename} is the same file as the one saved, so it is not written again.`}</Box>
          </li>
        ))}
        {d.removed.map((x) => (
          <li key={`x${x.lotId}`} data-diff="removed">
            <strong>{`${x.lotNo} is removed`}</strong>{` — ${x.plateCode}, ${x.pieces} ${x.pieces === 1 ? 'piece' : 'pieces'} go back to left over`}
          </li>
        ))}
        {d.droppedAuto.map((x) => (
          <li key={`da${x.lotId}`} data-diff="dropped-auto">
            <strong>{`Automatic plate ${x.lotNo} is dropped`}</strong>
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` — the files now cover ${x.because.join(', ')} in full.`}</Box>
          </li>
        ))}
        {d.droppedOurs.map((x) => (
          <li key={`do${x.lotId}`} data-diff="dropped-ours">
            <strong>{`Our additions on ${x.lotNo} are dropped`}</strong>
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` — ${x.because}.`}</Box>
          </li>
        ))}
      </Box>
    </Box>
  );
}

function LeftOver({ leftOver, toNest }: { leftOver: NestLeftOver[]; toNest: number | null }) {
  const total = leftOver.reduce((a, l) => a + l.qty, 0);
  return (
    <Box data-testid="nest-leftover" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
      <CapsLabel>{`Left over${total ? ` (${total})` : ''}`}</CapsLabel>
      {leftOver.length === 0
        ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Every piece the line needs is on a plate.</Typography>
        : (
          <>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              {`These pieces are not on any plate yet. Nest the rest will place them${toNest != null ? ` (${toNest} of them)` : ''}.`}
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3, fontSize: 13 }}>
              {leftOver.map((l) => (
                <li key={l.cutPlateId}>
                  <Mono>{l.cutPlateCode}</Mono>{` ×${l.qty}`}
                  <Box component="span" sx={{ color: 'var(--c-text-2)' }}>
                    {l.length && l.width ? ` · ${mmPair(l.length, l.width)}` : ''}{l.thickness ? ` · ${mm(l.thickness)} mm` : ''}{l.grade ? ` ${l.grade}` : ''}
                    {l.manual ? ' · held back by hand' : ''}{l.leftOut ? ' · left out of nesting' : ''}
                  </Box>
                </li>
              ))}
            </Box>
          </>
        )}
    </Box>
  );
}

function ProblemList({ list, tone }: { list: NestProblem[]; tone: 'danger' | 'warning' }) {
  if (!list.length) return null;
  return (
    <Box component="ul" data-testid={tone === 'danger' ? 'file-errors' : 'file-warnings'} sx={{
      m: 0, pl: 2.5, display: 'grid', gap: 0.3, fontSize: 12.5, overflowWrap: 'anywhere',
      color: tone === 'danger' ? 'var(--c-danger-700, var(--c-danger-800))' : 'var(--c-warning-800)',
    }}>
      {list.map((p) => <li key={p.message}>{p.message}</li>)}
    </Box>
  );
}

function FileRow({ file, seen, plateCode, picked, onPlate, onPick }: {
  file: NestFileRead; seen: Seen[];
  plateCode: string | undefined; picked: Record<string, string>;
  onPlate: (code: string) => void; onPick: (partId: string, value: string) => void;
}) {
  const [layout, setLayout] = useState(false);
  const [typed, setTyped] = useState(plateCode ?? '');
  const { errors, warnings } = problemsOf(file);
  const outside = errors.filter((e) => e.code === 'OUTSIDE_PLATE');
  const kept = file.placements.filter((p) => p.shapeFrom === 'nesting file').length;
  const nest = useMemo(() => (layout && file.plate ? fileNest(file) : null), [layout, file]);
  const family = file.status === 'error' ? 'danger' : file.status === 'warning' ? 'warning' : 'success';
  const action = file.action === 'add' ? 'New plate' : file.action === 'replace' ? 'Replaces a saved plate' : file.action === 'unchanged' ? 'Unchanged' : null;
  const mySeen = seen.filter((s) => s.filename === file.filename);
  return (
    <Box data-testid="nest-file" data-file={file.filename} sx={{ py: 1.25, borderBottom: '1px solid var(--c-divider)', display: 'grid', gap: 0.75, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
        <Box sx={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>{file.filename}</Box>
        <Badge family={family} noIcon label={file.status === 'error' ? 'Problem' : file.status === 'warning' ? 'Warning' : 'Read'} />
        {action && <Badge family="neutral" noIcon label={action} />}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
        <span>
          {file.plate
            ? <>Plate <Mono>{file.plate.code}</Mono>{` · ${mmPair(file.plate.length, file.plate.width)}`}{file.plate.resolvedBy ? ` · found by ${file.plate.resolvedBy}` : ''}</>
            : 'No plate found yet'}
        </span>
        <span>{`Parts matched ${file.placed} of ${file.parts}`}</span>
        {file.nestNo && <span>{`Nest ${file.nestNo}`}</span>}
        {file.metrics?.wastePct != null && <span>{`${file.metrics.wastePct.toFixed(1)}% waste · ${kg(file.metrics.wasteKgTotal)} kg`}</span>}
      </Box>
      {file.counts.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap' }}>
          {file.counts.map((c) => (
            <Box key={c.cutPlateId} sx={{ display: 'inline-flex', gap: 0.5, fontSize: 12, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.15 }}>
              <Mono>{c.cutPlateCode}</Mono><span>{`×${c.qty}`}</span>
            </Box>
          ))}
        </Box>
      )}
      <ProblemList list={errors} tone="danger" />
      <ProblemList list={warnings} tone="warning" />

      {mySeen.map((s) => (
        <Box key={s.key} data-testid={s.kind === 'plate' ? 'plate-picker' : 'part-chooser'} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {s.kind === 'plate' && s.options.length === 0 ? (
            <>
              <TextField size="small" label="Plate code" value={typed} onChange={(e) => setTyped(e.target.value)} sx={{ minWidth: 180 }} />
              <Button size="small" variant="outlined" disabled={!typed.trim()} onClick={() => onPlate(typed.trim())}>Use this plate</Button>
            </>
          ) : (
            <TextField select size="small" sx={{ minWidth: 240 }} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              label={s.kind === 'plate' ? 'Which plate?' : `Which part is ${s.partId}?`}
              value={s.kind === 'plate' ? (plateCode ?? '') : (picked[s.partId ?? ''] ?? '')}
              onChange={(e) => (s.kind === 'plate' ? onPlate(e.target.value) : onPick(s.partId ?? '', e.target.value))}>
              <option value="">Choose…</option>
              {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </TextField>
          )}
        </Box>
      ))}

      {outside.length > 0 && (
        <Typography data-testid="file-outside" sx={{ fontSize: 12.5, color: 'var(--c-danger-700, var(--c-danger-800))' }}>
          {`${outside.length} ${outside.length === 1 ? 'part runs' : 'parts run'} off the plate and ${outside.length === 1 ? 'is' : 'are'} not counted as nested: ${outside.map((e) => e.cutPlateCode ?? e.partId ?? 'a part').join(', ')}.`}
        </Typography>
      )}
      {(file.scrap?.length ?? 0) > 0 && (
        <Typography data-testid="file-scrap" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {`${file.scrap!.length} ${file.scrap!.length === 1 ? 'area' : 'areas'} between parts ${file.scrap!.length === 1 ? 'is' : 'are'} scrap, not a part.`}
        </Typography>
      )}
      {kept > 0 && (
        <Typography data-testid="file-shape-kept" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {`${kept} ${kept === 1 ? 'part keeps' : 'parts keep'} the shape taken from the nesting file.`}
        </Typography>
      )}
      {file.notes.length > 0 && (
        <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5, color: 'var(--c-text-3)', overflowWrap: 'anywhere' }}>
          {file.notes.map((n) => <li key={n}>{n}</li>)}
        </Box>
      )}
      {file.plate && file.placements.length > 0 && (
        <Box sx={{ minWidth: 0 }}>
          <Button size="small" onClick={() => setLayout((o) => !o)}>{layout ? 'Hide the layout' : 'Show the layout'}</Button>
          <Collapse in={layout} unmountOnExit>
            {nest && <PlateDiagram nest={nest} kerfMm={file.plate.kerfMm} title={`${file.filename}: ${file.placed} parts`} />}
          </Collapse>
        </Box>
      )}
    </Box>
  );
}

export function NestFilesDialog({
  open, orderId, lineId, uploads, onClose, onSaved, onCompare,
}: {
  open: boolean;
  orderId: number;
  lineId: number;
  uploads: NestFileUpload[];
  onClose: () => void;
  /** The server wrote the plates: the panel reloads. The dialog stays open to offer the comparison. */
  onSaved: (result: NestFilesResult) => void;
  onCompare: () => void;
}) {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [plateCodes, setPlateCodes] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, Record<string, string>>>({});
  const [result, setResult] = useState<NestFilesResult | null>(null);
  const [seen, setSeen] = useState<Seen[]>([]);
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [done, setDone] = useState<NestFilesResult | null>(null);
  const ticket = useRef(0);
  const [tick, setTick] = useState(0);

  const requestFiles = useCallback((): NestFileUpload[] => uploads.map((u) => (plateCodes[u.filename] ? { ...u, plateCode: plateCodes[u.filename] } : u)), [uploads, plateCodes]);
  const choiceBody = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const [f, m] of Object.entries(choices)) { const kept = Object.fromEntries(Object.entries(m).filter(([, v]) => v)); if (Object.keys(kept).length) out[f] = kept; }
    return out;
  }, [choices]);

  // A new set of files starts over.
  useEffect(() => {
    if (!open) return;
    setMode('merge'); setPlateCodes({}); setChoices({}); setResult(null); setSeen([]); setError(null); setDone(null);
  }, [open, uploads]);

  // THE DRY RUN: on open, and again whenever a choice changes the request.
  const choiceKey = JSON.stringify(choiceBody);
  const plateKey = JSON.stringify(plateCodes);
  useEffect(() => {
    if (!open || !uploads.length || done) return undefined;
    const mine = ++ticket.current;
    setBusy('read'); setError(null);
    sendNestFiles(orderId, lineId, { files: requestFiles(), dryRun: true, mode, choices: choiceBody })
      .then((r) => {
        if (mine !== ticket.current) return;
        setResult(r);
        // Remember what needs a choice, so the chooser stays after the problem is gone.
        const found: Seen[] = [];
        for (const f of r.files) {
          const { errors } = problemsOf(f);
          for (const p of errors) {
            if (p.code === 'PART_AMBIGUOUS' && p.partId) {
              found.push({ key: `${f.filename}|${p.partId}`, filename: f.filename, kind: 'part', partId: p.partId, message: p.message,
                options: (p.choices ?? []).map((c) => (typeof c === 'string' ? { value: c, label: c }
                  : { value: c.key, label: `${c.code}${c.thickness ? ` · ${c.thickness} mm` : ''}${c.grade ? ` ${c.grade}` : ''}` })) });
            } else if (p.code === 'PLATE_AMBIGUOUS' || p.code === 'PLATE_NOT_FOUND' || p.code === 'PLATE_NOT_DRAWN') {
              found.push({ key: `${f.filename}|plate`, filename: f.filename, kind: 'plate', message: p.message,
                options: (p.choices ?? []).filter((c): c is string => typeof c === 'string').map((c) => ({ value: c, label: c })) });
            }
          }
        }
        if (found.length) setSeen((old) => [...old.filter((o) => !found.some((f) => f.key === o.key)), ...found]);
      })
      .catch((e) => { if (mine === ticket.current) { setResult(null); setError(e as CfApiError); } })
      .finally(() => { if (mine === ticket.current) setBusy(null); });
    return undefined;
    // requestFiles/choiceBody are derived from the keys below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uploads, mode, choiceKey, plateKey, orderId, lineId, tick]);

  const save = async () => {
    if (!result) return;
    setBusy('save'); setError(null);
    try {
      const out = await sendNestFiles(orderId, lineId, { files: requestFiles(), dryRun: false, mode, choices: choiceBody, force: result.needsForce });
      if (out.applied) { setDone(out); onSaved(out); } else setResult(out);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };

  const blocked = !!result && !result.canSave;
  const force = !!result && result.canSave && result.needsForce;
  const changes = result ? result.diff.added.length + result.diff.replaced.length + result.diff.removed.length : 0;
  const looseProblems = result ? looseSentences(result.problems, result) : [];
  const looseWarnings = result ? looseSentences(result.warnings, result) : [];
  const fileWord = `${uploads.length} ${uploads.length === 1 ? 'file' : 'files'}`;

  return (
    <Dialog open={open} onClose={busy === 'save' ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle>{done ? 'The customer’s nesting is saved' : 'Check the nesting files'}</DialogTitle>
      <DialogContent dividers>
        {done ? (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Alert severity="success" data-testid="nest-files-saved">{done.message || 'Saved.'}</Alert>
            <Typography sx={{ fontSize: 13.5 }}>
              Want to know if our own nesting would do better? Compare the two side by side. Nothing changes until you pick one.
            </Typography>
            {done.leftOver.length > 0 && <LeftOver leftOver={done.leftOver} toNest={done.totals?.leftOverToNest ?? null} />}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
            {busy === 'read' && (
              <Box role="status" sx={{ display: 'grid', gap: 0.5 }}>
                <Typography sx={{ fontSize: 13 }}>{`Reading ${fileWord}…`}</Typography>
                <LinearProgress />
              </Box>
            )}
            {error && (
              <Alert severity={error.code === 'CHANGED_MEANWHILE' ? 'warning' : 'error'} data-testid="nest-files-error" action={error.code === 'CHANGED_MEANWHILE' ? (
                <Button color="inherit" size="small" onClick={() => setTick((t) => t + 1)}>Reload</Button>
              ) : undefined}>{error.message}</Alert>
            )}
            {result && blocked && (
              <Alert severity="error" data-testid="nest-files-blocked">
                <Box sx={{ fontWeight: 600 }}>Nothing is saved. Fix what is listed under each file, then upload again.</Box>
                {looseProblems.length > 0 && (
                  <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
                    {looseProblems.map((p) => <li key={p}>{p}</li>)}
                  </Box>
                )}
              </Alert>
            )}
            {result && !blocked && (
              <Alert severity={force ? 'warning' : 'success'} data-testid="nest-files-status">
                <Box sx={{ fontWeight: 600 }}>
                  {force ? 'There are warnings. You can still save.' : 'These files can be saved.'}
                  {result.message ? ` ${result.message}` : ''}
                </Box>
                {looseWarnings.length > 0 && (
                  <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
                    {looseWarnings.map((p) => <li key={p}>{p}</li>)}
                  </Box>
                )}
              </Alert>
            )}

            {result && <DiffBlock result={result} />}

            <Box sx={{ display: 'grid', gap: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch checked={mode === 'replace'} disabled={busy != null}
                  slotProps={{ input: { 'aria-label': 'Replace everything with these files' } }}
                  onChange={(e) => setMode(e.target.checked ? 'replace' : 'merge')} />
                <Box sx={{ fontSize: 13.5 }}>Replace everything with these files</Box>
              </Box>
              <Typography data-testid="mode-line" sx={{ fontSize: 12.5, color: mode === 'replace' ? 'var(--c-warning-800)' : 'var(--c-text-2)' }}>
                {mode === 'replace'
                  ? REPLACE_WARNING
                  : 'Each file replaces the saved plate with the same nest number. New ones are added. Everything else stays.'}
              </Typography>
            </Box>

            {result && (
              <Box sx={{ minWidth: 0 }}>
                <CapsLabel>{`Files (${result.files.length})`}</CapsLabel>
                {result.files.map((f) => (
                  <FileRow key={f.filename} file={f} seen={seen}
                    plateCode={plateCodes[f.filename]} picked={choices[f.filename] ?? {}}
                    onPlate={(code) => setPlateCodes((o) => ({ ...o, [f.filename]: code }))}
                    onPick={(partId, value) => setChoices((o) => ({ ...o, [f.filename]: { ...(o[f.filename] ?? {}), [partId]: value } }))} />
                ))}
              </Box>
            )}

            {result && <LeftOver leftOver={result.leftOver} toNest={result.totals?.leftOverToNest ?? null} />}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {done ? (
          <>
            <Button onClick={onClose}>Done</Button>
            <Button variant="contained" onClick={onCompare}>Compare with auto nesting</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy === 'save'}>{blocked ? 'Close' : 'Cancel'}</Button>
            <Tooltip title={blocked ? 'Fix the problems first.' : changes === 0 && result ? 'Nothing would change.' : ''}>
              <span>
                <Button variant="contained" color={force ? 'warning' : 'primary'} onClick={save}
                  disabled={!result || blocked || busy != null || changes === 0}
                  startIcon={busy === 'save' ? <CircularProgress size={15} color="inherit" /> : undefined}>
                  {busy === 'save' ? 'Saving…' : force ? 'Save anyway' : 'Save'}
                </Button>
              </span>
            </Tooltip>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
