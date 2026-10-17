import { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Callout, DataTable, FacetChip, FilterBar, SectionCard, SideSheet, type DataColumn } from '@shared/ui';
import { useReport, type SavedReport, type SavedReports } from '../api';
import { ReportPage } from '../components/ReportPage';

/**
 * The saved queries of SAP's Query Manager (not SAP's own system queries). The
 * dashboard reads SAP strictly read-only, and running a saved query through the
 * Service Layer means first storing it in SAP — a write — so the queries are
 * listed with their SQL here, and each one is rebuilt as a dashboard report.
 */
export default function SapReports() {
  const { data, error, loading, reload } = useReport<SavedReports>('/saved-reports');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<SavedReport | null>(null);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.reports ?? []) m.set(r.category, (m.get(r.category) || 0) + 1);
    return [...m.entries()];
  }, [data]);
  const s = search.trim().toLowerCase();
  const rows = (data?.reports ?? []).filter((r) => (!cat || r.category === cat)
    && (!s || r.name.toLowerCase().includes(s) || r.sql.toLowerCase().includes(s)));

  const cols: DataColumn<SavedReport>[] = [
    { key: 'name', header: 'Report', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'category', header: 'Category', render: (r) => r.category, sortValue: (r) => r.category },
    { key: 'tables', header: 'Reads', render: (r) => tablesOf(r.sql), sortValue: (r) => tablesOf(r.sql) },
  ];

  return (
    <ReportPage title="SAP reports" subtitle={data ? `${data.count} saved queries` : undefined}
      asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}>
      {data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Callout tone="info" title="Read-only by rule">
            These are Karni's saved queries from SAP's Query Manager. Running them inside SAP would mean
            saving them to SAP first, which the read-only rule forbids — each one is being rebuilt as a
            dashboard report instead.
          </Callout>
          <SectionCard flush>
            <FilterBar search={search} onSearch={setSearch} placeholder="Search name or SQL">
              {cats.map(([c, n]) => (
                <FacetChip key={c} label={c} count={n} active={cat === c} onClick={() => setCat(cat === c ? null : c)} />
              ))}
            </FilterBar>
            <DataTable rows={rows} columns={cols} getRowId={(r) => r.id} onRowClick={setOpen}
              storageKey="kd-sap-reports" exportName="sap-saved-queries" bare />
          </SectionCard>
        </Box>
      )}
      <SideSheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">{open.category}</Typography>
            <Box component="pre" sx={{
              m: 0, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontFamily: 'var(--font-mono)', fontSize: 12,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{open.sql}</Box>
          </Box>
        )}
      </SideSheet>
    </ReportPage>
  );
}

/** "OINV, OCRD" — the SAP tables a query reads, for a quick sense of what it is. */
function tablesOf(sql: string): string {
  const t = new Set<string>();
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+"?([A-Z][A-Z0-9_]{2,})"?/gi)) t.add(m[1].toUpperCase());
  return [...t].slice(0, 5).join(', ');
}
