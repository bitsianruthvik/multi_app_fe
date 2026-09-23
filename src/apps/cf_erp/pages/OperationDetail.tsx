import { useState } from 'react';
import { Autocomplete, Box, Button, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import { cfApi, CfApiError } from '../api/client';
import type { MasterRecord, OperationDetail as OperationDetailT, OperationMachine, TimingPreview, TimingRule, Tree } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { minutesText, subjectText, timeText } from '../lib/production';
import { CapsLabel, DangerBadge, DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard, StatusBadge } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { EntityList, EntityRow } from '../components/EntityList';
import { OperationDialog } from '../components/OperationDialog';
import { TimingRuleDialog } from '../components/TimingRuleDialog';
import { RecordPicker } from '../components/RecordPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

/** How long one machine takes on one item: the rule that applies, its formulas fed real values. */
function TryIt({ op }: { op: OperationDetailT }) {
  const able = op.machines.filter((m) => m.eligible);
  const [machineId, setMachineId] = useState<number | null>(able[0]?.machine.id ?? null);
  const [item, setItem] = useState<MasterRecord | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [result, setResult] = useState<TimingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    try { setResult(await cfApi.post<TimingPreview>(`/operations/${op.id}/timing`, { machineId, itemId: item?.id ?? null, quantity: Number(quantity) || 1 })); } catch (e) { setError(e as CfApiError); setResult(null); } finally { setBusy(false); }
  };
  const missing = [...(result?.setup?.missing ?? []), ...(result?.work?.missing ?? [])];
  const why = result?.setup?.error ?? result?.work?.error;
  return (
    <SectionCard title="How long?" subtitle="Pick a machine and an item to see the time the rules give — nothing is saved.">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1.4fr) 110px auto' }, gap: 1.5, alignItems: 'start' }}>
        <Autocomplete size="small" options={op.machines.map((m) => m.machine)} value={op.machines.map((m) => m.machine).find((m) => m.id === machineId) ?? null}
          getOptionLabel={(m) => `${m.code} · ${m.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, m) => setMachineId(m?.id ?? null)}
          renderInput={(p) => <TextField {...p} label="Machine" />} noOptionsText="No rule reaches a machine yet" />
        <RecordPicker kinds={['catalog', 'temporary']} value={item} onChange={setItem} label="Item (for item.X values)" />
        <TextField label="Pieces" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ min: 1 }} />
        <Button variant="contained" onClick={run} disabled={busy || !machineId} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <TimerRounded />} sx={{ height: 40 }}>Work it out</Button>
      </Box>
      <ErrorNotice error={error} sx={{ mt: 2, mb: 0 }} />
      {result && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
          {!result.eligible ? (
            <Typography sx={{ color: 'var(--c-danger-800)' }}>{result.reason}</Typography>
          ) : result.totalMinutes != null ? (
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <Box>
                <CapsLabel>Total</CapsLabel>
                <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500 }}>{minutesText(result.totalMinutes)}</Typography>
              </Box>
              <Typography sx={{ color: 'var(--c-text-2)' }}>
                <Mono>{minutesText(result.setupMinutes)}</Mono> setup + <Mono>{result.quantity}</Mono> × <Mono>{minutesText(result.workMinutesPerPiece)}</Mono> per piece
                {result.from && <> — rule on {subjectText(result.from)}</>}
              </Typography>
            </Box>
          ) : (
            <Box>
              <Typography sx={{ fontWeight: 500 }}>Cannot work it out yet.</Typography>
              {missing.length > 0 && <Typography sx={{ color: 'var(--c-text-2)', mt: 0.5 }}>Missing: <Mono>{missing.join(', ')}</Mono>{!item && missing.some((x) => x.startsWith('item')) ? ' — pick an item.' : ''}</Typography>}
              {why && <Typography sx={{ color: 'var(--c-text-2)', mt: 0.5 }}>{why}</Typography>}
            </Box>
          )}
        </Box>
      )}
    </SectionCard>
  );
}

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const valid = (r: TimingRule) => (r.effectiveFrom || r.effectiveTo ? `${r.effectiveFrom ?? '…'} → ${r.effectiveTo ?? '…'}` : 'always');

/** Record / Detail (§4.3) for an operation: which machines do it, in how long, and where it is used. */
export default function OperationDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const op = useLoad(() => cfApi.get<OperationDetailT>(`/operations/${id}`), [id]);
  const tree = useLoad(() => cfApi.get<Tree>('/classification'), []);
  const [tab, setTab] = useUrlParam('tab', 'timing');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: TimingRule | null }>({ open: false, rule: null });
  const [deleteRule, setDeleteRule] = useState<TimingRule | null>(null);
  const o = op.data;
  useDetailTitle(o?.code ?? null);
  if (op.error) return <ErrorNotice error={op.error} onRetry={op.reload} />;
  if (!o) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const able = o.machines.filter((m) => m.eligible);
  const reload = () => { op.reload(); invalidateNavCounts(); };

  const ruleColumns: DataColumn<TimingRule>[] = [
    {
      key: 'for', header: 'For', alwaysVisible: true,
      render: (r) => (
        <Box sx={{ py: 0.5 }}>
          <Box>{r.subject.type === 'machine' ? <Box component={Link} to={to(`machines/${r.subject.id}`)} sx={linkSx}><Mono>{r.subject.code}</Mono></Box> : r.subject.name}</Box>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{r.subject.level}{r.notes ? ` · ${r.notes}` : ''}</Typography>
        </Box>
      ),
    },
    { key: 'can', header: 'Can do it', alwaysVisible: true, render: (r) => (r.eligible ? <StatusBadge status="active" /> : <DangerBadge label="Kept out" />) },
    { key: 'setup', header: 'Setup per run', alwaysVisible: true, render: (r) => <Mono>{r.eligible ? timeText(r.setup) : '—'}</Mono> },
    {
      key: 'work', header: 'Work per piece', alwaysVisible: true,
      render: (r) => <Box sx={{ py: 0.5 }}><Mono>{r.eligible ? timeText(r.work) : '—'}</Mono>{r.eligible && r.work?.formula && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }}>{r.work.formula.expression}</Typography>}</Box>,
    },
    { key: 'valid', header: 'Valid', alwaysVisible: true, render: (r) => <Mono muted>{valid(r)}</Mono> },
  ];
  const machineColumns: DataColumn<OperationMachine>[] = [
    { key: 'machine', header: 'Machine', alwaysVisible: true, sortValue: (m) => m.machine.code, render: (m) => <><Box component={Link} to={to(`machines/${m.machine.id}`)} sx={linkSx}><Mono>{m.machine.code}</Mono></Box> {m.machine.name}</> },
    { key: 'can', header: 'Can do it', alwaysVisible: true, render: (m) => (m.eligible ? <StatusBadge status="active" /> : <DangerBadge label="Kept out" />) },
    { key: 'from', header: 'Decided by', alwaysVisible: true, render: (m) => <Box sx={{ color: 'var(--c-text-2)' }}>{subjectText(m.from)}</Box> },
    { key: 'setup', header: 'Setup', alwaysVisible: true, render: (m) => <Mono>{m.eligible ? timeText(m.setup) : '—'}</Mono> },
    { key: 'work', header: 'Work', alwaysVisible: true, render: (m) => <Mono>{m.eligible ? timeText(m.work) : '—'}</Mono> },
  ];

  const header = (
    <DetailHeader code={o.code} title={o.name} subtitle={o.description ?? undefined} badges={<StatusBadge status={o.status} />}
      actions={canManage && (
        <>
          <Button variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>Edit</Button>
          <Tooltip title="Delete — refused while a flow uses it"><IconButton aria-label="Delete operation" onClick={() => setDeleting(true)}><DeleteOutlineRounded /></IconButton></Tooltip>
        </>
      )}
      facts={(
        <>
          <Fact label="Machines that can"><Mono>{able.length}</Mono></Fact>
          <Fact label="Timing rules"><Mono>{o.rules.length}</Mono></Fact>
          <Fact label="In flows"><Mono>{o.flows.length}</Mono></Fact>
        </>
      )} />
  );
  const crossLinks = (
    <>
      {o.flows.map((f) => <CrossLink key={f.id} icon={<RouteRounded />} label={`${f.code} · step ${f.sequence}`} to={to(`flows/${f.id}`)} />)}
      <CrossLink icon={<PrecisionManufacturingRounded />} label="Machines" count={able.length} onClick={() => setTab('timing')} />
      <CrossLink icon={<TimerRounded />} label="How long?" onClick={() => setTab('try')} />
    </>
  );
  const tabs = [
    { value: 'timing', label: 'Machines and times', count: o.rules.length },
    { value: 'try', label: 'How long?' },
    { value: 'flows', label: 'Flows', count: o.flows.length },
  ];

  return (
    <DetailLayout header={header} crossLinks={crossLinks} tabs={tabs} active={tab} onTab={setTab}>
      {tab === 'timing' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
          <SectionCard flush title="Which machines, and how long" subtitle="Rules per machine type — any level — or per machine. The most specific one valid on the day applies."
            actions={canManage && <Button startIcon={<AddRounded />} onClick={() => setRuleDialog({ open: true, rule: null })}>Add rule</Button>}>
            <DataTable bare rows={o.rules} columns={ruleColumns} getRowId={(r) => r.id}
              empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>No rule yet — add one for a machine type (e.g. every cutting machine) to say who can do it.</Typography>}
              rowActions={canManage ? (r) => (
                <>
                  <Tooltip title="Edit"><IconButton size="small" aria-label="Edit rule" onClick={() => setRuleDialog({ open: true, rule: r })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" aria-label="Delete rule" onClick={() => setDeleteRule(r)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                </>
              ) : undefined} />
          </SectionCard>
          <SectionCard flush title="Machines it reaches today" subtitle="Every active machine a rule reaches, with the rule that decides it.">
            <DataTable bare rows={o.machines} columns={machineColumns} getRowId={(m) => m.machine.id} empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>None yet.</Typography>} />
          </SectionCard>
        </Box>
      )}
      {tab === 'try' && <TryIt key={o.updatedAt + o.rules.length} op={o} />}
      {tab === 'flows' && (
        <SectionCard title="Step of" subtitle="The flows that use this operation, and at which step.">
          {o.flows.length === 0 ? <Typography sx={{ color: 'var(--c-text-3)' }}>Not a step of any flow yet.</Typography> : (
            <EntityList>
              {o.flows.map((f) => (
                <EntityRow key={f.id} onClick={() => navigate(to(`flows/${f.id}`))} code={<Mono chip>{f.code}</Mono>} primary={f.name}
                  secondary={`Step ${f.sequence}`} trailing={<StatusBadge status={f.status} />} />
              ))}
            </EntityList>
          )}
        </SectionCard>
      )}

      <OperationDialog open={editing} existing={o} onClose={() => setEditing(false)} onSaved={(saved) => { toast.success(`${saved.code} saved.`); reload(); }} />
      <TimingRuleDialog open={ruleDialog.open} operationId={id} existing={ruleDialog.rule} tree={tree.data}
        onClose={() => setRuleDialog({ open: false, rule: null })} onSaved={() => { toast.success('Rule saved.'); reload(); }} />
      <ConfirmDialog open={!!deleteRule} danger confirmLabel="Delete rule" title="Delete this timing rule?" entityName={deleteRule ? subjectText(deleteRule.subject) : undefined}
        body="Machines under it fall back to the next rule up, if any."
        onClose={() => setDeleteRule(null)} onConfirm={async () => { await cfApi.del(`/operation-rules/${deleteRule?.id}`); toast.success('Rule deleted.'); reload(); }} />
      <ConfirmDialog open={deleting} danger confirmLabel="Delete" title="Delete this operation?" entityName={`${o.code} · ${o.name}`}
        body="Its timing rules go with it. Refused while it is a step of a flow or a wait rule waits for it — mark it inactive instead."
        onClose={() => setDeleting(false)}
        onConfirm={async () => { await cfApi.del(`/operations/${id}`); invalidateNavCounts(); toast.success('Deleted.'); navigate(to('operations')); }} />
    </DetailLayout>
  );
}
