import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import { cfApi, qs, type CfApiError } from '../api/client';
import { getCountList, getCounts, postCount, qtyText, type LedgerGroup, type StockCountDetail } from '../api/storesDesk';
import { useLoad } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { rupeeText } from '../lib/money';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows, type Family } from '../components/ui';
import { FacetChip } from '../components/FilterBar';
import { useToast } from '../components/toastContext';

const STATUS: Record<string, { family: Family; label: string }> = {
  matched: { family: 'success', label: 'Matched' }, posted: { family: 'info', label: 'Corrected' },
  pending: { family: 'warning', label: 'Waiting for approval' }, rejected: { family: 'danger', label: 'Sent back' },
};
const keyOf = (itemId: number, lotId: number | null | undefined) => `${itemId}:${lotId ?? 0}`;

/**
 * STORES › AUDIT (init.sql §111) — is the book right? ONE audit a month, of EVERYTHING in the store area (user,
 * 2026-11-22: no daily audit; not one group but all). It is done in parts: pick a family to work through a shelf, save,
 * carry on — the bar says how much of the month's audit is done. The storekeeper types what is on the shelf; a line that differs asks why. Small differences correct the
 * book at once; larger ones wait for Management, and the book does not move until they decide.
 */
export default function StoresCount() {
  const toast = useToast();
  const kind = 'monthly';
  const [left, setLeft] = useUrlParam('left', '1');
  const [areaParam, setAreaParam] = useUrlParam('areaId', '');
  const [groupParam, setGroupParam] = useUrlParam('group', '');
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [result, setResult] = useState<StockCountDetail | null>(null);
  const groups = useLoad(() => cfApi.get<{ counts: { groups: LedgerGroup[] } }>(`/stores-desk/ledger${qs({ paged: 1, limit: 1 })}`).then((a) => a.counts.groups.filter((g, i, all) => all.findIndex((x) => x.subfamilyId === g.subfamilyId) === i)), []);   // one a sub-family (the list now comes a variant a row)
  const ready = true;
  const list = useLoad(() => (ready ? getCountList({ areaId: Number(areaParam) || undefined, kind, subfamilyId: Number(groupParam) || undefined }) : Promise.resolve(null)), [kind, areaParam, groupParam]);
  const recent = useLoad(() => getCounts(), []);
  useEffect(() => { setCounted({}); setReasons({}); setError(null); }, [list.data]);
  const allLines = useMemo(() => list.data?.lines ?? [], [list.data]);
  const lines = useMemo(() => (left === '1' ? allLines.filter((l) => !l.audited) : allLines).slice(0, 200), [allLines, left]);
  const shownOf = left === '1' ? allLines.filter((l) => !l.audited).length : allLines.length;
  const month = list.data?.month;
  const filled = lines.filter((l) => (counted[keyOf(l.item.id, l.lot?.id)] ?? '').trim() !== '');
  const differs = (l: (typeof lines)[number]) => { const v = counted[keyOf(l.item.id, l.lot?.id)]; return v != null && v.trim() !== '' && Number.isFinite(Number(v)) && Math.abs(Number(v) - l.book) > 1e-9; };
  const missingReason = lines.some((l) => differs(l) && !(reasons[keyOf(l.item.id, l.lot?.id)] ?? '').trim());

  const save = async () => {
    if (!list.data) return;
    setBusy(true); setError(null);
    try {
      const r = await postCount({
        areaId: list.data.area.id, kind,
        lines: filled.map((l) => { const k = keyOf(l.item.id, l.lot?.id); return { itemId: l.item.id, lotId: l.lot?.id ?? null, counted: Number(counted[k]), reason: reasons[k]?.trim() || undefined }; }),
      });
      setResult(r);
      toast.success(r.status === 'matched' ? 'The audit matches the book.' : r.status === 'posted' ? 'Saved: the book is corrected.' : 'Saved: the differences wait for approval.');
      list.reload(); recent.reload();
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Audit" subtitle="Type what is on the shelf. A line that differs from the book asks why; small differences correct the book at once, larger ones wait for Management." />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <FacetChip label="Still to audit" active={left === '1'} onClick={() => setLeft('1')} />
        <FacetChip label="Everything" active={left !== '1'} onClick={() => setLeft('0')} />
        {(list.data?.areas.length ?? 0) > 1 && (
          <TextField select size="small" label="Store area" value={areaParam || String(list.data?.area.id ?? '')} onChange={(e) => setAreaParam(e.target.value)} sx={{ minWidth: 200 }}>
            {list.data!.areas.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
          </TextField>
        )}
        <TextField select size="small" label="Family › sub-family" value={groupParam} onChange={(e) => setGroupParam(e.target.value)} sx={{ flex: '1 1 240px', maxWidth: 360, minWidth: 0 }}>
          <MenuItem value="">Every family</MenuItem>
          {(groups.data ?? []).map((g) => <MenuItem key={g.subfamilyId} value={String(g.subfamilyId)}>{g.family} › {g.subfamily}</MenuItem>)}
        </TextField>
        {month && (
          <Box data-testid="audit-progress" sx={{ flex: '1 1 260px', minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>This month: {month.audited} of {month.total} lines audited{month.done ? ' — done' : ''}</Typography>
            <Box sx={{ height: 6, borderRadius: 3, background: 'var(--c-neutral-100, #eee)', overflow: 'hidden', mt: 0.5 }}><Box sx={{ height: '100%', width: `${month.total ? Math.round((month.audited / month.total) * 100) : 0}%`, background: month.done ? 'var(--c-success-500)' : 'var(--c-primary-500)' }} /></Box>
          </Box>
        )}
      </Box>
      {result && (
        <Alert severity={result.status === 'pending' ? 'warning' : 'success'} onClose={() => setResult(null)} sx={{ mb: 2 }} data-testid="count-result">
          {result.code}: {result.differences === 0 ? `${result.lines.length} line${result.lines.length === 1 ? '' : 's'} audited, all as the book says.`
            : `${result.differences} of ${result.lines.length} differ${result.value != null ? ` (${rupeeText(result.value)})` : ''}. ${result.status === 'posted' ? 'The book is corrected.' : 'Waiting for approval — the book stays as it is until then.'}`}
        </Alert>
      )}
      <ErrorNotice error={list.error ?? error} onRetry={list.error ? list.reload : undefined} />
      {ready && !list.data && !list.error && <SkeletonRows rows={6} />}
      {list.data && lines.length === 0 && (
        <EmptyState icon={<FactCheckRounded />} title={allLines.length === 0 ? 'Nothing is in this area' : "Everything shown is audited for this month"}
          hint={allLines.length === 0 ? 'Pick another family or another area.' : 'Press "Everything" to see the lines again, or pick another family.'} />
      )}
      {lines.length > 0 && (
        <Box data-testid="count-lines" sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', overflow: 'hidden' }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-text-2)' }}>
            {list.data!.area.name} · showing {lines.length} of {shownOf} line{shownOf === 1 ? '' : 's'}{shownOf > lines.length ? ' — save these and the next ones follow' : ''}
          </Box>
          {lines.map((l) => {
            const k = keyOf(l.item.id, l.lot?.id);
            const d = differs(l);
            return (
              <Box key={k} sx={{ p: 1.5, borderBottom: '1px solid var(--c-divider)', display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', '&:last-child': { borderBottom: 0 } }}>
                <Box sx={{ flex: '2 1 220px', minWidth: 0 }}>
                  <Box sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{l.item.name}</Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{[l.item.code, l.lot ? `lot ${l.lot.code}` : null, l.audited ? 'audited this month' : null].filter(Boolean).join(' · ')}</Typography>
                </Box>
                <Box sx={{ flex: '0 0 auto', textAlign: 'right', minWidth: 80 }}><Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>Book</Typography><Mono>{qtyText(l.book)} {l.item.uom}</Mono></Box>
                <TextField size="small" label="On the shelf" value={counted[k] ?? ''} onChange={(e) => setCounted((c) => ({ ...c, [k]: e.target.value }))} sx={{ width: 120 }} inputProps={{ inputMode: 'decimal', 'data-testid': 'count-input' }} />
                {d && (
                  <TextField size="small" label={`Why ${Number(counted[k]) > l.book ? 'more' : 'less'} by ${qtyText(Math.abs(Number(counted[k]) - l.book))}?`} value={reasons[k] ?? ''} error={!(reasons[k] ?? '').trim()}
                    onChange={(e) => setReasons((r) => ({ ...r, [k]: e.target.value }))} sx={{ flex: '1 1 220px', minWidth: 0 }} />
                )}
              </Box>
            );
          })}
          <Box sx={{ p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--c-border)' }}>
            <Button variant="contained" onClick={() => void save()} disabled={busy || filled.length === 0 || missingReason} data-testid="count-save">{busy ? 'Saving…' : `Save audit (${filled.length})`}</Button>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{missingReason ? 'Say why each differing line differs.' : 'Lines left empty are not audited.'}</Typography>
          </Box>
        </Box>
      )}
      <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 3, mb: 1 }}>Recent audits</Typography>
      <Box sx={{ display: 'grid', gap: 0.75 }}>
        {(recent.data ?? []).slice(0, 12).map((n) => (
          <Box key={n.id} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5, p: 1.25, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface)' }}>
            <Mono>{n.code}</Mono><span>{n.date}</span><span>{n.area.name}</span>
            <span style={{ color: 'var(--c-text-2)' }}>{n.lines} line{n.lines === 1 ? '' : 's'}{n.differences ? `, ${n.differences} differ${n.value != null ? ` (${rupeeText(n.value)})` : ''}` : ''}</span>
            <Box sx={{ ml: 'auto' }}><Badge family={STATUS[n.status]?.family ?? 'neutral'} label={STATUS[n.status]?.label ?? n.status} noIcon /></Box>
          </Box>
        ))}
        {recent.data && recent.data.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No audit has been saved yet.</Typography>}
      </Box>
    </Box>
  );
}
