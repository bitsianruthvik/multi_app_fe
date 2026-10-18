import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { CfApiError } from '../../api/client';
import {
  previewNestFiles, sendNestFiles, type NestFileRead, type NestFileUpload, type NestFilesResult, type NestJob, type NestLeftOver, type NestPartRow, type NestPlatesAdded, type NestProblem,
} from '../../api/nesting';
import {
  REPLACE_WARNING, SHAPE_JOB_WORDS, SHAPE_SOURCE_WORDS, fileNest, kg, matchedByLine, mm, mmPair, needsPick, programWord, shapeSourceOfPiece, shapeSourceOnPlate,
  type ShapeSource,
} from '../../lib/nesting';
import { Badge, CapsLabel, Mono } from '../ui';
import { MissingAdded, NestMissingPlates } from './NestMissingPlates';
import { PartsTable, type PartSettle } from './NestPartsTable';
import { checkLines, reviewNames, reviewOf, type ReviewNames } from '../../lib/nestReview';
import { ReviewSections } from './NestReview';
import { usePlateChange } from './plateChangeContext';
import { PlateDiagram, PlateThumb } from './PlateDiagram';

/**
 * WHAT THE SHOP'S NESTING FILES WOULD DO — read, never written, until Save.
 *
 * Two kinds of file come in, in any mix (2026-10-13). A ProNest job (.nif) is
 * every nest of ONE plate thickness, and a nest may be cut on several identical
 * plates; a DXF is one plate. The server reads them all (dry run) and answers
 * with one entry per LAYOUT — a nest of a job, or a DXF — plus one line per job,
 * the DIFF against what the line already holds (added / replaced / unchanged /
 * removed, counted in plates), every problem as a sentence that already names
 * its file, plate and part, and what is left over.
 *
 * The review is grouped the way the files are: a header per job with its nests
 * under it, then the DXFs. With many nests the jobs start shut, one line each,
 * so six jobs still fit on a screen; a job with a problem starts open. A job
 * that cannot be read says why in its header and has no nests.
 *
 * Matching is read in ONE place, a parts table per job (and one for the DXFs): each
 * distinct part, the cut piece it went to and how. Any part can be given another cut
 * piece from a ranked list; that choice goes in the request like a plate choice does.
 *
 * The top reads by urgency (2026-10-14, NestReview.tsx): ONE headline ("Ready to
 * save 43 plates · 2 things to check"), a small line for what is left over, then
 * Must fix / Check / For information — a thing said on many nests is one line
 * with its nests, its sentences a click away. Cut pieces go by their short name
 * ("12 × 380 × 1400" and the part it is for), the full code on hover and under a
 * nest's Details. A nest row is two lines; its sentences are under Details.
 *
 * A blocker disables Save and the reason is said beside it; a warning that
 * needs force is listed once more in ONE confirmation, whose button is "Save
 * anyway". Choosing a plate or settling an ambiguous part changes the request,
 * so the dry run is sent again. Nothing here invents a sentence the server did
 * not say — a code this screen has never heard of is still shown, by its sentence.
 * Nothing in it is wider than the dialog: long codes wrap, tables wrap their cells.
 */

/** Above this many layouts the jobs start shut. */
const OPEN_ALL_UP_TO = 8;
/** Above this many lines the list of changes waits behind a button. */
const DIFF_LINES_SHOWN = 12;

/** Something the user has to settle before the files can be saved: which plate. (Which cut piece a part is has its own table.) */
interface Seen {
  key: string;
  /** The request's key: the uploaded file's name, for `plateCode` and for `choices`. */
  owner: string;
  /** Asked under one row (its entry's `filename`) — or, for a job, ONCE on the job (`job` = the .nif's name). */
  row?: string;
  job?: string;
  kind: 'plate';
  options: { value: string; label: string }[];
}

const isJobEntry = (f: NestFileRead) => f.sourceKind === 'pronest';
/** The uploaded file an entry came from: the .nif for a nest, itself for a DXF. */
const ownerOf = (f: NestFileRead) => (isJobEntry(f) ? f.sourceFile ?? f.filename : f.filename);
const uniq = <T,>(list: T[]): T[] => [...new Set(list)];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** How many DXF plates the answer holds. */
const groupsDxf = (r: NestFilesResult) => r.files.filter((f) => !isJobEntry(f)).length;

function DiffBlock({ result }: { result: NestFilesResult }) {
  const d = result.diff;
  const counts = [
    { key: 'added', label: 'Added', n: d.added.length, family: 'success' as const },
    { key: 'replaced', label: 'Replaced', n: d.replaced.length, family: 'info' as const },
    { key: 'unchanged', label: 'Unchanged', n: d.unchanged.length, family: 'neutral' as const },
    { key: 'removed', label: 'Removed', n: d.removed.length, family: 'warning' as const },
  ];
  const nothing = counts.every((c) => c.n === 0) && d.droppedAuto.length === 0;
  const lines = d.added.length + d.replaced.length + d.unchanged.length + d.removed.length + d.droppedAuto.length + d.droppedOurs.length;
  // Six jobs are sixty plates: the counts are the answer, the list is for whoever wants it.
  const long = lines > DIFF_LINES_SHOWN;
  const [all, setAll] = useState(false);
  return (
    <Box data-testid="nest-diff" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, minWidth: 0 }}>
      <CapsLabel>What changes on the line (plates)</CapsLabel>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        {counts.map((c) => <Badge key={c.key} family={c.family} noIcon label={`${c.label} ${c.n}`} />)}
        {long && (
          <Button size="small" data-testid="diff-toggle" aria-expanded={all} onClick={() => setAll((o) => !o)}>
            {all ? 'Hide the list' : `List all ${lines} changes`}
          </Button>
        )}
      </Box>
      {nothing && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nothing changes on the line.</Typography>}
      <Collapse in={!long || all} unmountOnExit>
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 13, overflowWrap: 'anywhere' }}>
          {d.added.map((a) => (
            <li key={`a${a.lotNo}${a.filename}`} data-diff="added">
              <strong>{`${a.lotNo} is new`}</strong>{` — ${a.filename} on ${a.plateCode}, ${plural(a.pieces, 'piece', 'pieces')}`}
              {a.parts.length > 0 && <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`: ${a.parts.map((p) => `${p.cutPlateCode} ×${p.qty}`).join(', ')}`}</Box>}
            </li>
          ))}
          {d.replaced.map((r) => (
            <li key={`r${r.lotId}`} data-diff="replaced">
              <strong>{`${r.lotNo} is replaced`}</strong>{` — ${r.filename}: was ${plural(r.was.pieces, 'piece', 'pieces')}, now ${r.now.pieces}`}
              <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` · ${r.moved} moved, ${r.added} added, ${r.removed} removed`}</Box>
              {r.parts.length > 0 && (
                <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`. ${r.parts.map((p) => `${p.cutPlateCode} ${p.was ?? 0} → ${p.now ?? 0}`).join(', ')}`}</Box>
              )}
              {r.droppedOurs && r.droppedOurs.length > 0 && (
                <Box sx={{ color: 'var(--c-warning-800)' }}>{`AI's additions on this plate are dropped: ${r.droppedOurs.map((p) => `${p.cutPlateCode} ×${p.qty}`).join(', ')}.`}</Box>
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
              <strong>{`${x.lotNo} is removed`}</strong>{` — ${x.plateCode}, ${plural(x.pieces, 'piece goes', 'pieces go')} back to left over`}
              {/* A job uploaded again takes its old plates with it; the server says so. */}
              {x.because && <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` (${x.because})`}</Box>}
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
              <strong>{`AI's additions on ${x.lotNo} are dropped`}</strong>
              <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` — ${x.because}.`}</Box>
            </li>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * §61: pieces marked as cut from untracked offcuts that these files nest are COVERED by them — the
 * mark shrinks. Said on the headline, never silent: "2 pieces cut from offcuts are in these files
 * now — the mark drops: 12 × 380 × 1400 6 → 4."
 */
function UntrackedShrinks({ untracked, names, done = false }: { untracked: NestFilesResult['untracked']; names: ReviewNames | null; done?: boolean }) {
  if (!untracked?.shrinks.length) return null;
  const covered = untracked.shrinks.reduce((a, x) => a + x.was - x.now, 0);
  const each = untracked.shrinks.map((x) => `${names?.name(x.cutPlateCode).short ?? x.cutPlateCode} ${x.was} → ${x.now}`).join(', ');
  return (
    <Box data-testid="nest-untracked-shrinks" sx={{ fontSize: 13 }} title={untracked.message ?? undefined}>
      {`${plural(covered, 'piece marked as cut from offcuts is', 'pieces marked as cut from offcuts are')} in these files now — the mark ${done ? 'dropped' : 'drops'}: ${each}.`}
    </Box>
  );
}

function LeftOver({ leftOver, toNest, names = null }: { leftOver: NestLeftOver[]; toNest: number | null; names?: ReviewNames | null }) {
  const total = leftOver.reduce((a, l) => a + l.qty, 0);
  return (
    <Box data-testid="nest-leftover" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
      <CapsLabel>{`Left over on this line${total ? ` (${total})` : ''}`}</CapsLabel>
      {leftOver.length === 0
        ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Every piece the line needs is on a plate.</Typography>
        : (
          <>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              {`These cut pieces of the line are not on any plate yet. Upload more files for them, or “Nest the rest by AI” will place them${toNest != null ? ` (${toNest} of them)` : ''}.`}
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3, fontSize: 13, overflowWrap: 'anywhere' }}>
              {leftOver.map((l) => {
                const n = names?.name(l.cutPlateCode);
                // A short name already is the size: the size is then not said twice.
                const short = !!n && n.short !== l.cutPlateCode;
                return (
                  <li key={l.cutPlateId}>
                    {short
                      ? <Tooltip title={n.title}><Box component="span" data-testid="cut-piece-name" data-code={l.cutPlateCode}>{n.short}</Box></Tooltip>
                      : <Mono>{l.cutPlateCode}</Mono>}
                    {` ×${l.qty}`}
                    <Box component="span" sx={{ color: 'var(--c-text-2)' }}>
                      {n?.part ? ` · ${n.part}` : ''}
                      {!short && l.length && l.width ? ` · ${mmPair(l.length, l.width)}` : ''}{!short && l.thickness ? ` · ${mm(l.thickness)} mm` : ''}{l.grade ? ` ${short ? '· ' : ''}${l.grade}` : ''}
                      {l.manual ? ' · held back by hand' : ''}{l.leftOut ? ' · left out of nesting' : ''}
                    </Box>
                  </li>
                );
              })}
            </Box>
          </>
        )}
    </Box>
  );
}

/** Problems in the server's own sentences. A code this screen does not know is shown like any other. */
function ProblemList({ list, tone }: { list: NestProblem[]; tone: 'danger' | 'warning' }) {
  const said = uniq(list.map((p) => p.message || p.code).filter(Boolean));
  if (!said.length) return null;
  return (
    <Box component="ul" data-testid={tone === 'danger' ? 'file-errors' : 'file-warnings'} sx={{
      m: 0, pl: 2.5, display: 'grid', gap: 0.3, fontSize: 12.5, overflowWrap: 'anywhere',
      color: tone === 'danger' ? 'var(--c-danger-700, var(--c-danger-800))' : 'var(--c-warning-800)',
    }}>
      {said.map((m) => <li key={m}>{m}</li>)}
    </Box>
  );
}

/** One plate to settle: a pick list, or — for a plate the catalog could not offer — a typed plate code. */
function Chooser({ seen, value, onChange, disabled }: { seen: Seen; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [typed, setTyped] = useState(value);
  const help = seen.job ? 'The plate you name is used for every nest of this job.' : undefined;
  return (
    <Box data-testid="plate-picker" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap', minWidth: 0 }}>
      {seen.options.length === 0 ? (
        <>
          <TextField size="small" label="Plate code" value={typed} onChange={(e) => setTyped(e.target.value)} helperText={help} sx={{ minWidth: 180 }} />
          <Button size="small" variant="outlined" disabled={!typed.trim() || disabled} onClick={() => onChange(typed.trim())} sx={{ mt: 0.25 }}>Use this plate</Button>
        </>
      ) : (
        <TextField select size="small" sx={{ minWidth: 240, maxWidth: '100%' }} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          label="Which plate?" helperText={help} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {seen.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </TextField>
      )}
    </Box>
  );
}

interface Settle extends PartSettle {
  seen: Seen[];
  plateCodes: Record<string, string>;
  onPlate: (owner: string, code: string) => void;
}

function Choosers({ list, settle }: { list: Seen[]; settle: Settle }) {
  return (
    <>
      {list.map((s) => (
        <Chooser key={s.key} seen={s} disabled={settle.busy}
          value={settle.plateCodes[s.owner] ?? ''} onChange={(v) => settle.onPlate(s.owner, v)} />
      ))}
    </>
  );
}

/** What the plates of one layout do to the line: one word, or the split when a ×4 nest has one new plate and three unchanged. */
function actionWords(file: NestFileRead): string | null {
  const word = (a: string | null | undefined, n: number) => (
    a === 'add' ? (n > 1 ? `${n} new plates` : 'New plate')
      : a === 'replace' ? (n > 1 ? `Replaces ${n} saved plates` : 'Replaces a saved plate')
        : a === 'unchanged' ? (n > 1 ? `${n} unchanged` : 'Unchanged') : null);
  const copies = file.copies ?? [];
  if (copies.length < 2) return word(file.action, 1);
  const by = new Map<string, number>();
  for (const c of copies) if (c.action) by.set(c.action, (by.get(c.action) ?? 0) + 1);
  return [...by].map(([a, n]) => word(a, n)).filter(Boolean).join(' · ') || null;
}

/** The impact class a plate was picked by, read off the server's note — the note itself stays the tooltip. */
const IMPACT_NOTE = /was chosen among plates of this size, thickness and grade because the cut pieces on the nest are (\S+)\.$/;

/** A small fact on a nest row; its sentence on hover. */
function Fact({ label, title, family = 'neutral', testId }: { label: string; title?: string; family?: 'neutral' | 'warning' | 'danger' | 'info'; testId?: string }) {
  return <Box component="span" data-testid={testId ?? 'nest-fact'}><Badge family={family} noIcon label={label} title={title} /></Box>;
}

/**
 * One layout: a DXF file, or one nest of a ProNest job. At most two lines — what
 * it is and its facts, then its cut pieces by short name — plus what blocks it.
 * Everything else (the plate's sentences, its warnings, the full codes) is under
 * "Details", which is folded, not left out.
 */
function FileRow({ file, settle, names, sharedShape }: { file: NestFileRead; settle: Settle; names: ReviewNames | null; sharedShape: ShapeSource | null }) {
  const [layout, setLayout] = useState(false);
  const [lots, setLots] = useState(false);
  const [more, setMore] = useState(false);
  const inJob = isJobEntry(file);
  const { errors, warnings } = file;
  const outside = errors.filter((e) => e.code === 'OUTSIDE_PLATE');
  const kept = file.placements.filter((p) => p.shapeFrom === 'nesting file').length;
  // The plate as the file drew it: a small picture always, the full drawing on request.
  const nest = useMemo(() => (file.plate && file.placements.length > 0 ? fileNest(file) : null), [file]);
  const allMatched = file.parts > 0 && file.placed === file.parts;
  const action = actionWords(file);
  const qty = file.nestQuantity ?? 1;
  const lotNos = file.lotNos?.length ? file.lotNos : (file.copies ?? []).map((c) => c.lotNo);
  const safeId = file.filename.replace(/[^\w-]/g, '_');
  const title = inJob && file.jobNestNo != null ? `Nest ${file.jobNestNo}${file.jobNests ? ` of ${file.jobNests}` : ''}` : file.filename;
  const warned = uniq(warnings.map((w) => w.message || w.code));
  const failed = uniq(errors.map((e) => e.message || e.code));
  const impact = file.notes.map((n) => ({ n, m: IMPACT_NOTE.exec(n) })).find((x) => x.m);
  const name = (code: string) => names?.name(code) ?? { code, short: code, part: null, parts: [], title: code };
  const plateSize = file.plate ? `${mm(Math.min(file.plate.length, file.plate.width))} × ${mm(Math.max(file.plate.length, file.plate.width))}` : '';
  const dot = <Box component="span" aria-hidden sx={{ color: 'var(--c-text-3)' }}>·</Box>;
  return (
    <Box data-testid="nest-file" data-file={file.filename} data-kind={inJob ? 'pronest' : 'dxf'} sx={{
      py: 1, borderBottom: '1px solid var(--c-divider)', display: 'grid', columnGap: 1.5, alignItems: 'start', minWidth: 0,
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: nest ? '96px minmax(0, 1fr)' : 'minmax(0, 1fr)' },
    }}>
      {nest && (
        <Box data-testid="file-thumb" sx={{ display: { xs: 'none', sm: 'block' }, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', mt: 0.25 }}>
          <PlateThumb nest={nest} width={94} />
        </Box>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
        {/* Line 1: what it is, and its own facts. */}
        <Box data-testid="file-line" sx={{ display: 'flex', columnGap: 0.75, rowGap: 0.25, alignItems: 'center', flexWrap: 'wrap', minWidth: 0, fontSize: 13, color: 'var(--c-text-2)' }}>
          <Box component="span" data-testid="file-title" sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)', overflowWrap: 'anywhere', minWidth: 0 }}>{title}</Box>
          {inJob && qty > 1 && (
            // The lot numbers are there on demand: four of them on every row would bury the row.
            <Button size="small" variant="outlined" data-testid="nest-quantity" aria-expanded={lots} aria-controls={`nest-lots-${safeId}`}
              onClick={() => setLots((o) => !o)} sx={{ minWidth: 0, py: 0, px: 0.75, fontSize: 12.5 }}>
              {`× ${qty} plates`}
            </Button>
          )}
          {inJob && qty <= 1 && file.lotNo && <>{dot}<Mono sx={{ overflowWrap: 'anywhere' }}>{file.lotNo}</Mono></>}
          {!inJob && file.nestNo && <>{dot}<span>{`Nest ${file.nestNo}`}</span></>}
          {dot}
          {file.plate
            ? <Box component="span" data-testid="file-plate" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}><Mono>{file.plate.code}</Mono>{` (${plateSize})`}</Box>
            : <span>No plate found yet</span>}
          {dot}
          <Box component="span" data-testid="file-matched" sx={{ fontWeight: 500, color: allMatched ? 'var(--c-success-800)' : 'var(--c-warning-800)' }}>{`${file.placed} of ${file.parts} matched`}</Box>
          {file.metrics?.wastePct != null && <>{dot}<span>{`${file.metrics.wastePct.toFixed(1)}% waste`}</span></>}
          {failed.length > 0 && <Fact family="danger" label={`${failed.length} to fix`} testId="nest-fact-fix" />}
          {warned.length > 0 && <Fact family="warning" label={`${warned.length} to check`} title={warned.join(' · ')} testId="nest-fact-check" />}
          {impact && <Fact label={`${impact.m?.[1]} plate — from cut pieces`} title={impact.n} testId="nest-fact-impact" />}
          {action && <Fact label={action} testId="nest-fact-action" />}
        </Box>
        {inJob && qty > 1 && (
          <Collapse in={lots} unmountOnExit>
            <Box id={`nest-lots-${safeId}`} data-testid="nest-lots" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
              {`This nest is cut on ${qty} identical plates: `}<Mono>{lotNos.join(', ')}</Mono>
            </Box>
          </Collapse>
        )}
        {/* Line 2: its cut pieces, by short name; the full code on hover and under Details. */}
        {file.counts.length > 0 && (
          <Box data-testid="file-pieces" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
            {file.counts.map((c) => {
              // Where the shape comes from, as the server says it on the placements — said here only when the job's header does not say it for all.
              const from = shapeSourceOnPlate(file.placements, c.cutPlateId);
              const n = name(c.cutPlateCode);
              return (
                <Tooltip key={c.cutPlateId} title={n.title}>
                  <Box component="span" data-testid="cut-piece-chip" data-code={c.cutPlateCode} sx={{
                    display: 'inline-flex', gap: 0.5, flexWrap: 'wrap', maxWidth: '100%', minWidth: 0, overflowWrap: 'anywhere', fontSize: 12,
                    background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.15,
                  }}>
                    <span>{n.short}</span>
                    {n.part && <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{n.part}</Box>}
                    <span>{`×${c.qty}`}</span>
                    {from && from !== sharedShape && <Box component="span" data-testid="shape-from" data-shape={from} sx={{ color: 'var(--c-text-3)' }}>{SHAPE_SOURCE_WORDS[from]}</Box>}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        )}
        {/* What blocks the save is never folded away. */}
        <ProblemList list={errors} tone="danger" />
        <Choosers list={settle.seen.filter((s) => s.row === file.filename)} settle={settle} />
        {outside.length > 0 && (
          <Typography data-testid="file-outside" sx={{ fontSize: 12.5, color: 'var(--c-danger-700, var(--c-danger-800))' }}>
            {`${outside.length} ${outside.length === 1 ? 'part runs' : 'parts run'} off the plate and ${outside.length === 1 ? 'is' : 'are'} not counted as nested: ${outside.map((e) => e.cutPlateCode ?? e.partId ?? 'a part').join(', ')}.`}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <Button size="small" data-testid="file-details-toggle" aria-expanded={more} aria-controls={`nest-more-${safeId}`} onClick={() => setMore((o) => !o)}
            endIcon={more ? <ExpandMoreRounded /> : <ChevronRightRounded />}>
            Details
          </Button>
          {file.plate && file.placements.length > 0 && (
            <Button size="small" aria-expanded={layout} onClick={() => setLayout((o) => !o)}>{layout ? 'Hide the layout' : 'Show the layout'}</Button>
          )}
        </Box>
        {/* Folded, not left out: every sentence of the row is here. */}
        <Collapse in={more}>
          <Box id={`nest-more-${safeId}`} data-testid="file-details" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0, fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
            <Box>
              {file.plate
                ? <>{`Plate ${file.plate.code} · ${mmPair(file.plate.length, file.plate.width)} as drawn`}{file.plate.resolvedBy ? ` · found by ${file.plate.resolvedBy}` : ''}</>
                : 'No plate found yet'}
              {file.metrics?.wastePct != null ? ` · ${file.metrics.wastePct.toFixed(1)}% waste · ${kg(file.metrics.wasteKgTotal)} kg` : ''}
            </Box>
            {file.counts.length > 0 && (
              <Box data-testid="file-codes">{`Cut pieces: ${file.counts.map((c) => `${c.cutPlateCode} ×${c.qty}`).join(', ')}`}</Box>
            )}
            <ProblemList list={warnings} tone="warning" />
            {file.scrap && file.scrap.length > 0 && (
              <Box data-testid="file-scrap">
                {`${file.scrap.length} ${file.scrap.length === 1 ? 'area' : 'areas'} between parts ${file.scrap.length === 1 ? 'is' : 'are'} scrap, not a part.`}
              </Box>
            )}
            {/* On a ProNest nest EVERY part keeps the nesting file's outline: the job's header says it once. */}
            {!inJob && kept > 0 && (
              <Box data-testid="file-shape-kept">{`${kept} ${kept === 1 ? 'part keeps' : 'parts keep'} the shape taken from the nesting file.`}</Box>
            )}
            {file.notes.length > 0 && (
              <Box component="ul" data-testid="file-notes" sx={{ m: 0, pl: 2.5, color: 'var(--c-text-3)' }}>
                {file.notes.map((n) => <li key={n}>{n}</li>)}
              </Box>
            )}
          </Box>
        </Collapse>
        {layout && nest && file.plate && <PlateDiagram nest={nest} kerfMm={file.plate.kerfMm} title={`${title}: ${file.placed} parts`} />}
      </Box>
    </Box>
  );
}

/** A job the answer's `jobs` list does not carry (an older API): its line is worked out from its nests. */
function jobFromNests(filename: string, nests: NestFileRead[]): NestJob {
  const first = nests[0];
  const times = (f: NestFileRead) => f.nestQuantity ?? 1;
  return {
    filename, sourceKind: 'pronest', program: first?.program ?? null, version: first?.version ?? null, jobName: first?.jobName ?? null,
    status: nests.some((f) => f.status === 'error') ? 'error' : nests.some((f) => f.status === 'warning') ? 'warning' : 'ok',
    nests: nests.filter((f) => f.jobNestNo != null).length, plates: nests.reduce((a, f) => a + (f.jobNestNo != null ? times(f) : 0), 0), parts: 0,
    placed: nests.reduce((a, f) => a + f.parts * times(f), 0), matched: nests.reduce((a, f) => a + f.placed * times(f), 0),
    matchedBy: {}, partRows: [], notNested: [], notes: [],
  };
}

/** One ProNest job file: its header line, what could not be read or is not nested, and its nests. */
function JobBlock({ job, entries, open, onToggle, settle, names }: {
  job: NestJob; entries: NestFileRead[]; open: boolean; onToggle: () => void; settle: Settle; names: ReviewNames | null;
}) {
  const [notNestedOpen, setNotNestedOpen] = useState(false);
  const nests = entries.filter((f) => f.jobNestNo != null);
  // A job that could not be read is one entry with no nest number: its sentences belong to the job.
  const whole = entries.filter((f) => f.jobNestNo == null);
  const jobErrors = uniq([...(job.error?.message ? [job.error.message] : []), ...whole.flatMap((f) => f.errors.map((e) => e.message || e.code))]);
  const jobWarnings = uniq(whole.flatMap((f) => f.warnings.map((w) => w.message || w.code)));
  const problems = uniq(nests.flatMap((f) => f.errors.map((e) => e.message))).length;
  const warns = uniq(nests.flatMap((f) => f.warnings.map((w) => w.message))).length;
  const unreadable = jobErrors.length > 0;
  const name = job.jobName || job.filename;
  const id = `nest-job-${job.filename.replace(/[^\w-]/g, '_')}`;
  const matchedBy = matchedByLine(job.matchedBy);
  const short = job.notNested.reduce((a, p) => a + p.notNested, 0);
  const mine = settle.seen.filter((s) => s.job === job.filename);
  // Where the job's shapes come from, said once here when every piece agrees (a ProNest nest is always "nesting file").
  const sources = new Set(nests.flatMap((f) => f.placements.map(shapeSourceOfPiece)));
  const sharedShape = sources.size === 1 ? [...sources][0] : null;
  const canOpen = nests.length > 0 || job.partRows.length > 0;
  return (
    <Box data-testid="nest-job" data-job={job.filename} data-status={unreadable ? 'error' : job.status} sx={{
      border: '1px solid', borderColor: unreadable ? 'var(--c-danger-200, var(--c-border))' : 'var(--c-border)', borderRadius: 'var(--r-md)', minWidth: 0, overflow: 'hidden',
    }}>
      <Box component="button" type="button" data-testid="job-header" onClick={canOpen ? onToggle : undefined} disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined} aria-controls={canOpen ? id : undefined}
        sx={{
          display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', width: '100%', minWidth: 0, p: 1.25, textAlign: 'left', font: 'inherit', color: 'inherit',
          background: 'var(--c-surface-2)', border: 0, cursor: canOpen ? 'pointer' : 'default',
          '&:focus-visible': { outline: '2px solid var(--c-primary-600)', outlineOffset: -2 },
        }}>
        {canOpen && (open ? <ExpandMoreRounded aria-hidden sx={{ fontSize: 20, color: 'var(--c-text-2)' }} /> : <ChevronRightRounded aria-hidden sx={{ fontSize: 20, color: 'var(--c-text-2)' }} />)}
        <Box component="span" sx={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>{name}</Box>
        <Box component="span" data-testid="job-counts" sx={{ fontSize: 13, color: 'var(--c-text-2)', minWidth: 0, overflowWrap: 'anywhere' }}>
          {unreadable
            ? [programWord(job.program, job.version), job.jobName ? job.filename : null].filter(Boolean).join(' · ')
            : (
              <>
                {`${programWord(job.program, job.version)} · ${plural(job.nests, 'nest', 'nests')} · ${plural(job.plates, 'plate', 'plates')} · ${plural(job.placed, 'piece', 'pieces')}, `}
                <Box component="span" sx={{ fontWeight: 500, color: job.matched === job.placed ? 'var(--c-success-800)' : 'var(--c-warning-800)' }}>{`${job.matched} matched`}</Box>
              </>
            )}
        </Box>
        <Box component="span" sx={{ ml: 'auto', display: 'inline-flex', gap: 0.5, flexWrap: 'wrap' }}>
          {unreadable && <Badge family="danger" label="Cannot be read" />}
          {!unreadable && problems > 0 && <Badge family="danger" noIcon label={plural(problems, 'problem', 'problems')} />}
          {!unreadable && warns > 0 && <Badge family="warning" noIcon label={plural(warns, 'warning', 'warnings')} />}
          {!unreadable && problems === 0 && warns === 0 && <Badge family="success" noIcon label="Read" />}
        </Box>
      </Box>

      {(unreadable || jobWarnings.length > 0 || matchedBy || sharedShape || mine.length > 0 || job.notNested.length > 0) && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75, px: 1.25, py: 1, minWidth: 0, borderTop: '1px solid var(--c-divider)' }}>
          {/* Why the whole job is refused, and what to do, in the server's sentence. Never behind a click. */}
          {unreadable && (
            <Alert severity="error" data-testid="job-error" sx={{ overflowWrap: 'anywhere' }}>
              <Box sx={{ fontWeight: 600 }}>Nothing of this job file is taken.</Box>
              {jobErrors.map((m) => <Box key={m}>{m}</Box>)}
            </Alert>
          )}
          {jobWarnings.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3, fontSize: 12.5, color: 'var(--c-warning-800)', overflowWrap: 'anywhere' }}>
              {jobWarnings.map((m) => <li key={m}>{m}</li>)}
            </Box>
          )}
          {sharedShape && (
            <Box data-testid="job-shape-from" data-shape={sharedShape} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{SHAPE_JOB_WORDS[sharedShape]}</Box>
          )}
          {matchedBy && (
            <Box data-testid="job-matched-by" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{`Pieces matched ${matchedBy}`}</Box>
          )}
          <Choosers list={mine} settle={settle} />
          {job.notNested.length > 0 && (
            <Box data-testid="job-not-nested" sx={{ minWidth: 0 }}>
              <Button size="small" color="warning" aria-expanded={notNestedOpen} onClick={() => setNotNestedOpen((o) => !o)}
                endIcon={notNestedOpen ? <ExpandMoreRounded /> : <ChevronRightRounded />}>
                {`${plural(job.notNested.length, 'part of this job is', 'parts of this job are')} not fully nested (${plural(short, 'piece', 'pieces')})`}
              </Button>
              <Collapse in={notNestedOpen} unmountOnExit>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', pb: 0.25 }}>
                  ProNest still shows these as required. They are named as the job names them.
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.3, fontSize: 12.5, overflowWrap: 'anywhere' }}>
                  {job.notNested.map((p) => (
                    <li key={p.name}>
                      <Mono>{p.name}</Mono>
                      <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{` — needs ${p.required}, nested ${p.nested}, ${p.notNested} not nested`}</Box>
                    </li>
                  ))}
                </Box>
              </Collapse>
            </Box>
          )}
        </Box>
      )}

      {canOpen && (
        <Collapse in={open} unmountOnExit>
          <Box id={id} sx={{ px: 1.25, pb: 0.5, minWidth: 0, borderTop: '1px solid var(--c-divider)' }}>
            {job.partRows.length > 0 && (
              <Box sx={{ pt: 1, pb: 0.5, minWidth: 0 }}>
                <PartsTable rows={job.partRows} job={job.filename} settle={settle} label={`Parts of ${name}`} names={names?.name} />
              </Box>
            )}
            {/* The job's notes are said once, under "For information" at the top. */}
            {nests.map((f) => <FileRow key={f.filename} file={f} settle={settle} names={names} sharedShape={sharedShape} />)}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

/** Which plate an answer needs named. One entry per plate of a DXF / per job. (A part's cut piece is asked in the parts table.) */
function findChoices(r: NestFilesResult): Seen[] {
  const found = new Map<string, Seen>();
  const add = (s: Seen) => {
    const had = found.get(s.key);
    // The same question from several nests is asked once, with every option any of them offered.
    if (had) had.options = [...had.options, ...s.options.filter((o) => !had.options.some((x) => x.value === o.value))];
    else found.set(s.key, s);
  };
  for (const f of r.files) {
    const owner = ownerOf(f);
    const where = isJobEntry(f) ? { job: owner } : { row: f.filename };
    for (const p of f.errors) {
      if (p.code === 'PLATE_AMBIGUOUS' || p.code === 'PLATE_NOT_FOUND' || p.code === 'PLATE_NOT_DRAWN') {
        add({ key: `${owner}|plate`, owner, ...where, kind: 'plate',
          options: (p.choices ?? []).filter((c): c is string => typeof c === 'string').map((c) => ({ value: c, label: c })) });
      }
    }
  }
  return [...found.values()];
}

export function NestFilesDialog({
  open, orderId, lineId, uploads, onClose, onSaved, canEditCatalog = false,
}: {
  open: boolean;
  orderId: number;
  lineId: number;
  uploads: NestFileUpload[];
  onClose: () => void;
  /** The server wrote the plates: the panel reloads. The dialog stays open to say what was saved. */
  onSaved: (result: NestFilesResult) => void;
  /** May add plate sizes to the catalog (cf_erp_catalog_manage). */
  canEditCatalog?: boolean;
}) {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [plateCodes, setPlateCodes] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, Record<string, string>>>({});
  const [result, setResult] = useState<NestFilesResult | null>(null);
  const [seen, setSeen] = useState<Seen[]>([]);
  // Which jobs are open: what the user set, and the ones a problem opened (they stay open once the problem is settled).
  const [jobsOpen, setJobsOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const plateChange = usePlateChange();
  const [error, setError] = useState<CfApiError | null>(null);
  const [done, setDone] = useState<NestFilesResult | null>(null);
  // The one confirmation a save with warnings asks for.
  const [confirm, setConfirm] = useState(false);
  // What was just added to the catalog: kept while the preview runs again, dropped when new files come in.
  const [added, setAdded] = useState<NestPlatesAdded | null>(null);
  const ticket = useRef(0);
  const [tick, setTick] = useState(0);

  // A plate code goes on the uploaded FILE: for a .nif that is every nest of the job.
  const requestFiles = useCallback((): NestFileUpload[] => uploads.map((u) => (plateCodes[u.filename] ? { ...u, plateCode: plateCodes[u.filename] } : u)), [uploads, plateCodes]);
  const choiceBody = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const [f, m] of Object.entries(choices)) { const kept = Object.fromEntries(Object.entries(m).filter(([, v]) => v)); if (Object.keys(kept).length) out[f] = kept; }
    return out;
  }, [choices]);

  // A new set of files starts over.
  useEffect(() => {
    if (!open) return;
    setMode('merge'); setPlateCodes({}); setChoices({}); setResult(null); setSeen([]); setJobsOpen({}); setError(null); setDone(null); setConfirm(false); setAdded(null);
  }, [open, uploads]);

  // THE DRY RUN: on open, and again whenever a choice changes the request.
  const choiceKey = JSON.stringify(choiceBody);
  const plateKey = JSON.stringify(plateCodes);
  useEffect(() => {
    if (!open || !uploads.length || done) return undefined;
    const mine = ++ticket.current;
    setBusy('read'); setError(null);
    previewNestFiles(orderId, lineId, { files: requestFiles(), mode, choices: choiceBody })
      .then((r) => {
        if (mine !== ticket.current) return;
        setResult(r);
        // Remember what needs a choice, so the chooser stays after the problem is gone.
        const found = findChoices(r);
        if (found.length) setSeen((old) => [...old.filter((o) => !found.some((f) => f.key === o.key)), ...found]);
        // A job with a problem opens by itself; what the user already set wins.
        const bad = [...r.files.filter((f) => isJobEntry(f) && f.status === 'error').map(ownerOf),
          ...r.jobs.filter((j) => j.partRows.some(needsPick)).map((j) => j.filename)];
        if (bad.length) setJobsOpen((old) => ({ ...Object.fromEntries(bad.map((b) => [b, true])), ...old }));
      })
      .catch((e) => { if (mine === ticket.current) { setResult(null); setError(e as CfApiError); } })
      .finally(() => { if (mine === ticket.current) setBusy(null); });
    return undefined;
    // requestFiles/choiceBody are derived from the keys below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uploads, mode, choiceKey, plateKey, orderId, lineId, tick]);

  const save = async () => {
    if (!result) return;
    setConfirm(false);
    setBusy('save'); setError(null);
    try {
      const out = await plateChange.submit('Save these nesting files',
        (f) => sendNestFiles(orderId, lineId, { files: requestFiles(), dryRun: false, mode, choices: choiceBody, force: result.needsForce, ...f }),
        // Sent for approval (a PO covers the line): nothing is saved — the sheet says what it would do; this dialog is done.
        { onSent: onClose });
      if (out == null) return;
      if (out.applied) { setDone(out); onSaved(out); } else setResult(out);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };

  // ---- the answer, grouped the way the files are -----------------------------
  const groups = useMemo(() => {
    const files = result?.files ?? [];
    const dxf = files.filter((f) => !isJobEntry(f));
    const jobEntries = files.filter(isJobEntry);
    const named = result?.jobs ?? [];
    const extra = uniq(jobEntries.map(ownerOf)).filter((name) => !named.some((j) => j.filename === name));
    const jobs = [...named, ...extra.map((name) => jobFromNests(name, jobEntries.filter((f) => ownerOf(f) === name)))]
      .map((job) => ({ job, entries: jobEntries.filter((f) => ownerOf(f) === job.filename) }));
    return { dxf, jobs };
  }, [result]);
  const rows = result ? result.files.filter((f) => !isJobEntry(f) || f.jobNestNo != null) : [];
  const unreadJobs = groups.jobs.filter((g) => g.job.error || g.entries.some((f) => f.jobNestNo == null && f.status === 'error'));
  const manyRows = rows.length > OPEN_ALL_UP_TO;
  // A part's cut piece goes in `choices`: a job's under the job file and the part NAME, a DXF part under its file and each of its part ids.
  const slots = (job: string | null, row: NestPartRow): [string, string][] => (job != null
    ? [[job, row.partName ?? row.key]]
    : (row.files ?? []).flatMap((f) => f.partIds.map((id): [string, string] => [f.filename, id])));
  const settle: Settle = {
    seen, plateCodes, busy: busy != null,
    onPlate: (owner, code) => setPlateCodes((o) => ({ ...o, [owner]: code })),
    hasChoice: (job, row) => slots(job, row).some(([f, k]) => !!choices[f]?.[k]),
    choose: (job, row, cutPlateId) => setChoices((old) => {
      const next: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(old).map(([f, m]) => [f, { ...m }]));
      for (const [f, k] of slots(job, row)) {
        if (cutPlateId == null) { delete next[f]?.[k]; if (next[f] && !Object.keys(next[f]).length) delete next[f]; }
        else next[f] = { ...(next[f] ?? {}), [k]: `cp${cutPlateId}` };
      }
      return next;
    }),
  };
  // Parts with no cut piece yet, over every job and the DXFs: what Save is waiting for.
  const toChoose = (result?.dxfPartRows ?? []).filter(needsPick).length + (result?.jobs ?? []).reduce((a, j) => a + j.partRows.filter(needsPick).length, 0);
  const fromJobs = (result?.jobs ?? []).some((j) => j.partRows.some(needsPick));

  const blocked = !!result && !result.canSave;
  const force = !!result && result.canSave && result.needsForce;
  const changes = result ? result.diff.added.length + result.diff.replaced.length + result.diff.removed.length : 0;
  // The names, places and groups of the review: worked out once per answer.
  const names = useMemo(() => (result ? reviewNames(result) : null), [result]);
  const review = useMemo(() => (result && names ? reviewOf(result, names) : null), [result, names]);
  // The Save-anyway confirmation lists the "Check" lines in the same short form.
  const checked = result && names && review ? uniq(checkLines(review, result, names)) : [];
  const forceList = checked.length ? checked : uniq(result?.warnings ?? []);
  const fileWord = plural(uploads.length, 'file', 'files');
  // What Save writes, in PLATES: the diff counts a nest cut on four plates as four.
  const plates = result ? result.diff.added.length + result.diff.replaced.length : 0;
  const saveLabel = plates > 0 ? `Save ${plural(plates, 'plate', 'plates')}` : 'Save';
  // ONE headline: can it be saved, and how many kinds of thing to fix or check.
  const toFix = review?.fix.length ?? 0;
  const toCheck = review?.check.length ?? 0;
  const cannot = blocked && (toFix > 0 || changes > 0);
  const headline = !result ? ''
    : cannot ? `Can't save yet${toFix ? ` · ${plural(toFix, 'thing', 'things')} to fix` : ''}`
      : changes === 0 ? 'Nothing to save — these files change nothing on the line'
        : `Ready to save ${plural(plates, 'plate', 'plates')}${toCheck ? ` · ${plural(toCheck, 'thing', 'things')} to check` : ''}`;
  // Left over is its own small line, not part of the headline.
  const leftPieces = result ? result.leftOver.filter((l) => !l.manual && !l.leftOut).reduce((a, l) => a + l.qty, 0) : 0;
  const nestCount = (result?.jobs ?? []).reduce((a, j) => a + j.nests, 0);
  const jobPlates = (result?.jobs ?? []).reduce((a, j) => a + j.plates, 0);
  const readLine = !result ? '' : [
    `${fileWord} read`,
    ...((result.jobs.length) ? [`${plural(result.jobs.length, 'ProNest job', 'ProNest jobs')}: ${plural(nestCount, 'nest', 'nests')}, ${plural(jobPlates, 'plate', 'plates')}`] : []),
    ...(groupsDxf(result) ? [plural(groupsDxf(result), 'DXF plate', 'DXF plates')] : []),
  ].join(' · ');
  const hasJobs = groups.jobs.length > 0;
  // Said beside the button, not only on hover: why it cannot be pressed.
  const saveWhy = !result ? null
    : blocked && toChoose > 0 ? (toChoose === 1
      ? `1 part is not matched to a cut piece — choose one, or remove it from the ${fromJobs ? 'job' : 'upload'}`
      : `${toChoose} parts are not matched to a cut piece — choose one for each, or remove them from the ${fromJobs ? 'job' : 'upload'}`)
    : blocked ? (hasJobs ? 'Nothing can be saved until the problems listed above are fixed.' : 'Nothing can be saved until the problems listed under each file are fixed.')
      : changes === 0 ? 'Nothing would change on the line.' : null;
  const waiting = rows.filter((f) => f.status === 'error').length;
  const rowWord = (n: number) => (!hasJobs ? (n === 1 ? 'file needs' : 'files need') : groups.dxf.length ? (n === 1 ? 'nest or file needs' : 'nests and files need') : (n === 1 ? 'nest needs' : 'nests need'));
  const blockedLine = [
    'Nothing is saved.',
    ...(unreadJobs.length ? [`${plural(unreadJobs.length, 'job file', 'job files')} cannot be read (${unreadJobs.map((g) => g.job.filename).join(', ')}).`] : []),
    ...(waiting > 0 ? [`${waiting} of ${rows.length} ${rowWord(rows.length)} attention.`] : []),
    hasJobs ? 'Fix what is listed below, then upload again.' : 'Fix what is listed under each file, then upload again.',
  ].join(' ');

  return (
    <Dialog open={open} onClose={busy === 'save' ? undefined : onClose} fullWidth maxWidth="lg" aria-labelledby="nest-files-title">
      <DialogTitle id="nest-files-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{done ? 'The nesting is saved' : 'Check the nesting files'}</Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={busy === 'save'} size="small"><CloseRounded fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {done ? (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Alert severity="success" data-testid="nest-files-saved">{done.message || 'Saved.'}</Alert>
            <UntrackedShrinks untracked={done.untracked} names={null} done />
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
            {/* ONE headline, then what it rests on, by urgency. Every sentence of the answer is below it — grouped, or folded. */}
            {result && (
              <Alert severity={cannot ? 'error' : blocked ? 'info' : force ? 'warning' : 'success'} data-testid={blocked ? 'nest-files-blocked' : 'nest-files-status'}
                sx={{ overflowWrap: 'anywhere' }}>
                <Box data-testid="nest-headline" sx={{ fontWeight: 600, fontSize: 14.5 }}>{headline}</Box>
                <Box data-testid="nest-files-read" sx={{ fontSize: 13 }}>{blocked ? blockedLine : readLine}</Box>
                {leftPieces > 0 && (
                  <Box data-testid="nest-leftover-line" sx={{ fontSize: 13 }}>
                    {`${plural(leftPieces, 'piece is', 'pieces are')} not in these files — nest the rest after saving`}
                  </Box>
                )}
                <UntrackedShrinks untracked={result.untracked} names={names} />
              </Alert>
            )}

            {added && <MissingAdded added={added} />}
            {result && result.missingPlates.length > 0 && (
              <NestMissingPlates plates={result.missingPlates} orderId={orderId} lineId={lineId} canEditCatalog={canEditCatalog}
                onAdded={(out) => { setAdded(out); setTick((t) => t + 1); }} />
            )}

            {result && review && names && <ReviewSections review={review} result={result} names={names} />}

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
                  : `Each file replaces the saved plate with the same nest number. New ones are added. Everything else stays.${hasJobs ? ' A ProNest job uploaded again replaces its own plates, and takes away the ones it no longer has.' : ''}`}
              </Typography>
            </Box>

            {groups.jobs.length > 0 && (
              <Box data-testid="nest-jobs" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
                <CapsLabel>{`ProNest jobs (${groups.jobs.length})`}</CapsLabel>
                {groups.jobs.map(({ job, entries }) => (
                  <JobBlock key={job.filename} job={job} entries={entries} settle={settle} names={names}
                    open={jobsOpen[job.filename] ?? !manyRows}
                    onToggle={() => setJobsOpen((o) => ({ ...o, [job.filename]: !(o[job.filename] ?? !manyRows) }))} />
                ))}
              </Box>
            )}

            {groups.dxf.length > 0 && (
              <Box data-testid="nest-dxf-files" sx={{ minWidth: 0 }}>
                <CapsLabel>{`DXF files (${groups.dxf.length})`}</CapsLabel>
                {(result?.dxfPartRows.length ?? 0) > 0 && (
                  <Box sx={{ py: 1 }}><PartsTable rows={result?.dxfPartRows ?? []} job={null} settle={settle} label="Parts of the DXF files" names={names?.name} /></Box>
                )}
                {groups.dxf.map((f) => <FileRow key={f.filename} file={f} settle={settle} names={names} sharedShape={null} />)}
              </Box>
            )}

            {result && <LeftOver leftOver={result.leftOver} toNest={result.totals?.leftOverToNest ?? null} names={names} />}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {done ? (
          <Button variant="contained" onClick={onClose}>Done</Button>
        ) : (
          <>
            {saveWhy && <Box id="nest-files-save-why" data-testid="save-why" sx={{ flex: '1 1 220px', minWidth: 0, pl: 1, fontSize: 13, color: blocked ? 'var(--c-danger-700, var(--c-danger-800))' : 'var(--c-text-2)' }}>{saveWhy}</Box>}
            <Button onClick={onClose} disabled={busy === 'save'}>{blocked ? 'Close' : 'Cancel'}</Button>
            <Tooltip title={saveWhy ?? ''}>
              <span>
                <Button variant="contained" data-testid="nest-files-save" onClick={force ? () => setConfirm(true) : save}
                  disabled={!result || blocked || busy != null || changes === 0} aria-describedby={saveWhy ? 'nest-files-save-why' : undefined}
                  startIcon={busy === 'save' ? <CircularProgress size={15} color="inherit" /> : undefined}>
                  {busy === 'save' ? 'Saving…' : saveLabel}
                </Button>
              </span>
            </Tooltip>
          </>
        )}
      </DialogActions>

      {/* ONE confirmation for everything that needs force, whatever its code: the "Check" lines, in the same short form (the sentences are in the review). */}
      <Dialog open={confirm && force} onClose={() => setConfirm(false)} maxWidth="sm" fullWidth aria-labelledby="nest-files-confirm-title">
        <DialogTitle id="nest-files-confirm-title">{forceList.length === 1 ? 'Save with this warning?' : `Save with these ${forceList.length} warnings?`}</DialogTitle>
        <DialogContent>
          <Box data-testid="save-anyway-list" sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5 }}>
              Our check has doubts about this nesting. Saving keeps the layout exactly as the files draw it; each plate is marked “Saved anyway”.
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 13, color: 'var(--c-warning-800)', overflowWrap: 'anywhere' }}>
              {forceList.map((w) => <li key={w}>{w}</li>)}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Go back</Button>
          <Button variant="contained" color="warning" onClick={save}>Save anyway</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
