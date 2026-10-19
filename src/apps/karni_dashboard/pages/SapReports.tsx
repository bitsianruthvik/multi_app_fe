import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Callout, FacetChip, FilterBar, KpiGrid, KpiTile, SectionCard, ToneBadge, useCompanySlug, type DataColumn } from '@shared/ui';
import { ReportTable } from '../components/ReportTable';
import { useReport, type SavedReports } from '../api';
import { ReportPage } from '../components/ReportPage';
import { labelForScreen } from '../navMeta';

type Report = SavedReports['reports'][number];

/**
 * Karni's saved queries from SAP's Query Manager. Opening one runs it on SAP's
 * database through the connector, with a database user that can only read
 * (see SapReportRun). Reports that call a stored procedure are not run.
 */
export default function SapReports() {
  const { data: d, error, loading, reload } = useReport<SavedReports>('/saved-reports');
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [showStandard, setShowStandard] = useState(false);
  const base = (d?.reports ?? []).filter((r) => showStandard || !r.standard);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of base) m.set(r.category, (m.get(r.category) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [base]);
  const s = search.trim().toLowerCase();
  const rows = base.filter((r) => (!cat || r.category === cat) && (!s || r.name.toLowerCase().includes(s) || r.sql.toLowerCase().includes(s)));
  const karni = (d?.reports ?? []).filter((r) => !r.standard);
  const runnable = karni.filter((r) => r.runnable).length;
  const ready = d?.runner.status === 'ready';

  const openReport = (r: Report) => navigate(`/${company}/karni_dashboard/sap-reports/${encodeURIComponent(r.id)}`);
  const cols: DataColumn<Report>[] = [
    { key: 'name', header: 'Report', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'category', header: 'Category', render: (r) => r.category, sortValue: (r) => r.category },
    { key: 'reads', header: 'Reads', render: (r) => tablesOf(r.sql), sortValue: (r) => tablesOf(r.sql), defaultHidden: true },
    {
      key: 'run', header: 'Run', sortValue: (r) => (r.runnable ? 0 : 1), exportValue: (r) => (r.runnable ? 'Runs on SAP' : 'Stored procedure'),
      render: (r) => (r.runnable
        ? <ToneBadge label={ready ? 'Runs on SAP' : 'Ready once switched on'} tone={ready ? 'success' : 'neutral'} />
        : <ToneBadge label="Stored procedure — not run" tone="warning" />),
    },
    {
      key: 'coveredBy', header: 'Related dashboard', sortValue: (r) => r.coveredBy || '', exportValue: (r) => (r.coveredBy ? labelForScreen(r.coveredBy) : ''), defaultHidden: true,
      render: (r) => (r.coveredBy
        ? <Button size="small" endIcon={<ArrowForwardRounded />} onClick={(e) => { e.stopPropagation(); navigate(`/${company}/karni_dashboard/${r.coveredBy}`); }} sx={{ textTransform: 'none' }}>{labelForScreen(r.coveredBy)}</Button>
        : ''),
    },
  ];
  return (
    <ReportPage title="SAP reports" subtitle={d ? `${d.karni} Karni reports · ${d.count - d.karni} SAP standard` : undefined}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d} range={false}>
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Karni's saved reports" display={`${d.karni}`} tone="primary" />
            <KpiTile label="Can run from here" display={`${runnable}`} tone="success" footer={`${d.karni - runnable} call a stored procedure`} />
            <KpiTile label="SAP standard queries" display={`${d.count - d.karni}`} footer="SAP's own dashboard queries" />
          </KpiGrid>
          {d.runner.status === 'not_configured' && (
            <Callout tone="info" title="Running reports needs one more step on Karni's side">
              Reports run on SAP's own database through the connector on Karni's server, with a database user that can only read
              (so nothing in SAP can change). They work once Karni's SAP partner provides that user and it is added to the connector.
              Until then you can open a report to see its inputs and SQL.
            </Callout>
          )}
          {d.runner.status === 'error' && <Callout tone="danger" title="The connector cannot reach SAP's database">{d.runner.message || 'Unknown error.'}</Callout>}
          <SectionCard flush>
            <FilterBar search={search} onSearch={setSearch} placeholder="Search report name or SQL">
              <FacetChip label="Show SAP standard" active={showStandard} onClick={() => setShowStandard((v) => !v)} />
              {cats.slice(0, 12).map(([c, n]) => <FacetChip key={c} label={c} count={n} active={cat === c} onClick={() => setCat(cat === c ? null : c)} />)}
            </FilterBar>
            <ReportTable bare rows={rows} columns={cols} getRowId={(r) => r.id} onRowClick={openReport} storageKey="kd-sap-reports-v2" exportName="sap-saved-queries" />
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}

/** "OINV, OCRD" — the SAP tables a query reads. */
function tablesOf(sql: string): string {
  const t = new Set<string>();
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+"?([A-Z@][A-Z0-9_]{2,})"?/gi)) t.add(m[1].toUpperCase());
  return [...t].slice(0, 5).join(', ');
}
