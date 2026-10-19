/**
 * The pieces every tax screen shares (CF_HRMS_HIRING_SPEC.md §25.4): the CA banner, the year
 * picker, the tax sheet (both regimes side by side), the declarations editor (the person's and
 * HR's), the proof file viewer, words for statuses. Laid out to work at phone width: grids that
 * fold to one column, rows that wrap, no wide tables.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Box, Button, Checkbox, CircularProgress, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import { Callout, ConfirmDialog, EmptyState, ErrorNotice, FormDialog, SectionCard, ToneBadge, errorMessage, useToast, type BadgeTone } from '@shared/ui';
import type { DeclLine, Declarations, Kind, LineInput, Review, TaxFile, TaxSheet, Regime } from '../../api/tax';
import { readFileBase64 } from '../../api/tax';
import { saveBase64File } from '../../api/excel';
import { rupees, parseAmount } from '../payroll/payWords';
import { LINE_STATUS, REGIME_WORD, WINDOW_WORD } from './taxWords';

/** "Not yet reviewed by our CA for <year>" — on every tax screen until the Owner ticks it. */
export function TaxBanner({ review }: { review?: Review | null }) {
  if (!review?.banner) return null;
  return <Callout tone="warning" title={`Not yet reviewed by our CA for ${review.year}`} sx={{ mb: 2 }}>{review.banner}</Callout>;
}

export function YearSelect({ value, years, onChange }: { value: string; years: string[]; onChange: (y: string) => void }) {
  return (
    <TextField select size="small" label="Tax year" value={years.includes(value) ? value : ''} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 130 }}>
      {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
    </TextField>
  );
}

/** A label and a value. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{label}</Typography>
      <Typography sx={{ fontSize: 14.5, fontWeight: 500, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{children}</Typography>
    </Box>
  );
}

const lineRow = (l: { label: string; amount: number | null; refused?: boolean; source?: string | null }, i: number) => (
  <Box key={i} sx={{ display: 'flex', gap: 1, py: 0.6, borderBottom: '1px solid var(--c-divider)', alignItems: 'baseline', '&:last-of-type': { borderBottom: 0 } }}>
    <Typography title={l.source ?? undefined} sx={{ flex: 1, minWidth: 0, fontSize: 13, color: l.refused ? 'var(--c-text-2)' : undefined, overflowWrap: 'anywhere' }}>{l.label}</Typography>
    <Typography sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.amount == null ? '' : rupees(l.amount)}</Typography>
  </Box>
);

/** The tax sheet: TDS of the month, both regimes side by side, the months, the claims. */
export function SheetView({ sheet, onMonth }: { sheet: TaxSheet; onMonth?: (m: string) => void }) {
  if (!sheet.available || !sheet.regimes || !sheet.tds) {
    return <EmptyState title="No tax sheet for this month" hint={sheet.reason ?? 'There is no pay to work it from.'} />;
  }
  const chosen = sheet.regime ?? 'NEW';
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        {onMonth && (
          <TextField select size="small" label="As of" value={sheet.month} onChange={(e) => onMonth(e.target.value)} sx={{ minWidth: 150 }}>
            {sheet.months.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </TextField>
        )}
        <ToneBadge tone="info" label={REGIME_WORD[chosen]} noIcon />
        {sheet.panStatus !== 'VALID' && <ToneBadge tone="danger" label="No valid PAN" noIcon />}
        {sheet.proofsStatus === 'CLOSED' && <ToneBadge tone="neutral" label="Proofs closed: verified amounts only" noIcon />}
      </Box>
      <Callout tone={sheet.chosenIsCheaper ? 'success' : 'info'} title={sheet.sentence}>
        {sheet.chosenIsCheaper ? `You are in the ${chosen === 'NEW' ? 'new' : 'old'} regime.` : `You are in the ${chosen === 'NEW' ? 'new' : 'old'} regime; the other one would cost less on these figures.`}
      </Callout>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5 }}>
        <Fact label={`TDS for ${sheet.monthLabel}`}>{rupees(sheet.tds.thisMonth)}</Fact>
        <Fact label="Tax for the year">{rupees(sheet.tds.yearTax)}</Fact>
        <Fact label="Deducted so far">{rupees(sheet.tds.soFar + sheet.tds.previousEmployer)}</Fact>
        <Fact label="Months left">{sheet.tds.monthsLeft}</Fact>
        {sheet.run && <Fact label={`The run (${sheet.run.status.toLowerCase()})`}>{sheet.run.tds == null ? '—' : `${rupees(sheet.run.tds)}${sheet.run.source === 'MANUAL' ? ' (set by HR)' : ''}`}</Fact>}
      </Box>
      {sheet.noPan?.applied && sheet.noPan.line && <Callout tone="danger" title="No valid PAN: the higher rate">{sheet.noPan.line}</Callout>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {(['NEW', 'OLD'] as Regime[]).map((r) => {
          const g = sheet.regimes![r];
          return (
            <SectionCard key={r} title={`${REGIME_WORD[r]}: ${rupees(g.projectedTax)} for the year`} subtitle={`${r === chosen ? 'Yours. ' : ''}TDS this month would be ${rupees(g.thisMonthTds)}.`}>
              <Box>{g.computation.lines.map(lineRow)}</Box>
              {g.computation.refused.length > 0 && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>Not counted in this regime: {g.computation.refused.map((x) => x.what).join(', ')}.</Typography>
              )}
              <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 1.5, mb: 0.5 }}>This month</Typography>
              <Box>{g.projection.map(lineRow)}</Box>
            </SectionCard>
          );
        })}
      </Box>
      {sheet.timeline && sheet.timeline.length > 0 && (
        <SectionCard title="The months of the year" subtitle="Paid = a locked payroll. Estimated = before payroll ran here. To come = at the salary.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 }}>
            {sheet.timeline.map((t) => (
              <Box key={t.month} sx={{ p: 1, border: '1px solid var(--c-divider)', borderRadius: 1 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{t.month} · {({ PAID: 'paid', ESTIMATED: 'estimated', THIS: 'this month', THIS_ESTIMATED: 'this month (salary)', TO_COME: 'to come' } as Record<string, string>)[t.kind] ?? t.kind}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Taxable {rupees(t.taxable)}{t.kind === 'PAID' ? ` · TDS ${rupees(t.tds)}` : ''}</Typography>
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
      {sheet.claims && sheet.claims.length > 0 && (
        <SectionCard title="Your declarations in this sheet">
          {sheet.claims.map((cl) => (
            <Box key={cl.lineId} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', py: 0.6, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
              <Typography sx={{ flex: '1 1 200px', fontSize: 13 }}>{cl.label}</Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{rupees(cl.counted)} of {rupees(cl.declared)} — {cl.how}</Typography>
            </Box>
          ))}
        </SectionCard>
      )}
      {(sheet.warnings ?? []).length > 0 && (
        <Callout tone="warning" title="To know">{(sheet.warnings ?? []).map((w, i) => <Typography key={i} sx={{ fontSize: 13 }}>{w}</Typography>)}</Callout>
      )}
    </Stack>
  );
}

/** A proof shown in place: a PDF in a frame, an image as an image. */
export function FilePreview({ file, height = 520 }: { file: TaxFile | null; height?: number }) {
  const url = useMemo(() => {
    if (!file) return null;
    const bin = atob(file.contentBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
  }, [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!file || !url) return <Box sx={{ height, display: 'grid', placeItems: 'center' }}><CircularProgress size={22} /></Box>;
  if (file.mimeType.startsWith('image/')) return <Box component="img" src={url} alt={file.fileName} sx={{ maxWidth: '100%', maxHeight: height, display: 'block', mx: 'auto' }} />;
  return <Box component="iframe" title={file.fileName} src={url} sx={{ width: '100%', height, border: '1px solid var(--c-divider)', borderRadius: 1 }} />;
}

export function FileDialog({ open, load, onClose }: { open: boolean; load: () => Promise<TaxFile>; onClose: () => void }) {
  const [file, setFile] = useState<TaxFile | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!open) { setFile(null); setError(null); return; }
    load().then(setFile).catch(setError);
  }, [open, load]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file?.fileName ?? 'Proof'}</Box>
        {file && <Button size="small" onClick={() => saveBase64File(file)}>Download</Button>}
        <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
      </DialogTitle>
      <DialogContent>
        <ErrorNotice error={error} />
        {!error && <FilePreview file={file} height={560} />}
      </DialogContent>
    </Dialog>
  );
}

/* ── declarations ─────────────────────────────────────────────────────── */

type Draft = { line: DeclLine | null; kind: string; amount: string; details: Record<string, string | boolean> };
const blankDraft = (): Draft => ({ line: null, kind: 'PPF', amount: '', details: {} });
const FIELDS: Record<string, { key: string; label: string; type?: 'month' | 'bool' | 'number'; help?: string }[]> = {
  RENT: [{ key: 'monthlyRent', label: 'Rent a month (₹)', type: 'number' }, { key: 'fromMonth', label: 'From month', type: 'month' }, { key: 'toMonth', label: 'To month', type: 'month' },
    { key: 'landlordName', label: 'Landlord’s name' }, { key: 'landlordPan', label: 'Landlord’s PAN' }, { key: 'landlordAddress', label: 'Landlord’s address' }],
  LTA: [{ key: 'journeys', label: 'Journeys (from – to, dates)' }, { key: 'journeysUsedInBlock', label: 'Journeys already exempted in this block', type: 'number' }],
  HOME_LOAN_INTEREST: [{ key: 'lenderName', label: 'Lender’s name' }, { key: 'lenderType', label: 'Lender (BANK, EMPLOYER or OTHER)' }, { key: 'lenderPan', label: 'Lender’s PAN (if not a bank)' }, { key: 'lenderAddress', label: 'Lender’s address' }],
  PREVIOUS_EMPLOYER: [{ key: 'employerName', label: 'Previous employer' }, { key: 'tan', label: 'Their TAN' }, { key: 'salary', label: 'Salary they paid (₹)', type: 'number' }, { key: 'exemptions', label: 'Exemptions they gave (₹)', type: 'number' },
    { key: 'pt', label: 'Professional tax they deducted (₹)', type: 'number' }, { key: 'tds', label: 'TDS they deducted (₹)', type: 'number' }],
  MEDICAL_SELF: [{ key: 'insured', label: 'Who is insured' }, { key: 'senior', label: 'A senior citizen (60+) is insured', type: 'bool' }],
  MEDICAL_PARENTS: [{ key: 'insured', label: 'Parents insured' }, { key: 'parentsSenior', label: 'A parent is a senior citizen', type: 'bool' }],
};
const NO_AMOUNT = ['RENT', 'PREVIOUS_EMPLOYER'];

/**
 * The person's declarations for a year, with proofs. `mode` 'self' (the person) or 'hr'.
 * `focus` 'proofs' shows each line with its proof upload first.
 */
export function DeclarationsEditor({ data, mode, focus = 'declarations', actions, onChanged }: {
  data: Declarations;
  mode: 'self' | 'hr';
  focus?: 'declarations' | 'proofs';
  actions: {
    add: (body: LineInput) => Promise<unknown>;
    update: (id: number, body: LineInput) => Promise<unknown>;
    remove: (id: number) => Promise<unknown>;
    upload?: (lineId: number, body: { fileName: string; contentBase64: string }) => Promise<unknown>;
    file: (fileId: number) => Promise<TaxFile>;
    removeFile?: (fileId: number) => Promise<unknown>;
  };
  onChanged: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<DeclLine | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<number | null>(null);
  const canDeclare = mode === 'hr' || data.declare.open;
  const canProve = mode === 'hr' || data.prove.open;
  const kindOf = (k: string): Kind | undefined => data.kinds.find((x) => x.kind === k);
  const loadFile = useMemo(() => (viewing == null ? () => Promise.reject(new Error('none')) : () => actions.file(viewing)), [viewing, actions]);

  const pick = () => fileInput.current?.click();
  const onFile = async (f: File | undefined) => {
    const lineId = uploadFor.current;
    if (!f || lineId == null || !actions.upload) return;
    if (f.size > 10 * 1024 * 1024) { toast.error('That file is over 10 MB. Reduce it or split it.'); return; }
    setUploading(lineId);
    try {
      await actions.upload(lineId, await readFileBase64(f));
      toast.success('Proof uploaded.');
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, 'The proof could not be uploaded.'));
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const total = data.lines.reduce((s, l) => s + l.declaredAmount, 0);
  return (
    <Stack spacing={2}>
      <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      {mode === 'self' && (
        <Callout tone={data.declare.open ? 'info' : 'neutral'} title={`${data.form ?? 'Declarations'} — the declaration window is ${WINDOW_WORD[data.declare.window.state]}`}>
          Declarations {data.declare.window.from} to {data.declare.window.to}{data.declare.reopenedUntil ? `; re-opened for you until ${data.declare.reopenedUntil}` : ''}. Proofs {data.prove.window.from} to {data.prove.window.to} ({WINDOW_WORD[data.prove.window.state]}).
          {' '}They count only in the old regime (except other income and a previous employer). After the proof window closes, only what HR verified counts.
        </Callout>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography sx={{ flex: 1, fontSize: 13.5, color: 'var(--c-text-2)' }}>{data.lines.length} line{data.lines.length === 1 ? '' : 's'} · {rupees(total)} declared</Typography>
        {canDeclare && focus === 'declarations' && <Button variant="contained" onClick={() => setDraft(blankDraft())}>Add a declaration</Button>}
      </Box>
      {data.lines.length === 0 && <EmptyState title="Nothing declared yet" hint={canDeclare ? 'Add rent, investments, insurance or a previous employer.' : 'The declaration window is not open.'} />}
      {data.lines.map((l) => {
        const st = LINE_STATUS[l.status] ?? { label: l.status, tone: 'neutral' as BadgeTone };
        return (
          <Box key={l.id} data-line={l.id} sx={{ border: '1px solid var(--c-divider)', borderRadius: 1.5, p: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{l.label}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {kindOf(l.kind)?.section ?? ''}{l.kind === 'RENT' ? ` · ${rupees(Number(l.details.monthlyRent ?? 0))} a month, ${String(l.details.fromMonth)} to ${String(l.details.toMonth)} · ${String(l.details.landlordName ?? '')}` : ''}
                  {l.kind === 'PREVIOUS_EMPLOYER' ? ` · ${String(l.details.employerName ?? '')} · TDS ${rupees(Number(l.details.tds ?? 0))}` : ''}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{rupees(l.declaredAmount)}</Typography>
              <ToneBadge tone={st.tone} label={st.label} noIcon />
            </Box>
            {l.status === 'VERIFIED' && l.acceptedAmount != null && l.acceptedAmount !== l.declaredAmount && <Typography sx={{ fontSize: 12.5, mt: 0.5 }}>Accepted {rupees(l.acceptedAmount)} of {rupees(l.declaredAmount)}.</Typography>}
            {l.status === 'REJECTED' && l.rejectReason && <Typography sx={{ fontSize: 12.5, mt: 0.5, color: 'var(--c-danger, #b00020)' }}>Rejected: {l.rejectReason}</Typography>}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1, alignItems: 'center' }}>
              {l.files.map((f) => (
                <Box key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Button size="small" startIcon={<VisibilityOutlined fontSize="small" />} onClick={() => setViewing(f.id)} sx={{ textTransform: 'none', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</Button>
                  {actions.removeFile && l.status !== 'VERIFIED' && canProve && (
                    <IconButton size="small" aria-label={`Remove ${f.fileName}`} onClick={async () => { try { await actions.removeFile!(f.id); onChanged(); } catch (e) { toast.error(errorMessage(e)); } }}><CloseRounded fontSize="small" /></IconButton>
                  )}
                </Box>
              ))}
              {actions.upload && canProve && (l.status !== 'VERIFIED' || mode === 'hr') && (
                <Button size="small" variant="outlined" disabled={uploading != null} startIcon={uploading === l.id ? <CircularProgress size={14} /> : <UploadFileRounded fontSize="small" />}
                  onClick={() => { uploadFor.current = l.id; pick(); }}>
                  Upload proof
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              {canDeclare && focus === 'declarations' && (mode === 'hr' || l.status !== 'VERIFIED') && (
                <>
                  <Button size="small" onClick={() => setDraft({ line: l, kind: l.kind, amount: String(l.declaredAmount), details: Object.fromEntries(Object.entries(l.details).map(([k, v]) => [k, typeof v === 'boolean' ? v : v == null ? '' : String(v)])) })}>Change</Button>
                  <Button size="small" color="error" onClick={() => setRemoving(l)}>Remove</Button>
                </>
              )}
            </Box>
            {focus === 'proofs' && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.5 }}>Proof: {kindOf(l.kind)?.proof ?? 'a receipt'} (PDF, JPG or PNG, at most 10 MB).</Typography>}
          </Box>
        );
      })}

      <FormDialog
        open={!!draft}
        title={draft?.line ? `Change: ${draft.line.label}` : 'Add a declaration'}
        subtitle={data.form ?? undefined}
        onClose={() => setDraft(null)}
        submitDisabled={!draft?.kind}
        onSubmit={async () => {
          if (!draft) return;
          const details = Object.fromEntries(Object.entries(draft.details).map(([k, v]) => [k, typeof v === 'boolean' ? v : (FIELDS[draft.kind]?.find((f) => f.key === k)?.type === 'number' ? (parseAmount(String(v)) ?? v) : v)]));
          const body: LineInput = { kind: draft.kind, details, ...(NO_AMOUNT.includes(draft.kind) ? {} : { amount: parseAmount(draft.amount) ?? draft.amount }) };
          if (draft.line) await actions.update(draft.line.id, body); else await actions.add(body);
          toast.success(draft.line ? 'Declaration saved.' : 'Declaration added.');
          onChanged();
        }}
      >
        {draft && (
          <Stack spacing={1.5}>
            <TextField select label="What" value={draft.kind} disabled={!!draft.line} onChange={(e) => setDraft({ ...draft, kind: e.target.value, details: {} })} size="small">
              {data.kinds.map((k) => <MenuItem key={k.kind} value={k.kind}>{k.label}{k.section ? ` — ${k.section}` : ''}</MenuItem>)}
            </TextField>
            {kindOf(draft.kind)?.newRegime === false && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Counts only in the old regime.</Typography>}
            {!NO_AMOUNT.includes(draft.kind) && (
              <TextField label="Amount for the year (₹)" size="small" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} inputProps={{ inputMode: 'decimal', 'data-field': 'amount' }} />
            )}
            {(FIELDS[draft.kind] ?? [{ key: 'note', label: 'Note (optional)' }]).map((f) => (f.type === 'bool' ? (
              <FormControlLabel key={f.key} control={<Checkbox checked={Boolean(draft.details[f.key])} onChange={(e) => setDraft({ ...draft, details: { ...draft.details, [f.key]: e.target.checked } })} />} label={f.label} />
            ) : (
              <TextField key={f.key} size="small" label={f.label} value={String(draft.details[f.key] ?? '')} placeholder={f.type === 'month' ? 'YYYY-MM' : undefined}
                onChange={(e) => setDraft({ ...draft, details: { ...draft.details, [f.key]: e.target.value } })} inputProps={{ 'data-field': f.key, ...(f.type === 'number' ? { inputMode: 'decimal' } : {}) }} />
            )))}
            {draft.kind === 'RENT' && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>The landlord’s PAN is needed when the rent for the year is more than {rupees(data.landlordPanAbove)}.</Typography>}
          </Stack>
        )}
      </FormDialog>
      <ConfirmDialog
        open={!!removing}
        title="Remove this declaration?"
        body={removing ? `${removing.label}, ${rupees(removing.declaredAmount)}, and its proofs.` : ''}
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => { if (!removing) return; await actions.remove(removing.id); toast.success('Removed.'); setRemoving(null); onChanged(); }}
      />
      <FileDialog open={viewing != null} load={loadFile} onClose={() => setViewing(null)} />
    </Stack>
  );
}
