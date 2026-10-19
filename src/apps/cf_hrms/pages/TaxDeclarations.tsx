/**
 * Tax › Declarations (CF_HRMS_HIRING_SPEC.md §25.4) — HR sees and changes a person's declarations
 * for a year (any time, audited), uploads a proof for them. Without a person: choose one.
 * Needs payroll view and the named pay view; every opening is audited by the server.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { DetailSkeleton, EmptyState, ErrorNotice, ListSkeleton, PageHeader, ToneBadge } from '@shared/ui';
import { taxApi, type Declarations, type Profiles } from '../api/tax';
import { DeclarationsEditor, TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { REGIME_WORD, useTaxYears } from '../components/tax/taxWords';
import { useCan } from '../access/can';

export default function TaxDeclarations() {
  const { company, employeeId } = useParams<{ company: string; employeeId?: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const can = useCan();
  const { years, year: defYear, setYear: setDefYear } = useTaxYears();
  const year = params.get('year') || defYear;
  const setYear = (y: string) => { setDefYear(y); navigate(`?year=${y}`, { replace: true }); };
  const [people, setPeople] = useState<Profiles | null>(null);
  const [q, setQ] = useState('');
  const [data, setData] = useState<Declarations | null>(null);
  const [error, setError] = useState<unknown>(null);
  const id = employeeId ? Number(employeeId) : null;

  const load = useCallback(() => {
    if (!year) return;
    if (id) taxApi.declarations(year, id).then((d) => { setData(d); setError(null); }).catch(setError);
    else taxApi.profiles(year).then((d) => { setPeople(d); setError(null); }).catch(setError);
  }, [year, id]);
  useEffect(load, [load]);

  const actions = useMemo(() => ({
    add: (body: Parameters<typeof taxApi.addLine>[2]) => taxApi.addLine(year, id ?? 0, body),
    update: taxApi.updateLine,
    remove: taxApi.removeLine,
    upload: can.payroll.upload ? taxApi.uploadProof : undefined,
    file: taxApi.proofFile,
  }), [year, id, can.payroll.upload]);

  const filtered = (people?.people ?? []).filter((p) => !q.trim() || `${p.employee.name} ${p.employee.code}`.toLowerCase().includes(q.trim().toLowerCase()));

  if (!id) {
    return (
      <Box>
        <PageHeader title="Declarations" subtitle="Choose a person to see and change what they declared." actions={<YearSelect value={year} years={years} onChange={setYear} />} />
        <TaxBanner review={people?.review} />
        <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
        <TextField size="small" label="Search" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 2, width: '100%', maxWidth: 420 }} />
        {!people && !error && <ListSkeleton />}
        {people && filtered.length === 0 && <EmptyState title="Nobody found" />}
        <Stack spacing={1}>
          {filtered.map((p) => (
            <Box key={p.employee.id} component={RouterLink} to={`/${company}/cf_hrms/tax-declarations/${p.employee.id}?year=${year}`}
              sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', p: 1.25, border: '1px solid var(--c-divider)', borderRadius: 1.5, color: 'inherit', textDecoration: 'none', '&:hover': { bgcolor: 'var(--c-hover, rgba(0,0,0,0.03))' } }}>
              <Typography sx={{ flex: '1 1 200px', fontSize: 14, fontWeight: 500 }}>{p.employee.name} <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{p.employee.code}</Typography></Typography>
              <ToneBadge tone="neutral" label={REGIME_WORD[p.regime]} noIcon />
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{p.declarations} line{p.declarations === 1 ? '' : 's'}{p.proofsWaiting ? ` · ${p.proofsWaiting} proof(s) waiting` : ''}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <PageHeader
        title={data ? `Declarations — ${data.employee.name}` : 'Declarations'}
        subtitle={data ? `${data.employee.code} · ${data.form ?? ''} · ${year}` : undefined}
        actions={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <YearSelect value={year} years={years} onChange={setYear} />
            <Button component={RouterLink} to={`/${company}/cf_hrms/tax-sheet/${id}?year=${year}`} variant="outlined">Tax sheet</Button>
            <Button component={RouterLink} to={`/${company}/cf_hrms/tax-declarations?year=${year}`}>Everybody</Button>
          </Stack>
        )}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <DetailSkeleton />}
      {data && <DeclarationsEditor data={data} mode="hr" actions={can.payroll.edit ? actions : { ...actions, add: () => Promise.reject(new Error('No payroll edit right.')) }} onChanged={load} />}
    </Box>
  );
}
