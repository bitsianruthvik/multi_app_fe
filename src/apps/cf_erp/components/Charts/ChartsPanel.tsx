import { useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import { CfApiError } from '../../api/client';
import { chartValueImpact, deleteChart, getCharts, getMachineTimeImpact, putChartValue, type Chart, type ChartRow, type ChartSubject, type MachineTimeImpact } from '../../api/charts';
import { useLoad } from '../../hooks/useLoad';
import { byText, chartRows, formulaNameText, impactText, modeText, previewTable, resultHeading, valueSourceText } from '../../lib/charts';
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
  const [deleting, setDeleting] = useState<Chart | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const charts = list.data ?? [];
  const onMachine = subject.type === 'machine';
  const gridChart = charts.find((c) => c.specId === editingValues) ?? null;

  // §58 — A MACHINE'S OWN CHART COUNTS: a step put on this machine takes the machine's time. So the
  // tab says how many planned (not started) steps are on it, and every change says, from a dry run
  // on the server, how many of them change and by how much — before and after it is saved.
  const [onIt, setOnIt] = useState<MachineTimeImpact | null>(null);
  const [backImpact, setBackImpact] = useState<MachineTimeImpact | null>(null);
  const [tick, setTick] = useState(0);
  /** A save waiting for its "these planned steps change" question. */
  const [askSave, setAskSave] = useState<{ chart: Chart; impact: MachineTimeImpact; resolve: () => void; reject: (e: Error) => void } | null>(null);
  useEffect(() => {
    if (!onMachine) return undefined;
    let alive = true;
    getMachineTimeImpact(subject.id).then((i) => { if (alive) setOnIt(i); }).catch(() => { if (alive) setOnIt(null); });
    return () => { alive = false; };
  }, [onMachine, subject.id, tick]);
  useEffect(() => {
    setBackImpact(null);
    if (!giveBack || !onMachine) return undefined;
    let alive = true;
    chartValueImpact(subject.id, giveBack.specId, null).then((i) => { if (alive) setBackImpact(i); }).catch(() => undefined);
    return () => { alive = false; };
  }, [giveBack, onMachine, subject.id]);
  /** The dry run of saving these rows on this machine; null when it cannot be worked out (the save still goes on). */
  const dryRun = (chart: Chart, rows: ChartRow[] | null) => (onMachine ? chartValueImpact(subject.id, chart.specId, rows).catch(() => null) : Promise.resolve(null));

  const changed = () => { setTick((t) => t + 1); onChanged?.(); };
  const refreshed = (next: Chart[] | null) => { if (next) list.setData(next); else list.reload(); changed(); };

  /** Saves the rows; an error goes back to the rows dialog, which shows the server's words. */
  const saveValues = async (chart: Chart, rows: ChartRow[] | null) => {
    const impact = await dryRun(chart, rows);
    // Planned steps would change: say how many and by how much, and ask, BEFORE anything is saved.
    if (impact && (impact.changed > 0 || impact.dropped > 0)) {
      await new Promise<void>((resolve, reject) => { setAskSave({ chart, impact, resolve, reject }); });
    }
    const next = await putChartValue(subject, chart.specId, rows);
    list.setData(next);
    changed();
    // Emptied on a machine that has a type's chart behind it: the type's rows show again, so say so.
    const back = rows == null && backsOntoType(chart);
    const done = back ? 'Back on the type’s chart.' : rows == null ? 'Chart cleared.' : 'Chart saved.';
    toast.success(impact?.steps ? `${done} ${impactText(impact)}` : done);
  };

  /** This machine's own copy of a chart its TYPE defines: emptying it brings the type's rows back. */
  const backsOntoType = (c: Chart) => onMachine && c.own && c.definedAt?.type === 'classification';
  /** The chart is deleted where it is set up: on the type's tab, or on the machine that made it. */
  const deletableHere = (c: Chart) => !onMachine || c.definedAt?.type === 'machine';

  /** A machine takes the values it shows as its own, then opens them to edit. */
  const giveOwn = async (chart: Chart) => {
    setError(null);
    try {
      const next = await putChartValue(subject, chart.specId, chartRows(chart));
      list.setData(next);
      changed();
      setEditingValues(chart.specId);
      // The same rows as the type's change nothing yet — what counts is what is typed next.
      toast.info(onIt?.steps ? `This machine has its own chart now. ${onIt.steps} planned ${onIt.steps === 1 ? 'step is' : 'steps are'} on it: change the rows and ${onIt.steps === 1 ? 'its time follows' : 'their times follow'}.` : 'This machine has its own chart now.');
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
      {onMachine && onIt && (
        <Typography data-testid="charts-impact" sx={{ fontSize: 13, color: 'var(--c-text-2)', pb: 1 }}>
          {onIt.steps
            ? `${onIt.steps} planned ${onIt.steps === 1 ? 'step is' : 'steps are'} on this machine and not started (${Math.round(onIt.minutesBefore).toLocaleString()} min). A chart of its own changes ${onIt.steps === 1 ? 'its time' : 'their times'} — you are told by how much before it is saved.`
            : impactText(onIt)}
          {onIt.changed > 0 && <Box component="span" data-testid="charts-impact-stale" sx={{ display: 'block', color: 'var(--c-warning-800)' }}>{impactText(onIt)}</Box>}
        </Typography>
      )}
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
                      <>
                        <Button size="small" variant="outlined" onClick={() => void giveOwn(c)}>Give this machine its own chart</Button>
                        {onIt && (
                          <Typography data-testid={`chart-impact-${c.code}`} sx={{ fontSize: 12.5, color: 'var(--c-text-2)', alignSelf: 'center' }}>
                            {onIt.steps ? `${onIt.steps} planned ${onIt.steps === 1 ? 'step' : 'steps'} would follow it` : 'no planned step is on this machine yet'}
                          </Typography>
                        )}
                      </>
                    ) : (
                      <Button size="small" variant="outlined" startIcon={<TableChartOutlined fontSize="small" />} onClick={() => setEditingValues(c.specId)}>
                        {chartRows(c) ? 'Edit rows' : 'Add rows'}
                      </Button>
                    )}
                    {onMachine && c.own && c.definedAt?.type === 'classification' && (
                      <Button size="small" color="inherit" onClick={() => setGiveBack(c)}>Go back to the type’s chart</Button>
                    )}
                    {deletableHere(c) && (
                      <Button size="small" color="error" startIcon={<DeleteOutlineRounded fontSize="small" />} data-testid={`chart-delete-${c.code}`}
                        disabled={c.usedBy.length > 0} onClick={() => setDeleting(c)}>Delete chart</Button>
                    )}
                    {deletableHere(c) && c.usedBy.length > 0 && (
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', alignSelf: 'center' }}>
                        Read by {c.usedBy.join(', ')} — change {c.usedBy.length === 1 ? 'that time' : 'those times'} first, then it can be deleted.
                      </Typography>
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
          rows={chartRows(gridChart)} nodes={gridChart.nodes} onSave={(rows) => saveValues(gridChart, rows)}
          clearLabel={backsOntoType(gridChart) ? 'Go back to the type’s chart' : 'Clear chart'} />
      )}
      <ConfirmDialog open={!!askSave} title="Save this machine’s chart?" confirmLabel="Save" entityName={askSave ? `${askSave.chart.name} · ${askSave.chart.code}` : undefined}
        body={(
          <Box data-testid="chart-save-impact">
            {askSave ? impactText(askSave.impact) : ''}
            {askSave?.impact.cannot.slice(0, 3).map((s) => <Box key={s} sx={{ mt: 0.5, fontSize: 12.5 }}>{s}</Box>)}
            <Box sx={{ mt: 0.5 }}>Steps that have started keep the time they started with.</Box>
          </Box>
        )}
        onClose={() => { askSave?.reject(new CfApiError(0, 'Not saved — the chart is as it was.')); setAskSave(null); }}
        onConfirm={async () => { askSave?.resolve(); setAskSave(null); }} />
      <ConfirmDialog open={!!deleting} title="Delete this chart?" danger confirmLabel="Delete" entityName={deleting ? `${deleting.name} · ${deleting.code}` : undefined}
        body={`The chart and its rows go — on ${deleting?.definedAt?.name ?? 'its machine type'} and on every machine that had its own.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteChart(deleting.specId);
          refreshed(null);
          toast.success('Chart deleted.');
        }} />
      <ConfirmDialog open={!!giveBack} title="Go back to the type’s chart?" confirmLabel="Go back" entityName={giveBack ? `${giveBack.name} · ${giveBack.code}` : undefined}
        body={`This machine’s own values for this chart are dropped. It reads the machine type’s chart again.${backImpact?.steps ? ` ${impactText(backImpact)}` : ''}`}
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
