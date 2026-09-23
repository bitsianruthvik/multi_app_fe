import { useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import { cfApi, CfApiError } from '../api/client';
import type { FlowDetail as FlowDetailT, FlowStep } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { CapsLabel, DetailSkeleton, ErrorNotice, Fact, KindChip, Mono, SectionCard, StatusBadge, Surface } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { EntityList, EntityRow } from '../components/EntityList';
import { FlowDialog, StepDialog, WaitDialog } from '../components/FlowDialogs';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

function StepCard({ step, editable, onEdit, onRemove, onAddWait, onRemoveWait }: {
  step: FlowStep; editable: boolean; onEdit: () => void; onRemove: () => void; onAddWait: () => void; onRemoveWait: (id: number) => void;
}) {
  const company = useCompanySlug();
  return (
    <Surface e={1} sx={{ p: 1.5, flex: '1 1 280px', minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontWeight: 500 }}>
            <Link to={appPath(company, `operations/${step.operation.id}`)}>{step.operation.name}</Link> <Mono muted>{step.operation.code}</Mono>
            {step.operation.status !== 'active' && <Box component="span" sx={{ ml: 1 }}><StatusBadge status="inactive" /></Box>}
          </Box>
          {step.stepName && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{step.stepName}</Typography>}
        </Box>
        {editable && (
          <Box sx={{ display: 'flex', flexShrink: 0 }}>
            <IconButton size="small" aria-label={`Edit step ${step.operation.code}`} onClick={onEdit}><EditRounded fontSize="small" /></IconButton>
            <IconButton size="small" aria-label={`Remove step ${step.operation.code}`} onClick={onRemove}><DeleteOutlineRounded fontSize="small" /></IconButton>
          </Box>
        )}
      </Box>
      <Box sx={{ mt: 1, display: 'grid', gap: 0.5 }}>
        {step.waits.map((w) => (
          <Box key={w.id} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', fontSize: 13, p: 0.75, borderRadius: 'var(--r-sm)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)' }}>
            <HourglassTopRounded sx={{ fontSize: 16, color: 'var(--c-warning-800)', mt: 0.125 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box>{w.text}</Box>
              {w.notes && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{w.notes}</Typography>}
            </Box>
            {editable && <IconButton size="small" aria-label="Remove this wait" onClick={() => onRemoveWait(w.id)} sx={{ p: 0.25 }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton>}
          </Box>
        ))}
        {editable && <Button size="small" startIcon={<HourglassTopRounded />} onClick={onAddWait} sx={{ justifySelf: 'start' }}>Add a wait</Button>}
      </Box>
    </Surface>
  );
}

/** Record / Detail (§4.3) for a flow: its steps in order, what each waits for, and what uses it. */
export default function FlowDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const fl = useLoad(() => cfApi.get<FlowDetailT>(`/flows/${id}`), [id]);
  const [tab, setTab] = useUrlParam('tab', 'steps');
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<{ open: boolean; step: FlowStep | null }>({ open: false, step: null });
  const [waitFor, setWaitFor] = useState<FlowStep | null>(null);
  const [removing, setRemoving] = useState<FlowStep | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'obsolete' | 'revise' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const f = fl.data;
  useDetailTitle(f?.code ?? null);
  if (fl.error) return <ErrorNotice error={fl.error} onRetry={fl.reload} />;
  if (!f) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const editable = canManage && f.status !== 'obsolete';
  const groups = [...new Set(f.steps.map((s) => s.sequence))].map((seq) => ({ seq, steps: f.steps.filter((s) => s.sequence === seq) }));
  const waits = f.steps.reduce((n, s) => n + s.waits.length, 0);
  const usedBy = f.uses.records.length + f.uses.bomLines;
  const recordPath = (r: FlowDetailT['uses']['records'][number]) => to(`${r.kind === 'template' || r.kind === 'selection' ? 'definitions' : 'items'}/${r.id}`);

  const act = async (key: string, fn: () => Promise<FlowDetailT>, done: string) => {
    setBusy(key); setActionError(null);
    try { fl.setData(await fn()); invalidateNavCounts(); toast.success(done); } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };
  const setStatus = (status: 'active' | 'obsolete') => act(status, () => cfApi.post<FlowDetailT>(`/flows/${id}/status`, { status }), status === 'active' ? 'Activated.' : 'Marked obsolete.');
  const removeWait = (waitId: number) => act(`w${waitId}`, () => cfApi.del<FlowDetailT>(`/flow-waits/${waitId}`), 'Wait removed.');

  const header = (
    <DetailHeader code={f.code} title={f.name} subtitle={f.description ?? undefined} badges={<StatusBadge status={f.status} />}
      actions={canManage && (
        <>
          {f.status !== 'active' && (
            <Button variant="contained" disabled={!!busy} onClick={() => setStatus('active')}
              startIcon={busy === 'active' ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRounded />}>{f.status === 'draft' ? 'Activate' : 'Reactivate'}</Button>
          )}
          {f.status === 'active' && <Button variant="outlined" startIcon={<ArchiveRounded />} onClick={() => setConfirm('obsolete')}>Mark obsolete</Button>}
          {editable && <Button variant="outlined" startIcon={<HistoryRounded />} onClick={() => setConfirm('revise')}>New revision</Button>}
          <Button startIcon={<EditRounded />} onClick={() => setEditing(true)} sx={{ color: 'var(--c-text-2)' }}>Edit</Button>
          <Tooltip title="Delete — refused while anything is made by it"><IconButton aria-label="Delete flow" onClick={() => setConfirm('delete')}><DeleteOutlineRounded /></IconButton></Tooltip>
        </>
      )}
      facts={(
        <>
          <Fact label="Revision"><Mono>{f.revision ?? '—'}</Mono></Fact>
          <Fact label="Steps"><Mono>{f.steps.length}</Mono></Fact>
          <Fact label="Waits"><Mono>{waits}</Mono></Fact>
          <Fact label="Made by it"><Mono>{f.uses.records.length} record{f.uses.records.length === 1 ? '' : 's'} · {f.uses.bomLines} BOM line{f.uses.bomLines === 1 ? '' : 's'}</Mono></Fact>
        </>
      )}>
      <ErrorNotice error={actionError} sx={{ mt: 2, mb: 0 }} />
    </DetailHeader>
  );
  const crossLinks = (
    <>
      <CrossLink icon={<RouteRounded />} label="Steps" count={f.steps.length} onClick={() => setTab('steps')} />
      <CrossLink icon={<HourglassTopRounded />} label="Waits" count={waits} onClick={() => setTab('steps')} />
      <CrossLink icon={<Inventory2Rounded />} label="Made by it" count={usedBy} onClick={() => setTab('uses')} />
    </>
  );

  return (
    <DetailLayout header={header} crossLinks={crossLinks} active={tab} onTab={setTab}
      tabs={[{ value: 'steps', label: 'Steps', count: f.steps.length }, { value: 'uses', label: 'Made by it', count: usedBy }]}>
      {tab === 'steps' && (
        <SectionCard title="Steps" subtitle="In sequence; steps with the same number run alongside. By default a piece waits for all its child pieces to be complete — a wait rule on a step replaces that for the children it names."
          actions={editable && <Button startIcon={<AddRounded />} onClick={() => setStep({ open: true, step: null })}>Add step</Button>}>
          {groups.length === 0 ? (
            <Typography sx={{ color: 'var(--c-text-3)' }}>No steps yet. Add the operations in the order the work is done.</Typography>
          ) : (
            <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5 }}>
              {groups.map((g, i) => (
                <Box component="li" key={g.seq} sx={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{ width: 40, height: 28, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 13,
                      background: 'var(--c-primary-50)', color: 'var(--c-primary-900)', border: '1px solid var(--c-primary-200)' }}>{g.seq}</Box>
                    {i < groups.length - 1 && <Box sx={{ flex: 1, width: '2px', background: 'var(--c-divider)', mt: 0.5 }} />}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    {g.steps.length > 1 && <CapsLabel>{g.steps.length} steps alongside</CapsLabel>}
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: g.steps.length > 1 ? 0.5 : 0 }}>
                      {g.steps.map((s) => (
                        <StepCard key={s.id} step={s} editable={editable} onEdit={() => setStep({ open: true, step: s })} onRemove={() => setRemoving(s)}
                          onAddWait={() => setWaitFor(s)} onRemoveWait={removeWait} />
                      ))}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </SectionCard>
      )}

      {tab === 'uses' && (
        <SectionCard title="Made by this flow" subtitle="Items and templates that are usually made this way. BOM lines can also name it for one parent.">
          {usedBy === 0 ? <Typography sx={{ color: 'var(--c-text-3)' }}>Nothing names it yet — choose it on an item or template, under Details.</Typography> : (
            <EntityList>
              {f.uses.records.map((r) => (
                <EntityRow key={r.id} onClick={() => navigate(recordPath(r))} code={<Mono chip>{r.code ?? '—'}</Mono>} primary={r.name} trailing={<KindChip kind={r.kind} />} />
              ))}
              {f.uses.bomLines > 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }}>And {f.uses.bomLines} BOM line{f.uses.bomLines === 1 ? '' : 's'} name it for one parent.</Typography>}
            </EntityList>
          )}
        </SectionCard>
      )}

      <FlowDialog open={editing} existing={f} onClose={() => setEditing(false)} onSaved={(saved) => { fl.setData(saved); toast.success('Saved.'); }} />
      <StepDialog open={step.open} flow={f} existing={step.step} onClose={() => setStep({ open: false, step: null })} onSaved={(saved) => { fl.setData(saved); toast.success('Step saved.'); }} />
      <WaitDialog open={!!waitFor} step={waitFor} onClose={() => setWaitFor(null)} onSaved={(saved) => { fl.setData(saved); toast.success('Wait added.'); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove step" title="Remove this step?" entityName={removing ? `${f.code} · step ${removing.sequence} · ${removing.operation.code}` : undefined}
        body="Its wait rules go with it. Other steps that wait for this operation keep their rules." onClose={() => setRemoving(null)}
        onConfirm={async () => { fl.setData(await cfApi.del<FlowDetailT>(`/flow-steps/${removing?.id}`)); toast.success('Step removed.'); }} />
      <ConfirmDialog open={confirm === 'obsolete'} title={`Mark ${f.code} obsolete?`} confirmLabel="Mark obsolete"
        body="Records that name it keep it, but it can no longer be chosen or changed. It can be reactivated." onClose={() => setConfirm(null)}
        onConfirm={async () => { fl.setData(await cfApi.post<FlowDetailT>(`/flows/${id}/status`, { status: 'obsolete' })); invalidateNavCounts(); toast.success('Marked obsolete.'); }} />
      <ConfirmDialog open={confirm === 'revise'} title="New revision" confirmLabel="Revise"
        body={`Same flow, same id — only the label moves on (now ${f.revision ?? 'none'}). Use it when the steps change in a way people should notice.`}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { const saved = await cfApi.post<FlowDetailT>(`/flows/${id}/revise`, {}); fl.setData(saved); toast.success(`Now at revision ${saved.revision}.`); }} />
      <ConfirmDialog open={confirm === 'delete'} danger confirmLabel="Delete" title="Delete this flow?" entityName={`${f.code} · ${f.name}`}
        body="Its steps and waits go with it. Refused while an item, template or BOM line names it — mark it obsolete instead." onClose={() => setConfirm(null)}
        onConfirm={async () => { await cfApi.del(`/flows/${id}`); invalidateNavCounts(); toast.success('Deleted.'); navigate(to('flows')); }} />
    </DetailLayout>
  );
}
