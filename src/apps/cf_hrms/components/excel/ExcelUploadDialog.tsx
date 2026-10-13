import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  LinearProgress,
  Link,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import {
  Callout,
  ConfirmDialog,
  DialogHeader,
  ErrorNotice,
  Mono,
  ToneBadge,
  errorMessage,
  useToast,
  type StatusTone,
} from '@shared/ui';
import {
  excelApi,
  readFileBase64,
  saveBase64File,
  saveBlob,
  type ExcelApplyResult,
  type ExcelEntity,
  type ExcelPreview,
  type ExcelPreviewRow,
} from '../../api/excel';

const MAX_BYTES = 10 * 1024 * 1024;
/** Rows drawn before "Show all" — a 2,000-row file must not freeze the dialog. */
const ROW_CAP = 200;

type Action = ExcelPreviewRow['action'];

const STATUS: Record<Action, { label: string; tone: StatusTone }> = {
  PROBLEM: { label: 'Has a problem', tone: 'danger' },
  ADD: { label: 'To add', tone: 'success' },
  CHANGE: { label: 'To change', tone: 'info' },
  SAME: { label: 'No change', tone: 'neutral' },
};

const ORDER: Record<Action, number> = { PROBLEM: 0, ADD: 1, CHANGE: 2, SAME: 3 };

const blank = (v: string | null | undefined) =>
  v === null || v === undefined || v === '' ? '(blank)' : v;

const num = (n: number) => n.toLocaleString();

/** One CSV cell: quoted, and never read by Excel as a formula. */
function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function problemsCsv(rows: ExcelPreviewRow[]): string {
  const lines = [['Row', 'What', 'Problem'].map(csvCell).join(',')];
  for (const r of rows) {
    for (const p of r.problems) lines.push([csvCell(r.row), csvCell(r.label), csvCell(p)].join(','));
  }
  // The BOM is what makes Excel read the file as UTF-8.
  const BOM = String.fromCharCode(0xfeff);
  const EOL = String.fromCharCode(13, 10);
  return BOM + lines.join(EOL) + EOL;
}

function Tile({ value, label, tone }: { value: number; label: string; tone?: StatusTone }) {
  const strong = tone && value > 0;
  return (
    <Box
      sx={{
        minWidth: 0,
        p: 1.5,
        borderRadius: 'var(--r-sm)',
        border: '1px solid',
        borderColor: strong ? `var(--c-${tone}-600)` : 'var(--c-border)',
        background: 'var(--c-surface-2)',
      }}
    >
      <Box
        sx={{
          fontFamily: 'var(--font-mono)',
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.2,
          color: strong ? `var(--c-${tone}-800)` : 'var(--c-text)',
        }}
      >
        {num(value)}
      </Box>
      <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>{label}</Box>
    </Box>
  );
}

function Tiles({ children, columns }: { children: ReactNode; columns: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1,
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(${columns}, minmax(0, 1fr))` },
        mb: 2,
      }}
    >
      {children}
    </Box>
  );
}

const GRID = { xs: '52px minmax(0, 1fr)', sm: '64px minmax(0, 1.1fr) 132px minmax(0, 2fr)' };

function RowDetails({ row }: { row: ExcelPreviewRow }) {
  if (row.problems.length === 0 && row.changes.length === 0) {
    return <Box sx={{ color: 'var(--c-text-3)' }}>{row.action === 'ADD' ? 'A new row.' : '—'}</Box>;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      {row.problems.map((p, i) => (
        <Box key={`p${i}`} sx={{ display: 'flex', gap: 0.75, color: 'var(--c-text)' }}>
          <WarningAmberRounded
            aria-hidden
            sx={{ fontSize: 16, mt: '2px', flexShrink: 0, color: 'var(--c-danger-600)' }}
          />
          <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p}</Box>
        </Box>
      ))}
      {row.changes.map((c, i) => (
        <Box key={`c${i}`} sx={{ minWidth: 0, overflowWrap: 'anywhere', color: 'var(--c-text-2)' }}>
          <Box component="span" sx={{ fontWeight: 600, color: 'var(--c-text)' }}>
            {c.column}:
          </Box>{' '}
          {blank(c.from)} <span aria-label="changes to">→</span>{' '}
          <Box component="span" sx={{ color: 'var(--c-text)' }}>
            {blank(c.to)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function RowsTable({ rows }: { rows: ExcelPreviewRow[] }) {
  return (
    <Box
      role="table"
      aria-label="Rows in the file"
      sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', fontSize: 13 }}
    >
      <Box
        role="row"
        sx={{
          display: { xs: 'none', sm: 'grid' },
          gridTemplateColumns: GRID,
          columnGap: 1.5,
          px: 1.5,
          py: 1,
          background: 'var(--c-surface-2)',
          color: 'var(--c-text-2)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <Box role="columnheader">Row</Box>
        <Box role="columnheader">What</Box>
        <Box role="columnheader">Status</Box>
        <Box role="columnheader">Details</Box>
      </Box>
      {rows.map((r, i) => (
        <Box
          role="row"
          key={`${r.row}-${i}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: GRID,
            columnGap: 1.5,
            rowGap: 0.5,
            px: 1.5,
            py: 1,
            alignItems: 'start',
            borderTop: { xs: i === 0 ? 'none' : '1px solid var(--c-border)', sm: '1px solid var(--c-border)' },
          }}
        >
          <Box role="cell" sx={{ gridRow: { xs: '1 / span 3', sm: 'auto' } }}>
            <Box component="span" sx={{ display: { xs: 'block', sm: 'none' }, fontSize: 11, color: 'var(--c-text-3)' }}>
              Row
            </Box>
            <Mono>{r.row}</Mono>
          </Box>
          <Box role="cell" sx={{ minWidth: 0, overflowWrap: 'anywhere', color: 'var(--c-text)', fontWeight: 500 }}>
            {r.label || '(no name)'}
          </Box>
          <Box role="cell" sx={{ minWidth: 0 }}>
            <ToneBadge tone={STATUS[r.action].tone} label={STATUS[r.action].label} />
          </Box>
          <Box role="cell" sx={{ minWidth: 0 }}>
            <RowDetails row={r} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  entity: ExcelEntity;
  /** What the screen calls its rows: ['position', 'positions']. */
  noun: [string, string];
  /** Employees only: may this person add NEW employees by Excel. */
  canBulkAdd?: boolean;
  /** The screen's current filters — for "Download a fresh file". */
  filters?: Record<string, string>;
  /** Called once after a successful apply, so the list behind refreshes. */
  onApplied: () => void;
}

/**
 * Upload Excel (CF_HRMS_HIRING_SPEC.md §13.5): choose a file → see exactly what
 * it would do → apply → what was done. Nothing is changed before Apply, and the
 * server re-checks everything when it is pressed.
 *
 * The body is mounted only while the dialog is open, so the file and every
 * step are dropped the moment it closes.
 */
export function ExcelUploadDialog(props: Props) {
  if (!props.open) return null;
  return <UploadBody {...props} />;
}

function UploadBody({ onClose, entity, noun, canBulkAdd, filters, onApplied }: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<{ fileName: string; contentBase64: string } | null>(null);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [result, setResult] = useState<ExcelApplyResult | null>(null);
  const [busy, setBusy] = useState<null | 'reading' | 'apply' | 'fresh'>(null);
  const [error, setError] = useState<unknown>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showSame, setShowSame] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirm, setConfirm] = useState<null | { skip: boolean }>(null);

  const applying = busy === 'apply';
  const many = noun[1];
  const word = (n: number) => (n === 1 ? noun[0] : noun[1]);
  const isEmployees = entity === 'employees';

  const startOver = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setPickError(null);
    setStale(false);
    setShowSame(false);
    setShowAll(false);
  };

  const take = async (picked: File | undefined | null) => {
    if (!picked || busy) return;
    setError(null);
    setPickError(null);
    if (!/\.xlsx$/i.test(picked.name)) {
      setPickError(
        `"${picked.name}" is not an Excel file this screen can read. Choose a file that ends in .xlsx — the one you downloaded from this screen.`,
      );
      return;
    }
    if (picked.size > MAX_BYTES) {
      setPickError(
        `"${picked.name}" is larger than 10 MB, which is too big. Use a file downloaded from this screen.`,
      );
      return;
    }
    setBusy('reading');
    try {
      const contentBase64 = await readFileBase64(picked);
      const next = { fileName: picked.name, contentBase64 };
      const p = await excelApi.preview(entity, next);
      setFile(next);
      setPreview(p);
      setStale(false);
      setShowSame(false);
      setShowAll(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const downloadFresh = async () => {
    if (busy) return;
    setBusy('fresh');
    try {
      saveBase64File(await excelApi.workbook(entity, filters));
    } catch (e) {
      toast.error(errorMessage(e, 'The Excel file could not be made. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const apply = async (skip: boolean) => {
    if (!file || !preview) return;
    setBusy('apply');
    setError(null);
    setStale(false);
    try {
      const res = await excelApi.apply(entity, {
        fileName: file.fileName,
        contentBase64: file.contentBase64,
        expect: { add: preview.summary.add, change: preview.summary.change },
        ...(skip ? { skipProblemRows: true } : {}),
      });
      setResult(res);
      onApplied();
    } catch (e) {
      const err = e as { status?: number; code?: string };
      if (err?.status === 409 && err?.code === 'PREVIEW_STALE') {
        // Nothing was applied. Read the same file again against today's data.
        try {
          setPreview(await excelApi.preview(entity, file));
          setStale(true);
          setShowAll(false);
        } catch (again) {
          setError(again);
        }
      } else {
        setError(e);
      }
    } finally {
      setBusy(null);
    }
  };

  const sorted = useMemo(
    () =>
      preview
        ? preview.rows
            .map((r, i) => ({ r, i }))
            .sort((a, b) => ORDER[a.r.action] - ORDER[b.r.action] || a.i - b.i)
            .map((x) => x.r)
        : [],
    [preview],
  );
  const labelByRow = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of preview?.rows ?? []) m.set(r.row, r.label);
    return m;
  }, [preview]);

  const freshLink = (
    <Link
      component="button"
      type="button"
      onClick={() => void downloadFresh()}
      disabled={!!busy}
      sx={{ fontSize: 'inherit', verticalAlign: 'baseline' }}
    >
      {busy === 'fresh' ? 'Making the file…' : 'Download a fresh file'}
    </Link>
  );

  // ── Step 1: choose a file ────────────────────────────────────────────────
  const chooseStep = (
    <>
      <ErrorNotice error={error} fallback="The file could not be read. Try again." />
      {pickError && (
        <Callout tone="danger" title="This file cannot be used" icon={<WarningAmberRounded />}>
          {pickError}
        </Callout>
      )}
      <Box
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          void take(e.dataTransfer.files?.[0]);
        }}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5,
          textAlign: 'center',
          px: 2,
          py: { xs: 4, sm: 6 },
          borderRadius: 'var(--r-sm)',
          border: '2px dashed',
          borderColor: dragging ? 'var(--c-primary-500)' : 'var(--c-border)',
          background: dragging ? 'var(--c-primary-50)' : 'var(--c-surface-2)',
        }}
      >
        {busy === 'reading' ? (
          <>
            <CircularProgress size={28} />
            <Box sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
              Reading the file. Nothing is being changed.
            </Box>
          </>
        ) : (
          <>
            <UploadFileRounded aria-hidden sx={{ fontSize: 36, color: 'var(--c-text-3)' }} />
            <Box sx={{ fontSize: 14, color: 'var(--c-text)' }}>
              Drop the Excel file here, or choose it.
            </Box>
            <Button variant="contained" onClick={() => inputRef.current?.click()} disabled={!!busy}>
              Choose file
            </Button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0];
            // Clear it so choosing the same file again still fires.
            e.target.value = '';
            void take(picked);
          }}
        />
      </Box>
      <Box sx={{ mt: 1.5, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
        Use a file downloaded from this screen. Rows you leave out are not removed. {freshLink}
      </Box>
    </>
  );

  // ── Step 2: the preview ──────────────────────────────────────────────────
  let previewStep: ReactNode = null;
  let previewActions: ReactNode = null;
  if (preview && !result) {
    const { add, change, same, problems } = preview.summary;
    const chooseAnother = (
      <Button onClick={startOver} disabled={!!busy}>
        Choose another file
      </Button>
    );

    if (preview.fileProblems.length > 0) {
      previewStep = (
        <Callout tone="danger" title="This file cannot be used" icon={<WarningAmberRounded />} sx={{ mb: 0 }}>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {preview.fileProblems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </Box>
          <Box sx={{ mt: 1 }}>Nothing was changed.</Box>
        </Callout>
      );
      previewActions = (
        <>
          <Button onClick={() => void downloadFresh()} disabled={!!busy}>
            {busy === 'fresh' ? 'Making the file…' : 'Download a fresh file'}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" onClick={startOver} disabled={!!busy}>
            Choose another file
          </Button>
        </>
      );
    } else {
      const good = add + change;
      const bulkBlocked = isEmployees && add > 0 && !canBulkAdd;
      const visible = showSame ? sorted : sorted.filter((r) => r.action !== 'SAME');
      const drawn = showAll ? visible : visible.slice(0, ROW_CAP);
      const withProblems = sorted.filter((r) => r.problems.length > 0);

      let reason: string | null = null;
      if (bulkBlocked) reason = null;
      else if (problems > 0) {
        reason = good > 0 ? 'Fix the problems first, or use the button below.' : 'Fix the problems first.';
      } else if (good === 0) {
        reason = 'Nothing to apply: every row is the same as in the app.';
      }

      previewStep = (
        <>
          {stale && (
            <Callout tone="info" title="The data changed while you were looking. Here is the new preview.">
              Nothing was applied. Check the numbers again before you apply.
            </Callout>
          )}
          <ErrorNotice error={error} fallback="The file could not be applied. Nothing was changed." />

          <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1, overflowWrap: 'anywhere' }}>
            File: <Mono>{preview.fileName || file?.fileName}</Mono>
          </Box>
          <Tiles columns={4}>
            <Tile value={add} label="To add" />
            <Tile value={change} label="To change" />
            <Tile value={same} label="No change" />
            <Tile value={problems} label="Problems" tone="danger" />
          </Tiles>

          {isEmployees && add > 0 && (
            <Callout
              tone="warning"
              icon={<WarningAmberRounded />}
              title={`${num(add)} new ${add === 1 ? 'employee' : 'employees'} will be created without the hiring steps: no offer or appointment letters.`}
            >
              {bulkBlocked
                ? 'Adding new employees by Excel needs a right you do not have. Ask the Owner. You can still upload a file that only changes existing employees.'
                : undefined}
            </Callout>
          )}

          {visible.length > 0 ? (
            <RowsTable rows={drawn} />
          ) : (
            <Box sx={{ fontSize: 14, color: 'var(--c-text-2)', py: 1 }}>
              {same > 0
                ? 'Every row in the file is the same as in the app.'
                : 'The file has no rows.'}
            </Box>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1 }}>
            {visible.length > drawn.length && (
              <Button size="small" onClick={() => setShowAll(true)}>
                Show all {num(visible.length)}
              </Button>
            )}
            {same > 0 && (
              <Button size="small" onClick={() => setShowSame((v) => !v)}>
                {showSame
                  ? `Hide the ${num(same)} ${same === 1 ? 'row' : 'rows'} with no change`
                  : `Show the ${num(same)} ${same === 1 ? 'row' : 'rows'} with no change`}
              </Button>
            )}
            {withProblems.length > 0 && (
              <Button
                size="small"
                onClick={() => {
                  const base = (preview.fileName || file?.fileName || many).replace(/\.xlsx$/i, '');
                  saveBlob(
                    new Blob([problemsCsv(withProblems)], { type: 'text/csv;charset=utf-8' }),
                    `Problems-${base}.csv`,
                  );
                }}
              >
                Download the problems
              </Button>
            )}
          </Box>
        </>
      );

      previewActions = (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', minWidth: 0 }}>
          {reason && (
            <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', textAlign: { xs: 'left', sm: 'right' } }}>
              {reason}
            </Box>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            {chooseAnother}
            <Box sx={{ flex: 1 }} />
            {!bulkBlocked && (
              <Button
                variant="contained"
                disabled={!!busy || problems > 0 || good === 0}
                onClick={() => setConfirm({ skip: false })}
                startIcon={applying ? <CircularProgress size={14} color="inherit" /> : undefined}
              >
                {applying ? 'Applying…' : 'Apply'}
              </Button>
            )}
          </Box>
          {!bulkBlocked && problems > 0 && good > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                size="small"
                disabled={!!busy}
                onClick={() => setConfirm({ skip: true })}
                sx={{ whiteSpace: 'normal', textAlign: 'left' }}
              >
                Apply the {num(good)} good {good === 1 ? 'row' : 'rows'} and skip the {num(problems)} with
                problems
              </Button>
            </Box>
          )}
        </Box>
      );
    }
  }

  // ── Step 4: the result ───────────────────────────────────────────────────
  const resultStep = result && (
    <>
      <Tiles columns={3}>
        <Tile value={result.added} label="Added" />
        <Tile value={result.changed} label="Changed" />
        <Tile value={result.skipped} label="Skipped" />
      </Tiles>
      {result.issuedCodes.length > 0 ? (
        <>
          <Box sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 1 }}>
            Codes given to the new {many}
          </Box>
          <Box
            role="table"
            aria-label="Codes given to new rows"
            sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', fontSize: 13 }}
          >
            {result.issuedCodes.map((c, i) => (
              <Box
                role="row"
                key={`${c.row}-${c.code}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '72px minmax(0, 1fr)',
                  columnGap: 1.5,
                  px: 1.5,
                  py: 0.75,
                  borderTop: i === 0 ? 'none' : '1px solid var(--c-border)',
                }}
              >
                <Box role="cell" sx={{ color: 'var(--c-text-2)' }}>
                  Row <Mono>{c.row}</Mono>
                </Box>
                <Box role="cell" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Mono>{c.code}</Mono>
                  {labelByRow.get(c.row) && (
                    <Box component="span" sx={{ color: 'var(--c-text-2)', ml: 1 }}>
                      {labelByRow.get(c.row)}
                    </Box>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      ) : (
        result.added > 0 && (
          <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No new codes were given.</Box>
        )
      )}
    </>
  );

  // ── The confirm restates the counts ──────────────────────────────────────
  let confirmBody: ReactNode = null;
  if (confirm && preview) {
    const { add, change, problems } = preview.summary;
    const parts: string[] = [];
    if (add > 0) parts.push(`add ${num(add)}`);
    if (change > 0) parts.push(`change ${num(change)}`);
    const text = parts.join(' and ');
    const total = add + change;
    confirmBody = (
      <>
        <Box sx={{ color: 'var(--c-text)' }}>
          {text.charAt(0).toUpperCase() + text.slice(1)} {word(total)}?
          {confirm.skip &&
            ` ${num(problems)} ${problems === 1 ? 'row' : 'rows'} with problems will be skipped.`}
        </Box>
        {isEmployees && add > 0 && (
          <Box sx={{ mt: 1.5, display: 'flex', gap: 0.75 }}>
            <WarningAmberRounded
              aria-hidden
              sx={{ fontSize: 18, mt: '1px', flexShrink: 0, color: 'var(--c-warning-600)' }}
            />
            <Box>
              {num(add)} new {add === 1 ? 'employee' : 'employees'} will be created without the hiring
              steps: no offer or appointment letters.
            </Box>
          </Box>
        )}
      </>
    );
  }

  const title = result
    ? 'The file was applied'
    : preview
      ? 'Check before you apply'
      : `Upload ${many} from Excel`;
  const subtitle = result
    ? undefined
    : preview
      ? 'Nothing has been changed yet.'
      : 'Step 1 of 2: choose the file. You will see what it would do before anything changes.';

  return (
    <>
      <Dialog
        open
        onClose={applying ? undefined : onClose}
        fullWidth
        maxWidth="md"
        fullScreen={phone}
        aria-busy={!!busy}
      >
        <DialogHeader title={title} subtitle={subtitle} onClose={onClose} busy={applying} />
        {applying && <LinearProgress aria-label="Applying the file" />}
        <DialogContent sx={{ pt: 1, minWidth: 0 }}>
          {result ? resultStep : preview ? previewStep : chooseStep}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          {result ? (
            <Button variant="contained" onClick={onClose}>
              Done
            </Button>
          ) : preview ? (
            previewActions
          ) : (
            <Button onClick={onClose} disabled={busy === 'reading'}>
              Cancel
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        title="Apply this file?"
        body={confirmBody}
        confirmLabel={confirm?.skip ? 'Apply the good rows' : 'Apply'}
        onConfirm={() => {
          // The confirm only asks. The apply runs in the dialog behind, where a
          // refusal is shown above the preview.
          if (confirm) void apply(confirm.skip);
        }}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
