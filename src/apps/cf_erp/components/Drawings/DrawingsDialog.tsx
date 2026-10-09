import { useRef, useState, type ChangeEvent } from 'react';
import { Autocomplete, Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import DrawRounded from '@mui/icons-material/DrawRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import { CfApiError } from '../../api/client';
import { useToast } from '../toastContext';
import { fileToBase64 } from '../../api/bomSheet';
import {
  deleteDrawing, downloadDrawing, downloadRegisterFile, getDrawings, startDrawing, uploadDrawings,
  type Drawing, type DrawingFileBody, type DrawingGeometry, type DrawingRow, type DrawingsUpload, type DrawingsView, type RegisterRef,
} from '../../api/drawings';
import {
  buttonLabel, coveringRow, deleteBody, fmtCutM, fmtMm, fmtPct, groupByLevel, holesTitle, INTRO, levelText, levelsOfRows, NO_DRAWINGS, NO_MARK_HINT, outlineShape,
  prefillNumber, refText, REGISTER_STATUS_FAMILY, registerWords, rowChoices, rowCodes, savable, sizeCheck, sizeText, sortPicked, STATUS_WORDS, summaryWords, WAITING_HINT,
  type RowChoice,
} from '../../lib/drawings';
import { NO_MANAGE } from '../../lib/nesting';
import { useLoad } from '../../hooks/useLoad';
import { Badge, CapsLabel, EmptyState, ErrorNotice, Fact, Mono, SectionCard, SkeletonRows } from '../ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { DialogHeader, FormDialog } from '../FormDialog';

/**
 * DRAWINGS — a DXF or PDF for any row of an order line (span, girder, segment, assembly, part), named by the row's
 * drawing mark. Only a plate part's DXF is read as a shape: true area (what a true-shape nesting could save), cut length
 * and piercings for the CNC. A file is read and matched first (dry run); nothing is saved until "Save N drawings".
 * Files that match no row, or cannot be read, are never saved. Every saved drawing can be downloaded.
 */

const TABLE_SX = {
  borderCollapse: 'collapse', fontSize: 12.5, width: '100%',
  '& th, & td': { textAlign: 'left', py: 0.75, pr: 1.5, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'middle' },
  '& th': { color: 'var(--c-text-3)', fontWeight: 600, whiteSpace: 'nowrap' },
  '& td.n, & th.n': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
} as const;

/** The outline, y flipped, filled light violet; holes and cut-outs are empty (even-odd). */
function Outline({ geometry, w = 64, h = 40, onClick }: { geometry: DrawingGeometry; w?: number; h?: number; onClick?: () => void }) {
  const { d, viewBox } = outlineShape(geometry);
  const svg = (
    <svg width={w} height={h} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Outline of the part" style={{ display: 'block' }}>
      <path d={d} fillRule="evenodd" fill="var(--c-primary-100)" stroke="var(--c-primary-700)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
  if (!onClick) return svg;
  return (
    <Tooltip title="Click to enlarge">
      <Box component="button" type="button" onClick={onClick} sx={{ all: 'unset', cursor: 'zoom-in', display: 'block', borderRadius: 'var(--r-sm)', '&:focus-visible': { outline: '2px solid var(--c-primary-500)' } }}>
        {svg}
      </Box>
    </Tooltip>
  );
}

/** The picture of a drawing: its outline when it has a shape, otherwise a small file-type badge. */
function Thumb({ drawing, onEnlarge }: { drawing: Drawing; onEnlarge: () => void }) {
  if (drawing.geometry) return <Outline geometry={drawing.geometry} onClick={onEnlarge} />;
  return (
    <Box aria-label={`${drawing.fileKind.toUpperCase()} file`} sx={{
      width: 64, height: 40, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-divider)',
      fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--c-text-2)',
    }}>{drawing.fileKind.toUpperCase()}</Box>
  );
}

function Rows({ rows, geometry }: { rows: DrawingRow[]; geometry: DrawingGeometry | null }) {
  if (!rows.length) return <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
      {rows.map((r) => {
        if (!geometry || !r.isPlatePart) {
          return (
            <Tooltip key={r.id} title={`${r.level}${r.name ? ` · ${r.name}` : ''}`}>
              <Box component="span"><Mono>{r.code ?? r.name}</Mono></Box>
            </Tooltip>
          );
        }
        const c = sizeCheck(r, geometry);
        return (
          <Tooltip key={r.id} title={c.text}>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Mono>{r.code ?? r.name}</Mono>
              <Box component="span" aria-label={c.text} sx={{ color: c.mark === '✓' ? 'var(--c-success-700)' : c.mark === '⚠' ? 'var(--c-warning-700)' : 'var(--c-text-3)' }}>{c.mark}</Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function StatusBadge({ status }: { status: DrawingsUpload['files'][number]['status'] }) {
  const family = status === 'new' ? 'success' : status === 'replaces' ? 'info' : status === 'unmatched' ? 'warning' : 'danger';
  return <Badge family={family} label={STATUS_WORDS[status]} noIcon />;
}

function Notes({ problems, warnings }: { problems?: string[]; warnings: string[] }) {
  if (!(problems?.length) && !warnings.length) return <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2, display: 'grid', gap: 0.25, overflowWrap: 'anywhere' }}>
      {(problems ?? []).map((p) => <li key={`p${p}`} style={{ color: 'var(--c-danger-700)' }}>{p}</li>)}
      {warnings.map((p) => <li key={`w${p}`} style={{ color: 'var(--c-warning-800)' }}>{p}</li>)}
    </Box>
  );
}

function RegisterBadge({ status }: { status: RegisterRef['status'] }) {
  return <Badge family={REGISTER_STATUS_FAMILY[status]} label={status} noIcon />;
}

/** The register sheet of a saved file: number, revision, status, and a link for each earlier revision that has a file. */
function RegisterCell({ drawing, fileKind, onDownloadEarlier }: {
  drawing: RegisterRef | null; fileKind: string; onDownloadEarlier: (id: number, name: string) => void;
}) {
  if (!drawing) return <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>;
  const earlier = drawing.earlier.filter((e) => e.hasFile);
  return (
    <Box sx={{ display: 'grid', gap: 0.5, justifyItems: 'start' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Mono>{drawing.number}</Mono>
        <span>rev {drawing.revision}</span>
        <RegisterBadge status={drawing.status} />
      </Box>
      {earlier.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {earlier.map((e) => (
            <Tooltip key={e.id} title={`Download the file of rev ${e.revision} (${e.status})`}>
              <Button size="small" sx={{ minWidth: 0, py: 0, px: 0.75, fontSize: 12 }} onClick={() => onDownloadEarlier(e.id, e.fileName ?? `${drawing.number}_rev${e.revision}.${fileKind}`)}>
                rev {e.revision}
              </Button>
            </Tooltip>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** The check shown after the files are read — before anything is saved. */
function PreviewTable({ upload }: { upload: DrawingsUpload }) {
  return (
    <Box sx={{ overflowX: 'auto' }} data-testid="drawings-preview">
      <Box component="table" sx={TABLE_SX}>
        <thead>
          <tr>
            <th>File</th><th>Type</th><th>Mark</th><th>Drawing</th><th>Result</th><th>Rows matched</th><th>Level</th><th>Size</th>
            <th className="n">Use</th><th className="n">Cut length</th><th className="n">Piercings</th><th className="n">Holes</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {upload.files.map((f) => {
            const g = f.geometry;
            const wrong = f.rows.filter((r) => r.sizeMatches === false).length;
            const shaped = !!g && f.rows.some((r) => r.isPlatePart);
            return (
              <tr key={f.name}>
                <td style={{ overflowWrap: 'anywhere' }}>{f.name}</td>
                <td>{f.fileKind ? f.fileKind.toUpperCase() : '—'}</td>
                <td><Mono>{f.mark}</Mono></td>
                <td>{registerWords(f.register)}</td>
                <td><StatusBadge status={f.status} /></td>
                <td>{f.rows.length ? rowCodes(f.rows) : '—'}</td>
                <td>{levelText(levelsOfRows(f.rows))}</td>
                <td>
                  {!f.rows.length || !shaped ? '—' : wrong
                    ? <Tooltip title={f.rows.filter((r) => r.sizeMatches === false).map((r) => sizeCheck(r, g).text).join(' · ')}><Box component="span" sx={{ color: 'var(--c-warning-700)' }}>⚠ {wrong} differ</Box></Tooltip>
                    : <Box component="span" sx={{ color: 'var(--c-success-700)' }}>✓</Box>}
                </td>
                <td className="n">{g ? fmtPct(g.usePct) : '—'}</td>
                <td className="n">{g ? fmtCutM(g.cutLengthMm) : '—'}</td>
                <td className="n">{g ? g.piercings : '—'}</td>
                <td className="n">{g ? <Tooltip title={holesTitle(g)}><span>{g.holes}</span></Tooltip> : '—'}</td>
                <td><Notes problems={f.problems} warnings={f.warnings} /></td>
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

function DrawingsTable({ drawings, canManage, released, onEnlarge, onDelete, onDownload, onDownloadEarlier }: {
  drawings: Drawing[]; canManage: boolean; released: boolean; onEnlarge: (d: Drawing) => void; onDelete: (d: Drawing) => void; onDownload: (d: Drawing) => void;
  onDownloadEarlier: (id: number, name: string) => void;
}) {
  return (
    <Box sx={{ overflowX: 'auto' }} data-testid="drawings-table">
      <Box component="table" sx={TABLE_SX}>
        <thead>
          <tr>
            <th /><th>Mark</th><th>Drawing</th><th>File</th><th>Level</th><th>Rows</th><th className="n">Rectangle</th><th className="n">Use</th>
            <th className="n">Cut length</th><th className="n">Piercings</th><th className="n">Holes</th><th /><th /><th />
          </tr>
        </thead>
        <tbody>
          {drawings.map((d) => {
            const g = d.geometry;
            return (
              <tr key={d.id}>
                <td><Thumb drawing={d} onEnlarge={() => onEnlarge(d)} /></td>
                <td><Mono>{d.mark}</Mono></td>
                <td><RegisterCell drawing={d.drawing} fileKind={d.fileKind} onDownloadEarlier={onDownloadEarlier} /></td>
                <td style={{ overflowWrap: 'anywhere' }}>{d.fileName}</td>
                <td>{levelText(d.levels)}</td>
                <td><Rows rows={d.rows} geometry={g} /></td>
                <td className="n">{g ? sizeText(g.lengthMm, g.widthMm) : '—'}</td>
                <td className="n">{g ? fmtPct(g.usePct) : '—'}</td>
                <td className="n">{g ? fmtCutM(g.cutLengthMm) : '—'}</td>
                <td className="n">{g ? g.piercings : '—'}</td>
                <td className="n">{g ? <Tooltip title={holesTitle(g)}><span>{g.holes}</span></Tooltip> : '—'}</td>
                <td>
                  {d.warnings.length > 0 && (
                    <Tooltip title={d.warnings.join(' · ')}>
                      <WarningAmberRounded fontSize="small" sx={{ color: 'var(--c-warning-600)', display: 'block' }} aria-label={d.warnings.join(' · ')} />
                    </Tooltip>
                  )}
                </td>
                <td>
                  <Tooltip title="Download this drawing">
                    <IconButton size="small" aria-label={`Download drawing ${d.mark}`} onClick={() => onDownload(d)}><DownloadRounded fontSize="small" /></IconButton>
                  </Tooltip>
                </td>
                <td>
                  {canManage && !released && (
                    <Tooltip title="Delete this drawing">
                      <IconButton size="small" aria-label={`Delete drawing ${d.mark}`} onClick={() => onDelete(d)}><DeleteOutlineRounded fontSize="small" /></IconButton>
                    </Tooltip>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

type Waiting = DrawingsView['waiting'][number];

/** Register drawings that are linked to rows but have no file yet. */
function WaitingTable({ waiting, mayAttach, busy, onAttach }: {
  waiting: Waiting[]; mayAttach: boolean; busy: boolean; onAttach: (d: RegisterRef) => void;
}) {
  return (
    <Box sx={{ overflowX: 'auto' }} data-testid="drawings-waiting">
      <Box component="table" sx={TABLE_SX}>
        <thead><tr><th>Drawing</th><th>Title</th><th>Rows</th><th /></tr></thead>
        <tbody>
          {waiting.map((w) => (
            <tr key={w.drawing.id}>
              <td>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Mono>{w.drawing.number}</Mono><span>rev {w.drawing.revision}</span><RegisterBadge status={w.drawing.status} />
                </Box>
              </td>
              <td style={{ overflowWrap: 'anywhere' }}>{w.drawing.title ?? '—'}</td>
              <td><Rows rows={w.rows} geometry={null} /></td>
              <td>
                {mayAttach && (
                  <Button size="small" variant="outlined" startIcon={<AttachFileRounded />} disabled={busy} onClick={() => onAttach(w.drawing)}
                    aria-label={`Attach file to ${refText(w.drawing)}`}>
                    Attach file
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

/** The small form that starts a register drawing from rows, before any file exists. */
function StartDrawingDialog({ open, choices, initialIds, onClose, onStart }: {
  open: boolean; choices: RowChoice[]; initialIds: number[]; onClose: () => void;
  onStart: (body: { rowIds: number[]; number: string; revision: string; title?: string; source: 'shop' | 'customer'; status: 'draft' | 'issued' }) => Promise<void>;
}) {
  if (!open) return null;
  return <StartDrawingForm choices={choices} initialIds={initialIds} onClose={onClose} onStart={onStart} />;
}

function StartDrawingForm({ choices, initialIds, onClose, onStart }: {
  choices: RowChoice[]; initialIds: number[]; onClose: () => void;
  onStart: (body: { rowIds: number[]; number: string; revision: string; title?: string; source: 'shop' | 'customer'; status: 'draft' | 'issued' }) => Promise<void>;
}) {
  const [ids, setIds] = useState<number[]>(initialIds);
  const [number, setNumber] = useState(() => prefillNumber(choices, initialIds));
  const [touched, setTouched] = useState(false);
  const [revision, setRevision] = useState('A');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<'shop' | 'customer'>('shop');
  const [status, setStatus] = useState<'draft' | 'issued'>('issued');
  const chosen = ids.map((id) => choices.find((c) => c.id === id)).filter((c): c is RowChoice => !!c);

  const pick = (next: RowChoice[]) => {
    const nextIds = next.map((c) => c.id);
    setIds(nextIds);
    if (!touched) setNumber(prefillNumber(choices, nextIds));
  };

  return (
    <FormDialog open title="Start a drawing" subtitle="The drawing goes in the register now. Its file can come later."
      onClose={onClose} submitLabel="Start drawing" busyLabel="Starting…" submitDisabled={!ids.length || !number.trim()}
      enterSubmits={false}
      onSubmit={() => onStart({ rowIds: ids, number: number.trim(), revision: revision.trim() || 'A', title: title.trim() || undefined, source, status })}>
      <Autocomplete multiple options={choices} value={chosen} onChange={(_, v) => pick(v)}
        getOptionLabel={(c) => c.label} isOptionEqualToValue={(a, b) => a.id === b.id}
        renderOption={(props, c) => <li {...props} key={c.id}><Mono>{c.label}</Mono>&nbsp;<Box component="span" sx={{ color: 'var(--c-text-3)', ml: 0.5 }}>{c.level}</Box></li>}
        renderInput={(p) => <TextField {...p} label="Rows" helperText="The rows this drawing covers." />} />
      <TextField label="Number" value={number} required onChange={(e) => { setNumber(e.target.value); setTouched(true); }}
        helperText="The sheet number, e.g. G1-1." />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
        <TextField label="Revision" value={revision} onChange={(e) => setRevision(e.target.value)} />
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={chosen[0]?.name ?? ''} helperText="Optional." />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField select label="Source" value={source} onChange={(e) => setSource(e.target.value as 'shop' | 'customer')}>
          <MenuItem value="shop">Ours</MenuItem>
          <MenuItem value="customer">Customer’s</MenuItem>
        </TextField>
        <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'issued')}
          helperText={status === 'draft' ? 'Still being drawn.' : undefined}>
          <MenuItem value="issued">Issued</MenuItem>
          <MenuItem value="draft">Draft</MenuItem>
        </TextField>
      </Box>
    </FormDialog>
  );
}

/** Opened from a row: the drawings that cover just this row, each with its action. */
function FocusCard({ view, row, mayAttach, canManage, onDownload, onAttach, onStart }: {
  view: DrawingsView; row: { id: number; name: string }; mayAttach: boolean; canManage: boolean;
  onDownload: (d: Drawing) => void; onAttach: (d: RegisterRef) => void; onStart: () => void;
}) {
  const { saved, waiting } = coveringRow(view, row.id);
  return (
    <SectionCard title={`For ${row.name}`} subtitle={saved.length + waiting.length ? undefined : 'No drawing covers this row yet.'}>
      <Box sx={{ display: 'grid', gap: 1 }} data-testid="drawings-focus">
        {saved.map((d) => (
          <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: 13 }}>
            {d.drawing ? <><Mono>{d.drawing.number}</Mono><span>rev {d.drawing.revision}</span><RegisterBadge status={d.drawing.status} /></> : <Mono>{d.mark}</Mono>}
            <Box component="span" sx={{ color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{d.fileName}</Box>
            <Button size="small" startIcon={<DownloadRounded />} onClick={() => onDownload(d)}>Download</Button>
          </Box>
        ))}
        {waiting.map((w) => (
          <Box key={w.drawing.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: 13 }}>
            <Mono>{w.drawing.number}</Mono><span>rev {w.drawing.revision}</span><RegisterBadge status={w.drawing.status} />
            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>waiting for a file</Box>
            {mayAttach && <Button size="small" startIcon={<AttachFileRounded />} onClick={() => onAttach(w.drawing)}>Attach file</Button>}
          </Box>
        ))}
        {canManage && (
          <Box><Button size="small" variant="outlined" startIcon={<AddRounded />} onClick={onStart}>Start a drawing for this row</Button></Box>
        )}
      </Box>
    </SectionCard>
  );
}

function Summary({ view }: { view: DrawingsView }) {
  const s = view.summary;
  return (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'minmax(0, 1fr)' }} data-testid="drawings-summary">
      <Typography sx={{ fontSize: 14 }}>{summaryWords(s)}</Typography>
      {s.partsWithShape > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1.5 }}>
          <Fact label="Rows with a drawing">{s.rowsWithDrawing} of {s.rows}</Fact>
          <Fact label="Plate parts with a shape">{s.partsWithShape} of {s.parts}</Fact>
          <Fact label="Rectangles">{s.rectAreaM2.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²</Fact>
          <Fact label="True shapes">{s.trueAreaM2.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²</Fact>
          <Fact label="Use">{fmtPct(s.usePct)}</Fact>
          <Fact label="Could save">{Math.round(s.savingKg).toLocaleString('en-US')} kg</Fact>
        </Box>
      )}
    </Box>
  );
}

export function DrawingsDialog({ open, onClose, orderId, lineId, canManage, view, error, loading, onView, onChanged, focusRow }: {
  open: boolean;
  onClose: () => void;
  orderId: number;
  lineId: number;
  canManage: boolean;
  view: DrawingsView | null;
  error: CfApiError | null;
  loading: boolean;
  /** The server's newest view of the line's drawings (after a save or a delete). */
  onView: (v: DrawingsView) => void;
  onChanged?: () => void;
  /** Opened from a row: show what covers just this row at the top. */
  focusRow?: { id: number; name: string; mark?: string | null } | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const attachInput = useRef<HTMLInputElement>(null);
  const attachTo = useRef<RegisterRef | null>(null);
  const [starting, setStarting] = useState<number[] | null>(null);
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pending, setPending] = useState<{ files: DrawingFileBody[]; upload: DrawingsUpload } | null>(null);
  const [enlarged, setEnlarged] = useState<Drawing | null>(null);
  const [toDelete, setToDelete] = useState<Drawing | null>(null);
  const [withoutOpen, setWithoutOpen] = useState(false);
  const [tooBig, setTooBig] = useState<string[]>([]);
  const toast = useToast();

  const released = view?.line.released ?? false;
  const mayUpload = canManage && !released;
  const wrap = (e: unknown) => (e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e)));

  const read = async (picked: File[], drawingId?: number) => {
    if (!picked.length) return;
    const sorted = sortPicked(picked);
    setSkipped(sorted.wrongKind); setTooBig(sorted.tooBig);
    if (!sorted.ok.length) return;
    const dxf = sorted.ok;
    setBusy('read'); setActionError(null); setPending(null);
    try {
      const files: DrawingFileBody[] = await Promise.all(dxf.map(async (f) => ({
        name: f.name, content: await fileToBase64(f), ...(drawingId != null ? { drawingId } : {}),
      })));
      const upload = await uploadDrawings(orderId, lineId, files, true);
      setPending({ files, upload });
    } catch (e) { setActionError(wrap(e)); } finally { setBusy(null); }
  };

  const choose = (ev: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(ev.target.files ?? []);
    ev.target.value = '';
    void read(picked);
  };

  const chooseAttach = (ev: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(ev.target.files ?? []).slice(0, 1);
    ev.target.value = '';
    const target = attachTo.current;
    attachTo.current = null;
    if (target) void read(picked, target.id);
  };

  const startAttach = (d: RegisterRef) => { attachTo.current = d; attachInput.current?.click(); };

  const start = async (body: { rowIds: number[]; number: string; revision: string; title?: string; source: 'shop' | 'customer'; status: 'draft' | 'issued' }) => {
    const out = await startDrawing(orderId, lineId, body);
    onView(out.view);
    onChanged?.();
  };

  const downloadEarlier = async (id: number, name: string) => {
    try { await downloadRegisterFile(id, name); } catch (e) { toast.error(wrap(e).message); }
  };

  const save = async () => {
    if (!pending) return;
    setBusy('save'); setActionError(null);
    try {
      const out = await uploadDrawings(orderId, lineId, pending.files, false);
      if (out.view) onView(out.view); else onView(await getDrawings(orderId, lineId));
      setPending(null); setSkipped([]); setTooBig([]);
      onChanged?.();
    } catch (e) { setActionError(wrap(e)); } finally { setBusy(null); }
  };

  const remove = async (d: Drawing) => {
    const next = await deleteDrawing(orderId, lineId, d.id);
    onView(next);
    onChanged?.();
  };

  const download = async (d: Drawing) => {
    try { await downloadDrawing(orderId, lineId, d); } catch (e) { toast.error(wrap(e).message); }
  };

  const toSave = pending ? savable(pending.upload.files) : [];
  const unsaved = pending ? pending.upload.files.length - toSave.length : 0;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="lg" aria-labelledby="drawings-title">
      <DialogHeader
        title={<span id="drawings-title">{view ? `Drawings — line ${view.line.lineNo}` : 'Drawings'}</span>}
        subtitle={INTRO}
        onClose={onClose} busy={busy != null}
      />
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
          <ErrorNotice error={error ?? actionError} />
          {loading && !view && <SkeletonRows rows={4} />}
          {view && <Summary view={view} />}

          {view && focusRow && (
            <FocusCard view={view} row={focusRow} mayAttach={mayUpload && busy == null} canManage={canManage}
              onDownload={download} onAttach={startAttach} onStart={() => setStarting([focusRow.id])} />
          )}

          {view && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tooltip title={!canManage ? NO_MANAGE : released ? 'This line is released, so its drawings cannot change.' : 'Pick the DXF or PDF files. You see a check before anything is saved.'}>
                <span>
                  <Button variant="outlined" disabled={!mayUpload || busy != null} onClick={() => input.current?.click()}
                    startIcon={busy === 'read' ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}>
                    {busy === 'read' ? 'Reading…' : 'Upload drawings'}
                  </Button>
                </span>
              </Tooltip>
              <input ref={input} type="file" accept=".dxf,.pdf" multiple hidden onChange={choose} data-testid="drawings-input" />
              <input ref={attachInput} type="file" accept=".dxf,.pdf" hidden onChange={chooseAttach} data-testid="drawings-attach-input" />
              {canManage && (
                <Tooltip title="Put a drawing in the register for some rows now. Its file can come later.">
                  <span>
                    <Button variant="outlined" disabled={busy != null} startIcon={<AddRounded />} onClick={() => setStarting([])} data-testid="drawings-start">
                      Start a drawing
                    </Button>
                  </span>
                </Tooltip>
              )}
              {skipped.length > 0 && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
                  Not a DXF or PDF, left out: {skipped.join(', ')}
                </Typography>
              )}
              {tooBig.length > 0 && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
                  Over 4 MB, left out: {tooBig.join(', ')}
                </Typography>
              )}
            </Box>
          )}

          {pending && (
            <SectionCard
              title="Check before saving"
              subtitle={`${pending.upload.files.length} ${pending.upload.files.length === 1 ? 'file' : 'files'} read. Nothing is saved yet.`}
              flush
            >
              <Box sx={{ p: 1.5, display: 'grid', gap: 1.5, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                <PreviewTable upload={pending.upload} />
                {unsaved > 0 && (
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {unsaved} {unsaved === 1 ? 'file is' : 'files are'} not saved: a file with no matching row has nothing to attach to, and a file that cannot be read cannot be used.
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Button onClick={() => setPending(null)} disabled={busy != null}>Cancel</Button>
                  <Button variant="contained" onClick={save} disabled={busy != null || toSave.length === 0}
                    startIcon={busy === 'save' ? <CircularProgress size={14} color="inherit" /> : undefined}>
                    {busy === 'save' ? 'Saving…' : `Save ${toSave.length} ${toSave.length === 1 ? 'drawing' : 'drawings'}`}
                  </Button>
                </Box>
              </Box>
            </SectionCard>
          )}

          {view && view.waiting.length > 0 && (
            <SectionCard title="Waiting for a file" subtitle={WAITING_HINT} flush>
              <Box sx={{ p: 1.5 }}>
                <WaitingTable waiting={view.waiting} mayAttach={mayUpload} busy={busy != null} onAttach={startAttach} />
              </Box>
            </SectionCard>
          )}

          {view && view.drawings.length > 0 && (
            <SectionCard title="Saved drawings" subtitle={`${view.drawings.length} on this line`} flush>
              <Box sx={{ p: 1.5 }}>
                <DrawingsTable drawings={view.drawings} canManage={canManage} released={released} onEnlarge={setEnlarged} onDelete={setToDelete} onDownload={download} onDownloadEarlier={downloadEarlier} />
              </Box>
            </SectionCard>
          )}
          {view && view.drawings.length === 0 && view.waiting.length === 0 && !pending && (
            <EmptyState title="No drawings yet" body={NO_DRAWINGS} />
          )}

          {view && view.rowsWithoutDrawing.length > 0 && (
            <Box>
              <Button size="small" onClick={() => setWithoutOpen((o) => !o)} endIcon={withoutOpen ? <ExpandLessRounded /> : <ExpandMoreRounded />} data-testid="drawings-without-toggle">
                {view.rowsWithoutDrawing.length} {view.rowsWithoutDrawing.length === 1 ? 'row has' : 'rows have'} no drawing
              </Button>
              <Collapse in={withoutOpen} unmountOnExit>
                <Box sx={{ overflowX: 'auto', mt: 1 }} data-testid="drawings-without">
                  {view.rowsWithoutDrawing.some((p) => !p.mark) && (
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>{NO_MARK_HINT}</Typography>
                  )}
                  <Box component="table" sx={TABLE_SX}>
                    <thead><tr><th>Code</th><th>Name</th><th>Level</th><th>Drawing mark</th><th className="n">Pieces</th><th /></tr></thead>
                    <tbody>
                      {groupByLevel(view.rowsWithoutDrawing).flatMap((g) => g.rows).map((p) => (
                        <tr key={p.id}>
                          <td>{p.code ? <Mono>{p.code}</Mono> : '—'}</td>
                          <td style={{ overflowWrap: 'anywhere' }}>{p.name}</td>
                          <td>{p.level}</td>
                          <td>{p.mark ? <Mono>{p.mark}</Mono> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>no drawing mark</Box>}</td>
                          <td className="n">{p.pieces}</td>
                          <td>
                            {canManage && (
                              <Button size="small" onClick={() => setStarting([p.id])} aria-label={`Start a drawing for ${p.code ?? p.name}`}>Start drawing</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                </Box>
              </Collapse>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy != null}>Close</Button></DialogActions>

      <Dialog open={!!enlarged?.geometry} onClose={() => setEnlarged(null)} maxWidth="md" fullWidth aria-labelledby="drawing-large-title">
        {enlarged?.geometry && (
          <>
            <DialogHeader title={<span id="drawing-large-title">{enlarged.mark}</span>} subtitle={`${sizeText(enlarged.geometry!.lengthMm, enlarged.geometry!.widthMm)} · uses ${fmtPct(enlarged.geometry!.usePct)} of its rectangle`} onClose={() => setEnlarged(null)} />
            <DialogContent dividers>
              <Box sx={{ display: 'grid', gap: 1.5, justifyItems: 'center' }}>
                <Box sx={{ width: '100%', maxHeight: '60vh', display: 'flex', justifyContent: 'center' }}>
                  <Outline geometry={enlarged.geometry!} w={720} h={400} />
                </Box>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Fact label="Cut length">{fmtCutM(enlarged.geometry!.cutLengthMm)} ({fmtMm(enlarged.geometry!.cutLengthMm)} mm)</Fact>
                  <Fact label="Piercings">{enlarged.geometry!.piercings}</Fact>
                  <Fact label="Holes">{enlarged.geometry!.holes}{enlarged.geometry!.holes ? ` · ${holesTitle(enlarged.geometry!)}` : ''}</Fact>
                  <Fact label="Cut-outs">{enlarged.geometry!.innerCuts}</Fact>
                </Box>
                {enlarged.warnings.length > 0 && <Box sx={{ color: 'var(--c-warning-800)', fontSize: 13 }}><CapsLabel>Warnings</CapsLabel>{enlarged.warnings.join(' · ')}</Box>}
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>

      <StartDrawingDialog open={starting != null && !!view} choices={view ? rowChoices(view) : []} initialIds={starting ?? []}
        onClose={() => setStarting(null)} onStart={start} />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this drawing?"
        entityName={toDelete ? `${toDelete.mark} (${toDelete.fileName})` : undefined}
        body={deleteBody(toDelete?.drawing)}
        confirmLabel="Delete" danger
        onConfirm={async () => { if (toDelete) await remove(toDelete); }}
        onClose={() => setToDelete(null)}
      />
    </Dialog>
  );
}

/** The "Drawings" button for an order line's Structure tab: reads the summary itself and opens the dialog. */
export function DrawingsButton({ orderId, lineId, canManage, onChanged, size, focusRow, onFocusDone }: {
  orderId: number; lineId: number; canManage: boolean; onChanged?: () => void; size?: 'small' | 'medium';
  /** A row to open the dialog for; the dialog opens while it is set. */
  focusRow?: { id: number; name: string; mark?: string | null } | null;
  onFocusDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = open || !!focusRow;
  const close = () => { setOpen(false); onFocusDone?.(); };
  const { data, error, loading, setData } = useLoad(() => getDrawings(orderId, lineId), [orderId, lineId]);
  return (
    <>
      <Tooltip title="A drawing for any row of this line, DXF or PDF, named by the row's drawing mark. A plate part's DXF also gives its true shape and the CNC cut length.">
        <Button size={size} variant="outlined" startIcon={<DrawRounded />} onClick={() => setOpen(true)} data-testid="drawings-button">
          {buttonLabel(data?.summary)}
        </Button>
      </Tooltip>
      {shown && (
        <DrawingsDialog open onClose={close} orderId={orderId} lineId={lineId} canManage={canManage}
          view={data} error={error} loading={loading} onView={setData} onChanged={onChanged} focusRow={focusRow} />
      )}
    </>
  );
}
