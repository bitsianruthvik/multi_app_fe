import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import { CfApiError } from '../../api/client';
import { getCharts, putChartValue, type Chart, type ChartRow, type ChartSubject } from '../../api/charts';
import { useLoad } from '../../hooks/useLoad';
import { byText, chartRows, formulaNameText, modeText, previewTable, resultHeading, valueSourceText } from '../../lib/charts';
import { EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows } from '../ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { ChartRowsDialog } from './ChartRowsDialog';
import { useToast } from '../toastContext';
import { ChartDialog } from './ChartDialog';

const cellSx = { px: 1, py: 0.5, borderBottom: '1px solid var(--c-divider)', fontFamily: 'var(--font-mono)', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' } as const;

/** A small table of the chart's first rows, every heading with its unit. */
function ChartPreview({ chart }: { chart: Chart }) {
  const t = previewTable(chart);
  if (!t) return <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>No values yet.</Typography>;
  const head = { ...cellSx, fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 12, background: 'var(--c-surface-2)' } as const;
  return (
    <Box sx={{ overflow: 'auto', border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm)', maxWidth: '100%' }}>
      <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>{t.headings.map((h, i) => <Box key={i} component="th" sx={{ ...head, textAlign: t.numeric[i] ? 'right' : 'left' }}>{h}</Box>)}</tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => <Box key={j} component="td" sx={{ ...cellSx, textAlign: t.numeric[j] ? 'right' : 'left', color: v === '—' ? 'var(--c-text-3)' : undefined }}>{v}</Box>)}
            </tr>
          ))}
        </tbody>
      </Box>
      {t.more > 0 && <Box sx={{ px: 1, py: 0.5, fontSize: 12, color: 'var(--c-text-3)' }}>and {t.more} more row{t.more === 1 ? '' : 's'}</Box>}
    </Box>
  );
}

/**
 * The charts (lookup tables) of a machine type or a machine: one card each,
 * with its values, where they come from, what reads it, and the buttons to
 * change the values, change the chart, or add another. A machine can take a
 * type's chart as its own, and give it back.
 */
export function ChartsPanel({ subject, canManage, onChanged }: { subject: ChartSubject; canManage: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const list = useLoad(() => getCharts(subject), [subject.type, subject.id]);
  const [adding, setAdding] = useState(false);
  const [editingChart, setEditingChart] = useState<Chart | null>(null);
  const [editingValues, setEditingValues] = useState<number | null>(null);
  const [giveBack, setGiveBack] = useState<Chart | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const charts = list.data ?? [];
  const onMachine = subject.type === 'machine';
  const gridChart = charts.find((c) => c.specId === editingValues) ?? null;

  const changed = () => { onChanged?.(); };
  const refreshed = (next: Chart[] | null) => { if (next) list.setData(next); else list.reload(); changed(); };

  /** Saves the rows; an error goes back to the rows dialog, which shows the server's words. */
  const saveValues = async (chart: Chart, rows: ChartRow[] | null) => {
    const next = await putChartValue(subject, chart.specId, rows);
    list.setData(next);
    changed();
    toast.success('Chart saved.');
  };

  /** A machine takes the values it shows as its own, then opens them to edit. */
  const giveOwn = async (chart: Chart) => {
    setError(null);
    try {
      const next = await putChartValue(subject, chart.specId, chartRows(chart));
      list.setData(next);
      changed();
      setEditingValues(chart.specId);
    } catch (e) {
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    }
  };

  return (
    <SectionCard title="Charts"
      subtitle={onMachine
        ? 'Lookup tables a time can read, e.g. cutting speed by thickness. A machine uses its type’s chart unless it has its own.'
        : 'Lookup tables a time can read, e.g. cutting speed by thickness. Every machine of this type uses them unless it has its own.'}
      actions={canManage && <Button startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add chart</Button>}>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <ErrorNotice error={error} />
      {list.loading && !list.data ? <SkeletonRows rows={3} /> : charts.length === 0 ? (
        <EmptyState icon={<TableChartOutlined />} title="No charts yet"
          hint={canManage ? 'Add one, e.g. Gas cutting speed (mm/min) by Thickness (mm).' : 'Nobody has added one here yet.'}
          action={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add chart</Button>} />
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, py: 0.5 }}>
          {charts.map((c) => {
            const inherited = onMachine && !c.own && !!chartRows(c);
            return (
              <Box key={c.specId} data-testid={`chart-${c.code}`} sx={{ display: 'grid', gap: 1, alignContent: 'start', p: 1.5, minWidth: 0, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                    <Box component="h3" sx={{ m: 0, fontSize: 14.5, fontWeight: 600 }}>{c.name}</Box>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                      Gives {c.resultUnit ?? 'a number'}{c.axes.length ? ` · ${byText(c.axes)}` : ''}{c.definedAt ? ` · set up on ${c.definedAt.name}` : ''}
                    </Typography>
                  </Box>
                  {canManage && <Button size="small" startIcon={<EditRounded fontSize="small" />} onClick={() => setEditingChart(c)}>Edit chart</Button>}
                </Box>

                <ChartPreview chart={c} />

                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{modeText(c.mode)}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {valueSourceText(c, subject.type)}
                </Typography>
                {c.usedBy.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    Used in: {c.usedBy.map((code) => <Mono key={code} chip>{code}</Mono>)}
                  </Box>
                )}
                <Typography component="div" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  In a time formula: <Mono>{formulaNameText(c)}</Mono>
                </Typography>

                {canManage && (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', pt: 0.5 }}>
                    {inherited ? (
                      <Button size="small" variant="outlined" onClick={() => void giveOwn(c)}>Give this machine its own chart</Button>
                    ) : (
                      <Button size="small" variant="outlined" startIcon={<TableChartOutlined fontSize="small" />} onClick={() => setEditingValues(c.specId)}>
                        {chartRows(c) ? 'Edit rows' : 'Add rows'}
                      </Button>
                    )}
                    {onMachine && c.own && c.definedAt?.type === 'classification' && (
                      <Button size="small" color="inherit" onClick={() => setGiveBack(c)}>Go back to the type’s chart</Button>
                    )}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {adding && <ChartDialog open subject={subject} onClose={() => setAdding(false)} onSaved={(next) => { toast.success('Chart added.'); refreshed(next); }} />}
      {editingChart && <ChartDialog open subject={subject} existing={editingChart} onClose={() => setEditingChart(null)} onSaved={(next) => { toast.success('Chart saved.'); refreshed(next); }} />}
      {gridChart && (
        <ChartRowsDialog open onClose={() => setEditingValues(null)} title={gridChart.name} axes={gridChart.axes} resultLabel={resultHeading(gridChart)}
          rows={chartRows(gridChart)} nodes={gridChart.nodes} onSave={(rows) => saveValues(gridChart, rows)} />
      )}
      <ConfirmDialog open={!!giveBack} title="Go back to the type’s chart?" confirmLabel="Go back" entityName={giveBack ? `${giveBack.name} · ${giveBack.code}` : undefined}
        body="This machine’s own values for this chart are dropped. It reads the machine type’s chart again."
        onClose={() => setGiveBack(null)}
        onConfirm={async () => {
          if (!giveBack) return;
          const next = await putChartValue(subject, giveBack.specId, null);
          list.setData(next);
          changed();
          toast.success('Back on the type’s chart.');
        }} />
    </SectionCard>
  );
}
