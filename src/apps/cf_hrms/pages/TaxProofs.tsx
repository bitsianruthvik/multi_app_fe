/**
 * Tax › Proofs (CF_HRMS_HIRING_SPEC.md §25.4) — HR's queue of proofs: filters by status and kind,
 * the file beside the claim (side by side on a wide screen, one above the other on a phone), accept
 * an amount (it may be lower than declared), reject with a reason the person sees, accept many at once.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Callout, EmptyState, ErrorNotice, ListSkeleton, PageHeader, SectionCard, StatStrip, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { taxApi, type DeclLine, type ProofQueue, type TaxFile } from '../api/tax';
import { FilePreview, TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { LINE_STATUS, useTaxYears } from '../components/tax/taxWords';
import { rupees, parseAmount } from '../components/payroll/payWords';
import { useCan } from '../access/can';
import type { Review } from '../api/tax';

export default function TaxProofs() {
  const toast = useToast();
  const can = useCan();
  const { years, year, setYear } = useTaxYears();
  const [status, setStatus] = useState('SUBMITTED');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<ProofQueue | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [open, setOpen] = useState<DeclLine | null>(null);
  const [fileIdx, setFileIdx] = useState(0);
  const [file, setFile] = useState<TaxFile | null>(null);
  const [accept, setAccept] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);

  const load = useCallback(() => {
    if (!year) return;
    const p = new URLSearchParams({ status });
    if (kind) p.set('kind', kind);
    if (q.trim()) p.set('q', q.trim());
    taxApi.proofs(year, `?${p}`).then((d) => { setData(d); setError(null); setPicked([]); }).catch(setError);
    taxApi.year(year).then((y) => setReview(y.review)).catch(() => undefined);
  }, [year, status, kind, q]);
  useEffect(load, [load]);
  useEffect(() => {
    setFile(null);
    const f = open?.files[fileIdx];
    if (f) taxApi.proofFile(f.id).then(setFile).catch((e) => toast.error(errorMessage(e)));
  }, [open, fileIdx, toast]);
  const kinds = useMemo(() => [...new Set((data?.lines ?? []).map((l) => l.kind))], [data]);

  const decide = async (how: 'verify' | 'reject') => {
    if (!open) return;
    setBusy(true);
    try {
      if (how === 'verify') await taxApi.verify(open.id, { acceptedAmount: accept.trim() === '' ? null : (parseAmount(accept) ?? accept) });
      else await taxApi.reject(open.id, { reason });
      toast.success(how === 'verify' ? 'Verified.' : 'Rejected.');
      setOpen(null);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };
  const bulk = async () => {
    try {
      const r = await taxApi.bulkAccept(year, picked);
      toast.success(`${r.accepted.length} accepted${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}.`);
      load();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const edit = can.payroll.edit;

  return (
    <Box>
      <PageHeader title="Proofs" subtitle="Check each proof against what was declared." actions={<YearSelect value={year} years={years} onChange={setYear} />} />
      <TaxBanner review={review} />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {data && (
        <StatStrip stats={[
          { label: 'Waiting', value: data.counts.SUBMITTED ?? 0, tone: 'warning' },
          { label: 'Verified', value: data.counts.VERIFIED ?? 0, tone: 'success' },
          { label: 'Rejected', value: data.counts.REJECTED ?? 0 },
          { label: 'No proof yet', value: data.counts.DECLARED ?? 0 },
        ]} />
      )}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', my: 2 }}>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 170 }}>
          {['SUBMITTED', 'VERIFIED', 'REJECTED', 'DECLARED', 'ALL'].map((s) => <MenuItem key={s} value={s}>{s === 'ALL' ? 'All' : LINE_STATUS[s].label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Any</MenuItem>
          {kinds.map((k) => <MenuItem key={k} value={k}>{data?.lines.find((l) => l.kind === k)?.label ?? k}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Person" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: '1 1 160px' }} />
        {edit && status === 'SUBMITTED' && <Button variant="contained" disabled={!picked.length} onClick={() => void bulk()}>Accept {picked.length || ''} as declared</Button>}
      </Box>
      {!data && !error && <ListSkeleton />}
      {data && data.lines.length === 0 && <EmptyState title="Nothing here" hint={status === 'SUBMITTED' ? 'No proof is waiting.' : undefined} />}
      <Stack spacing={1}>
        {data?.lines.map((l) => (
          <Box key={l.id} data-proof-line={l.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', p: 1.25, border: '1px solid var(--c-divider)', borderRadius: 1.5 }}>
            {edit && l.status === 'SUBMITTED' && <Checkbox size="small" checked={picked.includes(l.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, l.id] : picked.filter((x) => x !== l.id))} inputProps={{ 'aria-label': `Pick ${l.employee?.name} ${l.label}` }} />}
            <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{l.employee?.name} · {l.label}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{l.employee?.code} · declared {rupees(l.declaredAmount)} · {l.files.length} file{l.files.length === 1 ? '' : 's'}{l.acceptedAmount != null ? ` · accepted ${rupees(l.acceptedAmount)}` : ''}</Typography>
            </Box>
            <ToneBadge tone={LINE_STATUS[l.status].tone} label={LINE_STATUS[l.status].label} noIcon />
            <Button size="small" variant="outlined" disabled={!l.files.length} onClick={() => { setOpen(l); setFileIdx(0); setAccept(String(l.acceptedAmount ?? l.declaredAmount)); setReason(l.rejectReason ?? ''); }}>Open</Button>
          </Box>
        ))}
      </Stack>

      {open && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'var(--c-bg, #fff)', overflow: 'auto', p: { xs: 1.5, md: 2.5 } }} role="dialog" aria-label="Proof">
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
            <Typography sx={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{open.employee?.name} — {open.label}</Typography>
            <Button onClick={() => setOpen(null)}>Close</Button>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}>
            <Box>
              {open.files.length > 1 && (
                <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                  {open.files.map((f, i) => <Button key={f.id} size="small" variant={i === fileIdx ? 'contained' : 'outlined'} onClick={() => setFileIdx(i)}>{f.fileName}</Button>)}
                </Stack>
              )}
              <FilePreview file={file} height={640} />
            </Box>
            <SectionCard title="The claim">
              <Stack spacing={1.25}>
                <Typography sx={{ fontSize: 13.5 }}>Declared: <b>{rupees(open.declaredAmount)}</b></Typography>
                {Object.entries(open.details).filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => (
                  <Typography key={k} sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{k}: {String(v)}</Typography>
                ))}
                {open.proofHint && <Callout tone="neutral" title="What to look for">{open.proofHint}</Callout>}
                {edit && (
                  <>
                    <TextField size="small" label="Accept (₹)" value={accept} onChange={(e) => setAccept(e.target.value)} helperText="At most what was declared." inputProps={{ inputMode: 'decimal', 'data-field': 'accept' }} />
                    <Button variant="contained" color="success" disabled={busy} onClick={() => void decide('verify')}>Verify</Button>
                    <TextField size="small" label="Reason to reject (the person sees it)" value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} />
                    <Button variant="outlined" color="error" disabled={busy || reason.trim().length < 3} onClick={() => void decide('reject')}>Reject</Button>
                  </>
                )}
              </Stack>
            </SectionCard>
          </Box>
        </Box>
      )}
    </Box>
  );
}
