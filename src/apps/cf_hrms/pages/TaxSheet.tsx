/**
 * Tax sheet (HR) — a person's year as of a month, both regimes side by side, worked exactly as the
 * payroll run works it (CF_HRMS_HIRING_SPEC.md §25.4). Opened from the run line's TDS, from Tax ›
 * Profiles and from a person's declarations. ?year=&month= choose the year and the month.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Stack } from '@mui/material';
import { DetailSkeleton, ErrorNotice, PageHeader } from '@shared/ui';
import { taxApi, type TaxSheet as Sheet } from '../api/tax';
import { SheetView, TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { useTaxYears } from '../components/tax/taxWords';

export default function TaxSheet() {
  const { company, employeeId } = useParams<{ company: string; employeeId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { years, year: defYear } = useTaxYears();
  const year = params.get('year') || defYear;
  const month = params.get('month') || undefined;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    if (!year || !employeeId) return;
    setSheet(null);
    taxApi.sheet(year, Number(employeeId), month).then((s) => { setSheet(s); setError(null); }).catch(setError);
  }, [year, employeeId, month]);
  useEffect(load, [load]);
  const go = (y: string, m?: string) => navigate(`?year=${y}${m ? `&month=${m}` : ''}`, { replace: true });

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title={sheet ? `Tax sheet — ${sheet.employee.name}` : 'Tax sheet'}
        subtitle={sheet ? `${sheet.employee.code} · ${sheet.year} · as of ${sheet.monthLabel}${sheet.forms ? ` · ${sheet.forms.act}` : ''}` : undefined}
        actions={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <YearSelect value={year} years={years} onChange={(y) => go(y)} />
            <Button variant="outlined" component={RouterLink} to={`/${company}/cf_hrms/tax-declarations/${employeeId}?year=${year}`}>Declarations</Button>
            {sheet?.run && <Button component={RouterLink} to={`/${company}/cf_hrms/payroll-runs/${sheet.run.id}`}>The run</Button>}
          </Stack>
        )}
      />
      <TaxBanner review={sheet?.review} />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!sheet && !error && <DetailSkeleton />}
      {sheet && <SheetView sheet={sheet} onMonth={(m) => go(year, m)} />}
    </Box>
  );
}
