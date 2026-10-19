import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Collapse, Stack, TextField, Typography } from '@mui/material';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Callout, SectionCard, ToneBadge, errorMessage, useCompanySlug, useDetailTitle, useToast, type DataColumn } from '@shared/ui';
import { kdApi, useReport, type QueryRun, type SavedReportDetail } from '../api';
import { ReportPage } from '../components/ReportPage';
import { ReportTable } from '../components/ReportTable';
import { labelForScreen } from '../navMeta';
import { ago } from '../format';

type Row = { _i: number; cells: (string | number | null)[] };

const STATUS: Record<QueryRun['status'], { label: string; tone: 'info' | 'warning' | 'success' | 'danger' }> = {
  queued: { label: 'Waiting for SAP', tone: 'info' }, running: { label: 'Running in SAP', tone: 'warning' },
  done: { label: 'Done', tone: 'success' }, failed: { label: 'Failed', tone: 'danger' },
};
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

/**
 * One saved SAP query: fill its inputs, run it on SAP (through the connector,
 * read-only), and read or export the result. The last runs stay available.
 */
export default function SapReportRun() {
  const { reportId = '' } = useParams();
  const id = decodeURIComponent(reportId);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: d, error, loading, reload } = useReport<SavedReportDetail>(`/saved-reports/${encodeURIComponent(id)}`, false);
  const [values, setValues] = useState<Record<number, string>>({});
  const [run, setRun] = useState<QueryRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [showSql, setShowSql] = useState(false);
  useDetailTitle(d?.report.name);

  // Inputs start from the last run's values, else this month for dates.
  useEffect(() => {
    if (!d) return;
    const last = d.runs[0]?.params || {};
    setValues(Object.fromEntries(d.params.map((p) => [p.n, last[p.label] ?? (p.type === 'date' ? (/to|end/i.test(p.label) ? today() : monthStart()) : '')])));
  }, [d]);

  const open = useCallback(async (runId: number) => {
    try { setRun(await kdApi.get<QueryRun>(`/query-runs/${runId}`)); } catch (e) { toast.error(errorMessage(e)); }
  }, [toast]);

  // Show the last finished run straight away.
  useEffect(() => {
    const last = d?.runs.find((r) => r.status === 'done');
    if (last && !run) void open(last.id);
  }, [d, run, open]);

  // Follow a run until it finishes.
  const waiting = run && (run.status === 'queued' || run.status === 'running');
  useEffect(() => {
    if (!waiting || !run) return undefined;
    const t = setTimeout(async () => {
      try {
        const r = await kdApi.get<QueryRun>(`/query-runs/${run.id}`);
        setRun(r);
        if (r.status === 'done' || r.status === 'failed') reload();
      } catch { /* try again on the next tick */ }
    }, 3000);
    return () => clearTimeout(t);
  }, [waiting, run, reload]);

  const start = async () => {
    setStarting(true);
    try {
      setRun(await kdApi.post<QueryRun>(`/saved-reports/${encodeURIComponent(id)}/run`, { params: values }));
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const result = run?.status === 'done' ? run.result : null;
  const rows: Row[] = useMemo(() => (result?.rows ?? []).map((cells, i) => ({ _i: i, cells })), [result]);
  const columns: DataColumn<Row>[] = useMemo(() => (result?.columns ?? []).map((name, ci) => {
    const numeric = rows.length > 0 && rows.every((r) => r.cells[ci] == null || typeof r.cells[ci] === 'number');
    return {
      key: `c${ci}`, header: name, numeric,
      render: (r: Row) => {
        const v = r.cells[ci];
        return v == null ? '' : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : v;
      },
      sortValue: (r: Row) => r.cells[ci],
      exportValue: (r: Row) => r.cells[ci],
    };
  }), [result, rows]);

  const runner = d?.runner;
  const ready = runner?.status === 'ready';
  const canRun = !!d?.runnable.ok && ready && !waiting && !starting;

  return (
    <ReportPage title={d?.report.name ?? 'SAP report'} subtitle={d ? `${d.report.category} · saved query from SAP's Query Manager` : undefined}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d} range={false}
      actions={<Button size="small" startIcon={<ArrowBackRounded />} onClick={() => navigate(`/${company}/karni_dashboard/sap-reports`)}>All SAP reports</Button>}>
      {d && (
        <>
          {!d.runnable.ok && <Callout tone="warning" title="This report is not run from the dashboard">{d.runnable.reason}</Callout>}
          {d.runnable.ok && runner?.status === 'not_configured' && (
            <Callout tone="info" title="Saved reports are not switched on yet">
              Reports run on SAP's own database through the connector on Karni's server, with a database user that can only read.
              They start working once Karni's SAP partner provides that user and it is added to the connector.
            </Callout>
          )}
          {d.runnable.ok && runner?.status === 'error' && (
            <Callout tone="danger" title="The connector cannot reach SAP's database">{runner.message || 'Unknown error.'}</Callout>
          )}

          <SectionCard title="Run" subtitle={d.params.length ? 'Fill in what the report asks for' : 'This report needs no inputs'}>
            <Stack spacing={2}>
              {d.params.length > 0 && (
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(200px, 1fr))' } }}>
                  {d.params.map((p) => (
                    <TextField key={p.n} size="small" label={p.label} type={p.type === 'date' ? 'date' : 'text'} value={values[p.n] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [p.n]: e.target.value }))} InputLabelProps={p.type === 'date' ? { shrink: true } : undefined}
                      helperText={p.type === 'text' && p.field ? `Compared with ${p.field}` : undefined} />
                  ))}
                </Box>
              )}
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button variant="contained" startIcon={waiting || starting ? <CircularProgress size={16} color="inherit" /> : <PlayArrowRounded />}
                  disabled={!canRun} onClick={start}>
                  {waiting ? 'Running…' : 'Run on SAP'}
                </Button>
                {run && <ToneBadge label={STATUS[run.status].label} tone={STATUS[run.status].tone} />}
                {waiting && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>The connector on Karni's server picks it up within about 10 seconds (longer while it is syncing).</Typography>}
                {d.report.coveredBy && (
                  <Button size="small" endIcon={<ArrowForwardRounded />} sx={{ ml: 'auto', textTransform: 'none' }}
                    onClick={() => navigate(`/${company}/karni_dashboard/${d.report.coveredBy}`)}>
                    Related dashboard: {labelForScreen(d.report.coveredBy)}
                  </Button>
                )}
              </Stack>
              {run?.status === 'failed' && <Callout tone="danger" title="The report failed">{run.error}</Callout>}
            </Stack>
          </SectionCard>

          {result && (
            <SectionCard flush title={`${run?.rowCount ?? rows.length} rows`}
              subtitle={`Run ${ago(run?.finishedAt)}${run?.requestedBy ? ` by ${run.requestedBy}` : ''}${run?.params && Object.keys(run.params).length ? ` · ${Object.entries(run.params).map(([k, v]) => `${k}: ${v || '—'}`).join(' · ')}` : ''}`}>
              {run?.truncated && <Box sx={{ px: 2, pb: 1 }}><Callout tone="warning" title="Only the first rows are shown">The result was longer than the dashboard keeps. Narrow the inputs to see the rest.</Callout></Box>}
              <ReportTable bare rows={rows} columns={columns} getRowId={(r) => r._i} storageKey={`kd-sapq-${id}`} exportName={d.report.name.replace(/[^\w-]+/g, '_').slice(0, 60)} />
            </SectionCard>
          )}

          {d.runs.length > 0 && (
            <SectionCard title="Recent runs" flush>
              {d.runs.map((r) => (
                <Box key={r.id} onClick={() => r.status === 'done' && open(r.id)} role="button" tabIndex={0}
                  sx={{ px: 2, py: 1, borderTop: '1px solid var(--c-divider)', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', cursor: r.status === 'done' ? 'pointer' : 'default', bgcolor: run?.id === r.id ? 'action.selected' : undefined }}>
                  <ToneBadge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
                  <Typography sx={{ fontSize: 13, flex: 1, minWidth: 180 }}>
                    {r.params && Object.keys(r.params).length ? Object.entries(r.params).map(([k, v]) => `${k}: ${v || '—'}`).join(' · ') : 'No inputs'}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.rowCount != null ? `${r.rowCount} rows · ` : ''}{r.requestedBy || ''} · {ago(r.requestedAt)}</Typography>
                </Box>
              ))}
            </SectionCard>
          )}

          <SectionCard title="The query as saved in SAP" action={<Button size="small" onClick={() => setShowSql((v) => !v)}>{showSql ? 'Hide' : 'Show'}</Button>}>
            <Collapse in={showSql} unmountOnExit>
              <Box component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{d.report.sql}</Box>
            </Collapse>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}
