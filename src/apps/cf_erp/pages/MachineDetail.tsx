import { useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import { cfApi, qs } from '../api/client';
import type { MachineDetail as MachineDetailT, MachineOperation, Resolution, Rule, Tree } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { subjectText, timeText } from '../lib/production';
import { DangerBadge, DetailSkeleton, ErrorNotice, Fact, Mono, RuleBadge, SectionCard, SkeletonRows, StatusBadge } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { EntityList, EntityRow } from '../components/EntityList';
import { SpecsTable } from '../components/SpecsTable';
import { RuleDialog } from '../components/RuleDialog';
import { MachineDialog } from '../components/MachineDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MachineShifts } from '../components/MachineShifts';
import { ValueHistory } from '../components/ValueHistory';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** Record / Detail (§4.3) for a machine: what it carries, what it can do, its shifts and its history. */
export default function MachineDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canManage = isPermitted('cf_erp_production_manage');
  // Specification rules are setup, not production: /rules is guarded by
  // cf_erp_setup_manage, so gating them on production_manage put buttons in
  // front of people the backend then refused with a 403.
  const canSetup = isPermitted('cf_erp_setup_manage');
  const mc = useLoad(() => cfApi.get<MachineDetailT>(`/machines/${id}`), [id]);
  const specs = useLoad(() => cfApi.get<Resolution>(`/machines/${id}/specs`), [id]);
  const rules = useLoad(() => cfApi.get<Rule[]>(`/rules${qs({ subjectType: 'machine', subjectId: id })}`), [id]);
  const tree = useLoad(() => cfApi.get<Tree>('/classification'), []);
  const [tab, setTab] = useUrlParam('tab', 'specs');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: Rule | null }>({ open: false, rule: null });
  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const [version, setVersion] = useState(0);
  const m = mc.data;
  useDetailTitle(m?.code ?? null);

  if (mc.error) return <ErrorNotice error={mc.error} onRetry={mc.reload} />;
  if (!m) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const refreshAll = () => { mc.reload(); specs.reload(); rules.reload(); setVersion((v) => v + 1); };
  const can = m.operations.filter((o) => o.eligible);
  const typeName = m.classificationPath[m.classificationPath.length - 1]?.name ?? m.classificationName;

  const opColumns: DataColumn<MachineOperation>[] = [
    { key: 'op', header: 'Operation', alwaysVisible: true, sortValue: (o) => o.operation.code, render: (o) => <><Box component={Link} to={to(`operations/${o.operation.id}`)} sx={linkSx}>{o.operation.name}</Box> <Mono muted>{o.operation.code}</Mono></> },
    { key: 'can', header: 'Can do it', alwaysVisible: true, sortValue: (o) => (o.eligible ? 1 : 0), render: (o) => (o.eligible ? <StatusBadge status="active" /> : <DangerBadge label="Kept out" title="A rule takes this machine out of the operation" />) },
    { key: 'from', header: 'Set on', alwaysVisible: true, render: (o) => <Box sx={{ color: 'var(--c-text-2)' }}>{subjectText(o.from)}</Box> },
    { key: 'setup', header: 'Setup per run', alwaysVisible: true, render: (o) => <Mono>{o.eligible ? timeText(o.setup) : '—'}</Mono> },
    { key: 'work', header: 'Work per piece', alwaysVisible: true, render: (o) => <Mono>{o.eligible ? timeText(o.work) : '—'}</Mono> },
  ];

  const header = (
    <DetailHeader code={m.code} title={m.name} subtitle={m.notes ?? undefined} badges={<StatusBadge status={m.status} />}
      actions={canManage && (
        <>
          <Button variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>Edit</Button>
          <Tooltip title="Delete — its own values and rules go with it"><IconButton aria-label="Delete machine" onClick={() => setDeleting(true)}><DeleteOutlineRounded /></IconButton></Tooltip>
        </>
      )}
      facts={(
        <>
          <Fact label="Machine type">{typeName}</Fact>
          <Fact label="Serial"><Mono muted={!m.serialNumber}>{m.serialNumber ?? '—'}</Mono></Fact>
          <Fact label="Can do"><Mono>{can.length ? can.map((o) => o.operation.code).join(', ') : 'nothing yet'}</Mono></Fact>
          {m.catalogItem && <Fact label="Bought as"><Mono><Link to={to(`items/${m.catalogItem.id}`)}>{m.catalogItem.code ?? m.catalogItem.name}</Link></Mono></Fact>}
          <Fact label="Updated"><Mono muted>{new Date(m.updatedAt).toLocaleDateString()}</Mono></Fact>
        </>
      )} />
  );
  const crossLinks = (
    <>
      {m.classificationPath.map((p) => (
        <CrossLink key={p.id} icon={<AccountTreeRounded />} label={`${p.level}: ${p.name}`} to={to('classification')} />
      ))}
      <CrossLink icon={<TimerRounded />} label="Operations" count={can.length} onClick={() => setTab('operations')} />
      <CrossLink icon={<ScheduleRounded />} label="Shifts" onClick={() => setTab('shifts')} />
      {m.catalogItem && <CrossLink icon={<Inventory2Rounded />} label={`Bought as ${m.catalogItem.code ?? m.catalogItem.name}`} to={to(`items/${m.catalogItem.id}`)} />}
    </>
  );
  const tabs = [
    { value: 'specs', label: 'Specifications' },
    { value: 'operations', label: 'Operations', count: can.length },
    { value: 'shifts', label: 'Shifts' },
    { value: 'history', label: 'History' },
  ];

  return (
    <DetailLayout header={header} crossLinks={crossLinks} tabs={tabs} active={tab} onTab={setTab}>
      {tab === 'specs' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
          <SectionCard title="Specifications" subtitle="What its machine type says it must carry, and its own values. Timing formulas read these as machine.CODE.">
            <ErrorNotice error={specs.error} onRetry={specs.reload} />
            {specs.loading && !specs.data ? <SkeletonRows rows={4} /> : specs.data && (
              <SpecsTable resolution={specs.data} emptyHint="Add rules on its machine type under Setup › Classification — e.g. a cutting speed for every cutter."
                onSave={canManage ? async (values) => { await cfApi.put(`/machines/${id}/values`, { values }); toast.success('Values saved.'); specs.reload(); setVersion((v) => v + 1); } : undefined} />
            )}
          </SectionCard>
          <SectionCard title="Rules on this machine only" subtitle="Rarely needed — rules usually belong on the machine type so every similar machine shares them."
            actions={canSetup && <Button startIcon={<AddRounded />} onClick={() => setRuleDialog({ open: true, rule: null })}>Add rule</Button>}>
            <ErrorNotice error={rules.error} onRetry={rules.reload} />
            {(rules.data ?? []).length === 0 ? <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>None.</Typography> : (
              <EntityList>
                {(rules.data ?? []).map((rule) => (
                  <EntityRow key={rule.id} primary={<>{rule.specName} <Mono muted>{rule.specCode}</Mono></>}
                    secondary={rule.isApplicable ? (rule.isRequired ? 'Required' : 'Optional') : 'Switched off'}
                    trailing={rule.isApplicable ? <RuleBadge rule={rule.valueRule} /> : undefined}
                    actions={canSetup && (
                      <>
                        <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit rule ${rule.specCode}`} onClick={() => setRuleDialog({ open: true, rule })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete rule ${rule.specCode}`} onClick={() => setDeleteRule(rule)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                      </>
                    )} />
                ))}
              </EntityList>
            )}
          </SectionCard>
        </Box>
      )}

      {tab === 'operations' && (
        <SectionCard flush title="What it can do" subtitle="Operations whose rules reach this machine, and how long they take. Times are set on each operation, per machine type or per machine.">
          <DataTable bare rows={m.operations} columns={opColumns} getRowId={(o) => o.operation.id}
            empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>No operation rule reaches it yet — add one under Production › Operations.</Typography>} />
        </SectionCard>
      )}

      {tab === 'shifts' && <MachineShifts machine={m} />}
      {tab === 'history' && <ValueHistory path={`/machines/${id}/history`} version={version} subtitle="Every change to a value on this machine — who, when, from what to what." />}

      <MachineDialog open={editing} existing={m} tree={tree.data} onClose={() => setEditing(false)} onSaved={(saved) => { toast.success(`${saved.code} saved.`); refreshAll(); }} />
      <ConfirmDialog open={deleting} danger confirmLabel="Delete" title="Delete this machine?" entityName={`${m.code} · ${m.name}`}
        body="Its values, its own rules and the operation times set for it alone go with it. Rules on its machine type stay."
        onClose={() => setDeleting(false)}
        onConfirm={async () => { await cfApi.del(`/machines/${id}`); invalidateNavCounts(); toast.success('Deleted.'); navigate(to('machines')); }} />
      <RuleDialog open={ruleDialog.open} existing={ruleDialog.rule} onClose={() => setRuleDialog({ open: false, rule: null })}
        onSaved={() => { toast.success('Rule saved.'); refreshAll(); }} subjectType="machine" subjectId={id} subjectLabel={m.code} forMachines />
      <ConfirmDialog open={!!deleteRule} title="Delete this rule?" danger confirmLabel="Delete rule" entityName={deleteRule ? `${deleteRule.specCode} · ${deleteRule.specName}` : undefined}
        body="It falls back to whatever its machine type says." onClose={() => setDeleteRule(null)}
        onConfirm={async () => { await cfApi.del(`/rules/${deleteRule?.id}`); toast.success('Rule deleted.'); refreshAll(); }} />
    </DetailLayout>
  );
}
