import { useRef, useState, type ChangeEvent } from 'react';
import { Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, IconButton, Tooltip, Typography } from '@mui/material';
import DrawRounded from '@mui/icons-material/DrawRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import { CfApiError } from '../../api/client';
import { fileToBase64 } from '../../api/bomSheet';
import {
  deleteDrawing, getDrawings, uploadDrawings,
  type Drawing, type DrawingFileBody, type DrawingGeometry, type DrawingRow, type DrawingsUpload, type DrawingsView,
} from '../../api/drawings';
import {
  buttonLabel, fmtCutM, fmtMm, fmtPct, holesTitle, isDxf, outlineShape, rowCodes, savable, sizeCheck, sizeText, STATUS_WORDS, summaryWords,
} from '../../lib/drawings';
import { NO_MANAGE } from '../../lib/nesting';
import { useLoad } from '../../hooks/useLoad';
import { Badge, CapsLabel, EmptyState, ErrorNotice, Fact, Mono, SectionCard, SkeletonRows } from '../ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { DialogHeader } from '../FormDialog';

/**
 * PART SHAPES (DXF) — the DXF of each plate part, named by its drawing mark. The server reads the true outline and says
 * how much of each part's rectangle is real part: what a true-shape nesting could save. Cut length and piercings
 * (for CNC) come from the same drawings. A file is read and matched first (dry run); nothing is saved until
 * "Save N drawings". Files that match no row, or cannot be read, are never saved.
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

function Rows({ rows, geometry }: { rows: DrawingRow[]; geometry: DrawingGeometry | null }) {
  if (!rows.length) return <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
      {rows.map((r) => {
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

/** The check shown after the files are read — before anything is saved. */
function PreviewTable({ upload }: { upload: DrawingsUpload }) {
  return (
    <Box sx={{ overflowX: 'auto' }} data-testid="drawings-preview">
      <Box component="table" sx={TABLE_SX}>
        <thead>
          <tr>
            <th>File</th><th>Mark</th><th>Result</th><th>Rows matched</th><th>Size</th>
            <th className="n">Use</th><th className="n">Cut length</th><th className="n">Piercings</th><th className="n">Holes</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {upload.files.map((f) => {
            const g = f.geometry;
            const wrong = f.rows.filter((r) => r.sizeMatches === false).length;
            return (
              <tr key={f.name}>
                <td style={{ overflowWrap: 'anywhere' }}>{f.name}</td>
                <td><Mono>{f.mark}</Mono></td>
                <td><StatusBadge status={f.status} /></td>
                <td>{f.rows.length ? rowCodes(f.rows) : '—'}</td>
                <td>
                  {!f.rows.length ? '—' : wrong
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

function DrawingsTable({ drawings, canManage, released, onEnlarge, onDelete }: {
  drawings: Drawing[]; canManage: boolean; released: boolean; onEnlarge: (d: Drawing) => void; onDelete: (d: Drawing) => void;
}) {
  return (
    <Box sx={{ overflowX: 'auto' }} data-testid="drawings-table">
      <Box component="table" sx={TABLE_SX}>
        <thead>
          <tr>
            <th /><th>Mark</th><th>File</th><th>Rows</th><th className="n">Rectangle</th><th className="n">Use</th>
            <th className="n">Cut length</th><th className="n">Piercings</th><th className="n">Holes</th><th /><th />
          </tr>
        </thead>
        <tbody>
          {drawings.map((d) => {
            const g = d.geometry;
            return (
              <tr key={d.id}>
                <td><Outline geometry={g} onClick={() => onEnlarge(d)} /></td>
                <td><Mono>{d.mark}</Mono></td>
                <td style={{ overflowWrap: 'anywhere' }}>{d.fileName}</td>
                <td><Rows rows={d.rows} geometry={g} /></td>
                <td className="n">{sizeText(g.lengthMm, g.widthMm)}</td>
                <td className="n">{fmtPct(g.usePct)}</td>
                <td className="n">{fmtCutM(g.cutLengthMm)}</td>
                <td className="n">{g.piercings}</td>
                <td className="n"><Tooltip title={holesTitle(g)}><span>{g.holes}</span></Tooltip></td>
                <td>
                  {d.warnings.length > 0 && (
                    <Tooltip title={d.warnings.join(' · ')}>
                      <WarningAmberRounded fontSize="small" sx={{ color: 'var(--c-warning-600)', display: 'block' }} aria-label={d.warnings.join(' · ')} />
                    </Tooltip>
                  )}
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

function Summary({ view }: { view: DrawingsView }) {
  const s = view.summary;
  return (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'minmax(0, 1fr)' }} data-testid="drawings-summary">
      <Typography sx={{ fontSize: 14 }}>{summaryWords(s)}</Typography>
      {s.partsWithDrawing > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1.5 }}>
          <Fact label="Parts with a drawing">{s.partsWithDrawing} of {s.parts}</Fact>
          <Fact label="Rectangles">{s.rectAreaM2.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²</Fact>
          <Fact label="True shapes">{s.trueAreaM2.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²</Fact>
          <Fact label="Use">{fmtPct(s.usePct)}</Fact>
          <Fact label="Could save">{Math.round(s.savingKg).toLocaleString('en-US')} kg</Fact>
        </Box>
      )}
    </Box>
  );
}

export function DrawingsDialog({ open, onClose, orderId, lineId, canManage, view, error, loading, onView, onChanged }: {
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
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pending, setPending] = useState<{ files: DrawingFileBody[]; upload: DrawingsUpload } | null>(null);
  const [enlarged, setEnlarged] = useState<Drawing | null>(null);
  const [toDelete, setToDelete] = useState<Drawing | null>(null);
  const [withoutOpen, setWithoutOpen] = useState(false);

  const released = view?.line.released ?? false;
  const mayUpload = canManage && !released;
  const wrap = (e: unknown) => (e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e)));

  const choose = async (ev: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(ev.target.files ?? []);
    ev.target.value = '';
    if (!picked.length) return;
    const dxf = picked.filter((f) => isDxf(f.name));
    setSkipped(picked.filter((f) => !isDxf(f.name)).map((f) => f.name));
    if (!dxf.length) return;
    setBusy('read'); setActionError(null); setPending(null);
    try {
      const files = await Promise.all(dxf.map(async (f) => ({ name: f.name, content: await fileToBase64(f) })));
      const upload = await uploadDrawings(orderId, lineId, files, true);
      setPending({ files, upload });
    } catch (e) { setActionError(wrap(e)); } finally { setBusy(null); }
  };

  const save = async () => {
    if (!pending) return;
    setBusy('save'); setActionError(null);
    try {
      const out = await uploadDrawings(orderId, lineId, pending.files, false);
      if (out.view) onView(out.view); else onView(await getDrawings(orderId, lineId));
      setPending(null); setSkipped([]);
      onChanged?.();
    } catch (e) { setActionError(wrap(e)); } finally { setBusy(null); }
  };

  const remove = async (d: Drawing) => {
    const next = await deleteDrawing(orderId, lineId, d.id);
    onView(next);
    onChanged?.();
  };

  const toSave = pending ? savable(pending.upload.files) : [];
  const unsaved = pending ? pending.upload.files.length - toSave.length : 0;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="lg" aria-labelledby="drawings-title">
      <DialogHeader
        title={<span id="drawings-title">{view ? `Part shapes (DXF) — line ${view.line.lineNo}` : 'Part shapes (DXF)'}</span>}
        subtitle="The true shape of each plate part, from its DXF. It shows how much steel a true-shape nesting could save; the cut length and piercings are for the CNC."
        onClose={onClose} busy={busy != null}
      />
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
          <ErrorNotice error={error ?? actionError} />
          {loading && !view && <SkeletonRows rows={4} />}
          {view && <Summary view={view} />}

          {view && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tooltip title={!canManage ? NO_MANAGE : released ? 'This line is released, so its drawings cannot change.' : 'Pick the DXF files. You see a check before anything is saved.'}>
                <span>
                  <Button variant="outlined" disabled={!mayUpload || busy != null} onClick={() => input.current?.click()}
                    startIcon={busy === 'read' ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}>
                    {busy === 'read' ? 'Reading…' : 'Upload DXF files'}
                  </Button>
                </span>
              </Tooltip>
              <input ref={input} type="file" accept=".dxf" multiple hidden onChange={choose} data-testid="drawings-input" />
              {skipped.length > 0 && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
                  Not a DXF, left out: {skipped.join(', ')}
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

          {view && view.drawings.length > 0 && (
            <SectionCard title="Saved drawings" subtitle={`${view.drawings.length} on this line`} flush>
              <Box sx={{ p: 1.5 }}>
                <DrawingsTable drawings={view.drawings} canManage={canManage} released={released} onEnlarge={setEnlarged} onDelete={setToDelete} />
              </Box>
            </SectionCard>
          )}
          {view && view.drawings.length === 0 && !pending && (
            <EmptyState title="No drawings yet" body="Each plate part with a drawing is listed here, with how much of its rectangle it really uses." />
          )}

          {view && view.partsWithoutDrawing.length > 0 && (
            <Box>
              <Button size="small" onClick={() => setWithoutOpen((o) => !o)} endIcon={withoutOpen ? <ExpandLessRounded /> : <ExpandMoreRounded />} data-testid="drawings-without-toggle">
                {view.partsWithoutDrawing.length} {view.partsWithoutDrawing.length === 1 ? 'plate part has' : 'plate parts have'} no drawing
              </Button>
              <Collapse in={withoutOpen} unmountOnExit>
                <Box sx={{ overflowX: 'auto', mt: 1 }} data-testid="drawings-without">
                  <Box component="table" sx={TABLE_SX}>
                    <thead><tr><th>Code</th><th>Name</th><th>Drawing mark</th><th className="n">Pieces</th></tr></thead>
                    <tbody>
                      {view.partsWithoutDrawing.map((p) => (
                        <tr key={p.id}>
                          <td>{p.code ? <Mono>{p.code}</Mono> : '—'}</td>
                          <td style={{ overflowWrap: 'anywhere' }}>{p.name}</td>
                          <td>{p.mark ? <Mono>{p.mark}</Mono> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>no drawing mark</Box>}</td>
                          <td className="n">{p.pieces}</td>
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

      <Dialog open={!!enlarged} onClose={() => setEnlarged(null)} maxWidth="md" fullWidth aria-labelledby="drawing-large-title">
        {enlarged && (
          <>
            <DialogHeader title={<span id="drawing-large-title">{enlarged.mark}</span>} subtitle={`${sizeText(enlarged.geometry.lengthMm, enlarged.geometry.widthMm)} · uses ${fmtPct(enlarged.geometry.usePct)} of its rectangle`} onClose={() => setEnlarged(null)} />
            <DialogContent dividers>
              <Box sx={{ display: 'grid', gap: 1.5, justifyItems: 'center' }}>
                <Box sx={{ width: '100%', maxHeight: '60vh', display: 'flex', justifyContent: 'center' }}>
                  <Outline geometry={enlarged.geometry} w={720} h={400} />
                </Box>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Fact label="Cut length">{fmtCutM(enlarged.geometry.cutLengthMm)} ({fmtMm(enlarged.geometry.cutLengthMm)} mm)</Fact>
                  <Fact label="Piercings">{enlarged.geometry.piercings}</Fact>
                  <Fact label="Holes">{enlarged.geometry.holes}{enlarged.geometry.holes ? ` · ${holesTitle(enlarged.geometry)}` : ''}</Fact>
                  <Fact label="Cut-outs">{enlarged.geometry.innerCuts}</Fact>
                </Box>
                {enlarged.warnings.length > 0 && <Box sx={{ color: 'var(--c-warning-800)', fontSize: 13 }}><CapsLabel>Warnings</CapsLabel>{enlarged.warnings.join(' · ')}</Box>}
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this drawing?"
        entityName={toDelete ? `${toDelete.mark} (${toDelete.fileName})` : undefined}
        body="The part goes back to having no drawing. You can upload the file again."
        confirmLabel="Delete" danger
        onConfirm={async () => { if (toDelete) await remove(toDelete); }}
        onClose={() => setToDelete(null)}
      />
    </Dialog>
  );
}

/** The "Part drawings" button for the Nesting stage: reads the summary itself and opens the dialog. */
export function DrawingsButton({ orderId, lineId, canManage, onChanged }: {
  orderId: number; lineId: number; canManage: boolean; onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, error, loading, setData } = useLoad(() => getDrawings(orderId, lineId), [orderId, lineId]);
  return (
    <>
      <Tooltip title="Upload the DXF of each plate part to see its true shape, how much steel true-shape nesting could save, and the CNC cut length.">
        <Button variant="outlined" startIcon={<DrawRounded />} onClick={() => setOpen(true)} data-testid="drawings-button">
          {buttonLabel(data?.summary)}
        </Button>
      </Tooltip>
      {open && (
        <DrawingsDialog open onClose={() => setOpen(false)} orderId={orderId} lineId={lineId} canManage={canManage}
          view={data} error={error} loading={loading} onView={setData} onChanged={onChanged} />
      )}
    </>
  );
}
