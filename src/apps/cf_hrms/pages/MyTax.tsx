/**
 * My tax (CF_HRMS_HIRING_SPEC.md §25.4) — the person's own income tax at work.
 *
 *   Regime        both regimes compared on my figures; choose until the cut-off
 *   Declarations  what I declare (Form 12BB / 124 by the year), in the window
 *   Proofs        a proof for each declaration (PDF / JPG / PNG, at most 10 MB), and HR's answer
 *   Tax sheet     my year as of a month, both regimes side by side
 *   Forms         my Form 16 / 130 once HR releases the year, and my Form 10E / Form 39 worksheet when HR
 *                 has made one (arrears of earlier years; I may type those years' figures)
 * and "File my return" (the ITR helper, my-tax/return).
 *
 * Stands alone like My pay: imports myTaxApi and myReliefApi only, no employee id anywhere.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import { Callout, DetailSkeleton, EmptyState, ErrorNotice, PageHeader, SectionCard, errorMessage, useToast } from '@shared/ui';
import { myTaxApi, type Declarations, type MyYear, type Regime, type TaxSheet } from '../api/tax';
import { myReliefApi, type MyRelief } from '../api/payrollExtras';
import { MyReliefCard } from '../components/tax/MyReliefCard';
import { saveBase64File } from '../api/excel';
import { DeclarationsEditor, SheetView, TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { REGIME_WORD } from '../components/tax/taxWords';
import { rupees } from '../components/payroll/payWords';

type TabKey = 'regime' | 'declarations' | 'proofs' | 'sheet' | 'forms';

export default function MyTax() {
  const { company } = useParams<{ company: string }>();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>('regime');
  const [home, setHome] = useState<{ years: string[]; current: string; employee: { code: string; name: string } } | null>(null);
  const [year, setYear] = useState('');
  const [y, setY] = useState<MyYear | null>(null);
  const [decl, setDecl] = useState<Declarations | null>(null);
  const [sheet, setSheet] = useState<TaxSheet | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [forms, setForms] = useState<Awaited<ReturnType<typeof myTaxApi.forms>>['forms'] | null>(null);
  const [reliefs, setReliefs] = useState<MyRelief[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    myTaxApi.home().then((h) => { setHome(h); setYear(h.years.includes(h.current) ? h.current : h.years[0] ?? h.current); }).catch(setError);
  }, []);
  const loadYear = useCallback(() => {
    if (!year) return;
    myTaxApi.year(year).then((d) => { setY(d); setError(null); }).catch(setError);
    myTaxApi.declarations(year).then(setDecl).catch(setError);
  }, [year]);
  useEffect(loadYear, [loadYear]);
  useEffect(() => { if (year && tab === 'sheet') myTaxApi.sheet(year, month).then(setSheet).catch(setError); }, [year, tab, month]);
  const loadReliefs = useCallback(() => { myReliefApi.list().then((r) => setReliefs(r.worksheets)).catch(() => setReliefs([])); }, []);
  useEffect(() => { if (tab === 'forms') { myTaxApi.forms().then((r) => setForms(r.forms)).catch(setError); loadReliefs(); } }, [tab, loadReliefs]);

  const actions = useMemo(() => ({
    add: (body: Parameters<typeof myTaxApi.addLine>[1]) => myTaxApi.addLine(year, body),
    update: myTaxApi.updateLine,
    remove: myTaxApi.removeLine,
    upload: myTaxApi.uploadProof,
    file: myTaxApi.proofFile,
    removeFile: myTaxApi.removeProof,
  }), [year]);

  const choose = async (r: Regime) => {
    setBusy(r);
    try {
      await myTaxApi.setRegime(year, r);
      toast.success(`${REGIME_WORD[r]} chosen for ${year}.`);
      loadYear();
    } catch (e) {
      toast.error(errorMessage(e, 'The regime could not be changed.'));
    } finally { setBusy(null); }
  };

  const notLinked = (error as { code?: string } | null)?.code === 'NOT_LINKED';
  if (notLinked) {
    return (
      <>
        <PageHeader title="My tax" />
        <EmptyState icon={<BadgeRounded sx={{ fontSize: 34 }} />} title="This login is not connected to an employee record" hint={errorMessage(error)} />
      </>
    );
  }
  if (!home || !y) return error ? <ErrorNotice error={error} onRetry={loadYear} /> : <DetailSkeleton />;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="My tax"
        subtitle={`${home.employee.name} · ${home.employee.code}${y.forms ? ` · ${y.forms.act}` : ''}`}
        actions={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <YearSelect value={year} years={home.years} onChange={(v) => { setYear(v); setMonth(undefined); }} />
            <Button component={RouterLink} to={`/${company}/cf_hrms/my-tax/return`} variant="outlined">File my return</Button>
          </Stack>
        )}
      />
      <TaxBanner review={y.review} />
      <Tabs value={tab} onChange={(_, v) => setTab(v as TabKey)} sx={{ mb: 2, borderBottom: '1px solid var(--c-divider)' }} variant="scrollable" allowScrollButtonsMobile>
        <Tab value="regime" label="Regime" />
        <Tab value="declarations" label={`Declarations${decl?.lines.length ? ` (${decl.lines.length})` : ''}`} />
        <Tab value="proofs" label="Proofs" />
        <Tab value="sheet" label="Tax sheet" />
        <Tab value="forms" label="Forms" />
      </Tabs>
      <ErrorNotice error={error} onRetry={loadYear} sx={{ mb: 2 }} />

      {tab === 'regime' && (
        <Stack spacing={2}>
          {y.compare ? (
            <Callout tone="info" title={y.compare.sentence}>Worked out on your pay and declarations as of {y.compare.month}. It changes as the year goes on.</Callout>
          ) : <Callout tone="neutral" title="No figures yet">There is no pay for this year to compare on.</Callout>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {(['NEW', 'OLD'] as Regime[]).map((r) => (
              <SectionCard key={r} title={REGIME_WORD[r]} subtitle={r === 'NEW' ? 'The default. Lower rates, few deductions.' : 'Deductions and HRA count; higher rates.'}>
                <Typography sx={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{y.compare ? rupees(y.compare[r]) : '—'}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>tax for the year</Typography>
                {y.compare && y.compare.refused[r].length > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>Not counted here: {y.compare.refused[r].map((x) => x.what).join(', ')}.</Typography>}
                {y.regime.chosen === r ? (
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Yours{y.regime.how === 'DEFAULT' ? ' (the default)' : ''}</Typography>
                ) : (
                  <Button variant="contained" disabled={!y.regime.canChange || busy != null} onClick={() => void choose(r)} startIcon={busy === r ? <CircularProgress size={14} color="inherit" /> : undefined}>Choose {REGIME_WORD[r].toLowerCase()}</Button>
                )}
              </SectionCard>
            ))}
          </Box>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {y.regime.canChange ? `You can change it until ${y.regime.cutoff}.` : `The cut-off was ${y.regime.cutoff}: HR can change it once more for you.`} The payroll deducts TDS in the regime chosen here; on your return you may still choose either (the old one only by the due date).
          </Typography>
        </Stack>
      )}

      {(tab === 'declarations' || tab === 'proofs') && decl && (
        <DeclarationsEditor data={decl} mode="self" focus={tab === 'proofs' ? 'proofs' : 'declarations'} actions={actions} onChanged={loadYear} />
      )}

      {tab === 'sheet' && (sheet ? <SheetView sheet={sheet} onMonth={setMonth} /> : <DetailSkeleton />)}

      {tab === 'forms' && (
        <Stack spacing={2}>
          {forms && forms.length === 0 && !reliefs?.length && <EmptyState title="No forms yet" hint={`Your ${y.forms?.certificate ?? 'Form 16'} shows here once HR releases the year (by 15 June after it ends).`} />}
          {forms?.map((f) => (
            <Box key={f.year} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', p: 1.5, border: '1px solid var(--c-divider)', borderRadius: 1.5 }}>
              <Box sx={{ flex: '1 1 220px' }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{f.form} — {f.year}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {f.partA ? 'Part A (TRACES) and ' : 'Part A not uploaded yet; '}Part B · tax {rupees(f.totalTax ?? 0)}, deducted {rupees(f.tds ?? 0)}{f.provisional ? ' · provisional' : ''}
                </Typography>
              </Box>
              <Button variant="outlined" size="small" startIcon={<PictureAsPdfOutlined fontSize="small" />} onClick={async () => { try { saveBase64File(await myTaxApi.formFile(f.year)); } catch (e) { toast.error(errorMessage(e)); } }}>Download</Button>
            </Box>
          ))}
          {reliefs?.map((r) => <MyReliefCard key={r.year} relief={r} onChanged={loadReliefs} />)}
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>To file your return, use <RouterLink to={`/${company}/cf_hrms/my-tax/return`}>File my return</RouterLink>.</Typography>
        </Stack>
      )}
    </Box>
  );
}
