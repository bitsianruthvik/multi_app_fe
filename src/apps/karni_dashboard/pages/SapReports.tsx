import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Callout, DataTable, FacetChip, FilterBar, KpiGrid, KpiTile, SectionCard, SideSheet, ToneBadge, useCompanySlug, type DataColumn } from '@shared/ui';
import { useReport, type SavedReport, type SavedReports } from '../api';
import { ReportPage } from '../components/ReportPage';
import { labelForScreen } from '../navMeta';

/**
 * Karni's saved queries from SAP's Query Manager, each pointed at the
 * dashboard screen that answers the same question. Running a saved query in
 * SAP would mean storing it there first — a write — so the dashboard rebuilds
 * the reports from read-only data instead.
 */
export default function SapReports() {
  const { data: d, error, loading, reload } = useReport<SavedReports>('/saved-reports');
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [showStandard, setShowStandard] = useState(false);
  const [open, setOpen] = useState<SavedReport | null>(null);
  const base = (d?.reports ?? []).filter((r) => showStandard || !r.standard);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of base) m.set(r.category, (m.get(r.category) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [base]);
  const s = search.trim().toLowerCase();
  const rows = base.filter((r) => (!cat || r.category === cat) && (!s || r.name.toLowerCase().includes(s) || r.sql.toLowerCase().includes(s)));
  const covered = (d?.reports ?? []).filter((r) => !r.standard && r.coveredBy).length;

  const goTo = (screen: string) => navigate(`/${company}/karni_dashboard/${screen}`);
  const cols: DataColumn<SavedReport>[] = [
    { key: 'name', header: 'Report', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'category', header: 'Category', render: (r) => r.category, sortValue: (r) => r.category },
    { key: 'reads', header: 'Reads', render: (r) => tablesOf(r.sql), sortValue: (r) => tablesOf(r.sql), defaultHidden: true },
    {
      key: 'coveredBy', header: 'Answered on', sortValue: (r) => r.coveredBy || '', exportValue: (r) => (r.coveredBy ? labelForScreen(r.coveredBy) : ''),
      render: (r) => (r.coveredBy
        ? <Button size="small" endIcon={<ArrowForwardRounded />} onClick={(e) => { e.stopPropagation(); goTo(r.coveredBy as string); }} sx={{ textTransform: 'none' }}>{labelForScreen(r.coveredBy)}</Button>
        : <ToneBadge label={r.standard ? 'SAP standard' : 'Not yet'} tone="neutral" />),
    },
  ];
  return (
    <ReportPage title="SAP reports" subtitle={d ? `${d.karni} Karni reports · ${d.count - d.karni} SAP standard` : undefined}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Karni's saved reports" display={`${d.karni}`} tone="primary" />
            <KpiTile label="Answered on the dashboard" display={`${covered}`} tone="success" footer={`${d.karni ? Math.round((covered / d.karni) * 100) : 0}% of Karni's reports`} />
            <KpiTile label="SAP standard queries" display={`${d.count - d.karni}`} footer="SAP's own dashboard queries" />
          </KpiGrid>
          <Callout tone="info" title="Read-only by rule">
            These are the saved queries from SAP's Query Manager. Running one inside SAP would mean saving it to SAP first, which the
            read-only rule forbids, so the dashboard answers the same questions from data it reads. Use "Answered on" to open the screen.
          </Callout>
          <SectionCard flush>
            <FilterBar search={search} onSearch={setSearch} placeholder="Search report name or SQL">
              <FacetChip label="Show SAP standard" active={showStandard} onClick={() => setShowStandard((v) => !v)} />
              {cats.slice(0, 12).map(([c, n]) => <FacetChip key={c} label={c} count={n} active={cat === c} onClick={() => setCat(cat === c ? null : c)} />)}
            </FilterBar>
            <DataTable bare rows={rows} columns={cols} getRowId={(r) => r.id} onRowClick={setOpen} storageKey="kd-sap-reports" exportName="sap-saved-queries" />
          </SectionCard>
        </>
      )}
      <SideSheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} subtitle={open?.category}
        actions={open?.coveredBy ? <Button variant="contained" onClick={() => goTo(open.coveredBy as string)}>Open {labelForScreen(open.coveredBy)}</Button> : undefined}>
        {open && (
          <Box>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>The query as saved in SAP:</Typography>
            <Box component="pre" sx={{
              m: 0, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{open.sql}</Box>
          </Box>
        )}
      </SideSheet>
    </ReportPage>
  );
}

/** "OINV, OCRD" — the SAP tables a query reads. */
function tablesOf(sql: string): string {
  const t = new Set<string>();
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+"?([A-Z@][A-Z0-9_]{2,})"?/gi)) t.add(m[1].toUpperCase());
  return [...t].slice(0, 5).join(', ');
}
