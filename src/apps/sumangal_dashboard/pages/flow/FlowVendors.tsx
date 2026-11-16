import { Fragment, useState } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { KpiGrid, KpiTile, SectionCard } from '@shared/ui';
import { useReport } from '../../api';
import { useFilters } from '../../filters';
import { monthLabel } from '../../format';
import { StackedBars } from '../../components/FlowParts';
import { fmtDays, fmtN, fmtT } from '../../components/flowFormat';
import { Page } from '../../components/Page';

type Mode = 'asis' | 'historic';
/** What a line can be grouped by. Product line (family) and casting (component) come from the reviewed part-name groups. */
type Dim = 'vendor' | 'family' | 'component' | 'process';
type Drill = Dim | 'none';

const DIM_LABEL: Record<Dim, string> = { vendor: 'Vendor', family: 'Product line', component: 'Casting', process: 'Process' };
const ALL_DIMS: Dim[] = ['vendor', 'family', 'component', 'process'];

/** Volume and turnaround for a group of outward lines. Tonnes are slip weight. */
interface Stats {
  lines: number;
  tonnes: number;
  perMonth: number;
  backLines: number;
  medianTat: number | null;
  p90Tat: number | null;
  outT: number;
}
type PivotRow = Stats & { key: string; partNames: number } & Partial<Record<Dim, string>>;
interface Report {
  asOf: string; mode: Mode; from: string; to: string; months: number;
  kpis: Stats & { vendors: number; parts: number };
  topVendors: string[];
  monthly: { mo: string; tonnes: Record<string, number> }[];
}
interface PivotReport { dims: Dim[]; pivot: PivotRow[] }

const STAT_HEADERS = ['Part names', 'Tonnes', 'Tonnes a month', 'Turnaround, median', 'Turnaround, 9 in 10', 'Still out', 'Lines'];

function StatCells({ r }: { r: PivotRow }) {
  return (
    <>
      <TableCell align="right">{fmtN(r.partNames)}</TableCell>
      <TableCell align="right">{fmtT(r.tonnes)}</TableCell>
      <TableCell align="right">{fmtT(r.perMonth)}</TableCell>
      <TableCell align="right">{fmtDays(r.medianTat)}</TableCell>
      <TableCell align="right">{fmtDays(r.p90Tat)}</TableCell>
      <TableCell align="right">{fmtT(r.outT)}</TableCell>
      <TableCell align="right">{fmtN(r.lines)}</TableCell>
    </>
  );
}

/** Rows are the primary grouping. Click a row to open it by the first split; click an opened row to open it by the second. */
function PivotCard({ mode, title, info, fixed, choices, defaultPrimary, defaultSplit }: {
  mode: Mode; title: string; info: string; fixed?: Dim; choices?: Dim[]; defaultPrimary: Dim; defaultSplit: [Drill, Drill];
}) {
  const f = useFilters();
  const [picked, setPickedRaw] = useState<Dim>(defaultPrimary);
  const primary: Dim = fixed ?? picked;
  const [s1Raw, setS1Raw] = useState<Drill>(defaultSplit[0]);
  const [s2Raw, setS2Raw] = useState<Drill>(defaultSplit[1]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const drillOpts = ALL_DIMS.filter((x) => x !== primary);
  const s1: Drill = s1Raw !== 'none' && drillOpts.includes(s1Raw) ? s1Raw : 'none';
  const s2: Drill = s1 !== 'none' && s2Raw !== 'none' && drillOpts.includes(s2Raw) && s2Raw !== s1 ? s2Raw : 'none';
  const d1 = s1 === 'none' ? null : s1;
  const d2 = s2 === 'none' ? null : s2;

  const setPicked = (v: Dim) => { setPickedRaw(v); setOpen(new Set()); };
  const setS1 = (v: Drill) => { setS1Raw(v); setOpen(new Set()); };
  const setS2 = (v: Drill) => { setS2Raw(v); setOpen(new Set()); };
  const toggle = (k: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const q = (by: Dim[]) => `/flow/vendors${f.query({ mode, by: by.join(',') })}`;
  const top = useReport<PivotReport>(f.ready ? q([primary]) : null);
  const mid = useReport<PivotReport>(f.ready && d1 ? q([primary, d1]) : null);
  const low = useReport<PivotReport>(f.ready && d1 && d2 ? q([primary, d1, d2]) : null);

  const sorted = (rows: PivotRow[]) => [...rows].sort((a, b) => b.tonnes - a.tonnes);
  const topRows = Array.isArray(top.data?.pivot) ? sorted(top.data.pivot) : [];
  const childRows = (p: PivotRow): PivotRow[] => (d1 && Array.isArray(mid.data?.pivot) ? sorted(mid.data.pivot.filter((r) => r[primary] === p[primary])) : []);
  const grandRows = (c: PivotRow): PivotRow[] => (d1 && d2 && Array.isArray(low.data?.pivot) ? sorted(low.data.pivot.filter((r) => r[primary] === c[primary] && r[d1] === c[d1])) : []);

  const Marker = ({ show, isOpen }: { show: boolean; isOpen: boolean }) => (
    <Box component="span" sx={{ display: 'inline-block', width: 16, color: 'text.secondary' }}>{show ? (isOpen ? '▾' : '▸') : ''}</Box>
  );

  return (
    <SectionCard
      flush
      title={title}
      subtitle={[DIM_LABEL[primary], d1 && DIM_LABEL[d1], d2 && DIM_LABEL[d2]].filter(Boolean).join(' › ')}
      info={info}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: 2, pt: 1.5, pb: 1 }}>
        {choices && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 'inherit', fontWeight: 600, minWidth: 130 }}>Rows are</Typography>
            <ToggleButtonGroup size="small" exclusive value={primary} onChange={(_, v: Dim | null) => { if (v) setPicked(v); }}>
              {choices.map((x) => <ToggleButton key={x} value={x}>{DIM_LABEL[x]}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 'inherit', fontWeight: 600, minWidth: 130 }}>Click a row to open by</Typography>
          <ToggleButtonGroup size="small" exclusive value={s1} onChange={(_, v: Drill | null) => { if (v) setS1(v); }}>
            <ToggleButton value="none">Nothing</ToggleButton>
            {drillOpts.map((x) => <ToggleButton key={x} value={x}>{DIM_LABEL[x]}</ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 'inherit', fontWeight: 600, minWidth: 130, color: s1 === 'none' ? 'text.disabled' : undefined }}>Then open each by</Typography>
          <ToggleButtonGroup size="small" exclusive disabled={s1 === 'none'} value={s2} onChange={(_, v: Drill | null) => { if (v) setS2(v); }}>
            <ToggleButton value="none">Nothing</ToggleButton>
            {drillOpts.filter((x) => x !== s1).map((x) => <ToggleButton key={x} value={x}>{DIM_LABEL[x]}</ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
      </Box>

      {top.error && <Typography sx={{ px: 2, pb: 2, color: 'error.main', fontSize: 'inherit' }} onClick={top.reload}>Could not load this view. Try again.</Typography>}
      {top.loading && !top.data && <Typography sx={{ px: 2, pb: 2, fontSize: 'inherit' }}>Loading…</Typography>}
      {top.data && !Array.isArray(top.data.pivot) && (
        <Typography sx={{ px: 2, pb: 2, fontSize: 'inherit', color: 'text.secondary' }}>This view is not available yet: the server is still updating. Try again in a minute.</Typography>
      )}
      {top.data && Array.isArray(top.data.pivot) && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{DIM_LABEL[primary]}</TableCell>
                {STAT_HEADERS.map((h) => <TableCell key={h} align="right" sx={{ fontWeight: 600 }}>{h}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {topRows.length === 0 && (
                <TableRow><TableCell colSpan={STAT_HEADERS.length + 1} sx={{ color: 'text.secondary' }}>No castings in this window.</TableCell></TableRow>
              )}
              {topRows.map((p) => {
                const k1 = p[primary] ?? '';
                const isOpen = open.has(k1);
                const kids = d1 && isOpen ? childRows(p) : [];
                return (
                  <Fragment key={k1}>
                    <TableRow hover onClick={d1 ? () => toggle(k1) : undefined} sx={{ cursor: d1 ? 'pointer' : 'default' }}>
                      <TableCell sx={{ fontWeight: 600 }}><Marker show={!!d1} isOpen={isOpen} />{k1}</TableCell>
                      <StatCells r={p} />
                    </TableRow>
                    {d1 && isOpen && !Array.isArray(mid.data?.pivot) && mid.loading && (
                      <TableRow><TableCell colSpan={STAT_HEADERS.length + 1} sx={{ pl: 4, color: 'text.secondary' }}>Loading…</TableCell></TableRow>
                    )}
                    {kids.map((c) => {
                      const k2 = `${k1}\u0001${c[d1!] ?? ''}`;
                      const isOpen2 = open.has(k2);
                      const grand = d2 && isOpen2 ? grandRows(c) : [];
                      return (
                        <Fragment key={k2}>
                          <TableRow hover onClick={d2 ? () => toggle(k2) : undefined} sx={{ cursor: d2 ? 'pointer' : 'default' }}>
                            <TableCell sx={{ pl: 4 }}><Marker show={!!d2} isOpen={isOpen2} />{c[d1!]}</TableCell>
                            <StatCells r={c} />
                          </TableRow>
                          {d2 && isOpen2 && !Array.isArray(low.data?.pivot) && low.loading && (
                            <TableRow><TableCell colSpan={STAT_HEADERS.length + 1} sx={{ pl: 7, color: 'text.secondary' }}>Loading…</TableCell></TableRow>
                          )}
                          {grand.map((g) => (
                            <TableRow key={`${k2}\u0001${g[d2!] ?? ''}`}>
                              <TableCell sx={{ pl: 7 }}>{g[d2!]}</TableCell>
                              <StatCells r={g} />
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}

const FOOTNOTE = 'Castings sent out to job-work vendors, from the outward slips. Product line and casting come from a reviewed list of part names; a name not on the list shows as Unclassified, and “Unclear” means the part name does not say which product line it belongs to. Click a row to open it by the split you chose, and click an opened row to open it by the second split. Turnaround is the days from sent to fully back, counted only on lines that have come fully back, so lines still out are not in it. Still out is the weight not yet back on the last data day. Tonnes a month is over the calendar months in the window. As-is is the last six calendar months; Historic is the chosen dates. Vendors named “Fettling (ERP code …)” are contract fettling, recorded in the ERP only by code.';

export default function FlowVendors({ mode }: { mode: Mode }) {
  const f = useFilters();
  const historic = mode === 'historic';
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/flow/vendors${f.query({ mode, by: 'vendor' })}` : null);

  return (
    <Page
      title={historic ? 'Vendors · Historic' : 'Vendors · As-is'}
      question={historic
        ? 'Which vendor does which part type, how much a month, and how long the castings take to come back, over the chosen dates.'
        : 'Which vendor does which part type, how much a month over the last six months, and how long the castings take to come back.'}
      filters={f}
      filterKeys={[]}
      period={historic}
      loading={loading}
      error={error}
      reload={reload}
      hasData={!!d}
      footnote={FOOTNOTE}
    >
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Vendors" info="Job-work vendors that had castings sent out in the window." display={fmtN(d.kpis.vendors)} />
            <KpiTile label="Part names" info="Part names sent out to a vendor in the window." display={fmtN(d.kpis.parts)} />
            <KpiTile label="Tonnes a month" info="Tonnes sent out, averaged over the calendar months in the window." display={fmtT(d.kpis.perMonth)} footer={`${fmtT(d.kpis.tonnes)} in ${d.months} month${d.months === 1 ? '' : 's'}`} />
            <KpiTile label="Turnaround, median" info="Median days from sent to fully back, over lines that have come fully back in the window." display={fmtDays(d.kpis.medianTat)} footer={`9 in 10 within ${fmtDays(d.kpis.p90Tat)}`} />
            <KpiTile label="Still out" info="Tonnes not yet back on the last data day, for lines sent in the window." display={fmtT(d.kpis.outT)} />
          </KpiGrid>

          <SectionCard title="Tonnes sent each month, by vendor" info={`Tonnes sent out each calendar month. The ${d.topVendors.length} largest vendors in the window are shown separately; the rest are grouped as Other.`}>
            <StackedBars
              labels={d.monthly.map((m) => monthLabel(m.mo))}
              series={[...d.topVendors, 'Other'].map((v) => ({ label: v, data: d.monthly.map((m) => m.tonnes[v] ?? 0) }))}
              format={fmtT}
              height={300}
            />
          </SectionCard>

          <PivotCard
            mode={mode}
            title="By vendor"
            info="Each vendor's castings. Click a vendor to open it by product line, casting or process, then click an opened row to open it further."
            fixed="vendor"
            defaultPrimary="vendor"
            defaultSplit={['family', 'none']}
          />

          <PivotCard
            mode={mode}
            title="By product line or casting"
            info="Each product line, or each casting type. Click a row to open it by vendor or process, then click an opened row to open it further."
            choices={['family', 'component']}
            defaultPrimary="family"
            defaultSplit={['vendor', 'none']}
          />
        </>
      )}
    </Page>
  );
}
