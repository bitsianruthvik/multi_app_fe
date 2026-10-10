import { useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import { cfApi, CfApiError } from '../api/client';
import type { FlowDetail as FlowDetailT, FlowStepTime, FlowStepsSaved, Operation } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useLeaveGuard } from '../hooks/useLeaveGuard';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useOperationRuleEditor } from '../hooks/useOperationRuleEditor';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { Badge, DetailSkeleton, ErrorNotice, Fact, KindChip, Mono, SectionCard, StatusBadge, Surface } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { EntityList, EntityRow } from '../components/EntityList';
import { FlowDialog, MergeDialog, OperationPickDialog, WaitDialog } from '../components/FlowDialogs';
import { FlowSteps, type FlowStepsActions } from '../components/FlowSteps';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';
import { isDefinitionKind } from '../lib/displayCode';
import {
  addStep, addWait, changesOf, draftOf, editStep, findStep, laneNumbers, layoutOf, mergeChoices, mergeLanes, moveStep, moveStepBy, payloadOf, problemsOf, removeExtra,
  removeStep, removeWait, ruleOfTime, setOperation, splitAt, timeOfRule, waitClash, type DraftStep, type FlowDraft, type Gap, type Merge,
} from '../lib/flowEdit';

const SAVE_REACH = 'Saving re-checks every definition and open order row made by this flow.';

/** Which operation the picker is choosing, and where it goes in the draft. */
type Picking = { mode: 'add'; gap: Gap; beforeSplit: boolean } | { mode: 'split'; gap: Gap } | { mode: 'replace'; stepKey: string };

/**
 * Record / Detail (§4.3) for a flow: its steps in lanes, what each waits for, how long each takes,
 * and what uses it.
 *
 * The steps have two modes. VIEW shows the saved flow. EDIT works on a draft (lib/flowEdit): steps
 * are added, lanes split and merged, cards dragged, replaced and removed freely, and nothing is sent
 * until Save — one request with the whole list — because a flow change re-checks records across the
 * app. Cancel throws the draft away; Undo takes back the last change. The one thing that saves on
 * its own in either mode is an operation's time: that belongs to the operation, not to this flow,
 * and its dialog says so.
 */
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
  const [confirm, setConfirm] = useState<'delete' | 'obsolete' | 'revise' | 'discard' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  // Edit mode: the draft is the whole of it (null = view mode), with the drafts before it for Undo.
  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [past, setPast] = useState<FlowDraft[]>([]);
  // The step whose name or notes are being typed: one Undo takes the typing back, not a letter of it.
  const [typing, setTyping] = useState<string | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [merging, setMerging] = useState<Gap | null>(null);
  const [waitFor, setWaitFor] = useState<{ stepKey: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<CfApiError | null>(null);
  const stepEdit = draft != null;
  // The operations on offer, read once a flow is being edited; their main rule gives a new step's times.
  const ops = useLoad<Operation[] | null>(() => (stepEdit ? cfApi.get<Operation[]>('/operations?status=active') : Promise.resolve(null)), [stepEdit]);
  const editor = useOperationRuleEditor(() => { fl.reload(); ops.reload(); });
  const f = fl.data;
  useDetailTitle(f?.code ?? null);

  const saved = useMemo(() => (f ? draftOf(f.steps) : null), [f]);
  const shown = draft ?? saved;
  const layout = useMemo(() => (shown ? layoutOf(shown) : null), [shown]);
  const changes = useMemo(() => (f && draft ? changesOf(f.steps, draft) : null), [f, draft]);
  // What stops a save — a lane left open. Said while editing; a saved flow from before lanes may have one too.
  const problems = useMemo(() => (shown && layout ? problemsOf(shown, layout) : []), [shown, layout]);
  const pending = changes?.count ?? 0;
  const pendingText = `${pending} change${pending === 1 ? '' : 's'} not saved`;
  useLeaveGuard(stepEdit && pending > 0, `${pendingText} to this flow. Leave and lose ${pending === 1 ? 'it' : 'them'}?`);
  // An operation's times: as the flow carries them (with the short chart form), else from the operations list.
  const times = useMemo(() => {
    const m = new Map<number, FlowStepTime>();
    for (const o of ops.data ?? []) m.set(o.id, timeOfRule(o.mainRule ?? null, o.ruleCount));
    for (const s of f?.steps ?? []) if (s.time) m.set(s.operation.id, s.time);
    return m;
  }, [f, ops.data]);

  if (fl.error) return <ErrorNotice error={fl.error} onRetry={fl.reload} />;
  if (!f || !saved || !shown || !layout) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const editable = canManage && f.status !== 'obsolete';
  const waits = f.steps.reduce((n, s) => n + s.waits.length, 0);
  const recordTotal = f.uses.recordCount ?? f.uses.records.length;
  const usedBy = recordTotal + f.uses.bomLines;
  const recordPath = (r: FlowDetailT['uses']['records'][number]) => to(`${r.kind === 'template' || r.kind === 'selection' ? 'definitions' : 'items'}/${r.id}`);

  const act = async (key: string, fn: () => Promise<FlowDetailT>, done: string) => {
    setBusy(key); setActionError(null);
    try { fl.setData(await fn()); invalidateNavCounts(); toast.success(done); } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };
  const setStatus = (status: 'active' | 'obsolete') => act(status, () => cfApi.post<FlowDetailT>(`/flows/${id}/status`, { status }), status === 'active' ? 'Activated.' : 'Marked obsolete.');

  // --- edit mode ---------------------------------------------------------------
  // View mode shows each row's number as saved; edit mode the one Save will write (10, 20, 30 …).
  const savedNumber = (r: number) => {
    const inRow = f.steps.filter((s) => layout.row.get(`s${s.id}`) === r).map((s) => s.sequence);
    return inRow.length ? Math.min(...inRow) : r * 10;
  };
  const numberOf = (r: number) => (stepEdit ? r * 10 : savedNumber(r));
  const apply = (next: FlowDraft) => { if (draft && next !== draft) { setPast((p) => [...p.slice(-49), draft]); setDraft(next); setSaveError(null); setTyping(null); } };
  const change = (fn: (d: FlowDraft) => FlowDraft) => { if (draft) apply(fn(draft)); };
  /** A change that may be refused: the reason is said, and nothing moves. */
  const attempt = (fn: (d: FlowDraft) => { draft: FlowDraft; error: string | null }): string | null => {
    if (!draft) return null;
    const r = fn(draft);
    if (r.error) return r.error;
    apply(r.draft);
    return null;
  };
  const undo = () => { if (past.length) { setDraft(past[past.length - 1]); setPast(past.slice(0, -1)); setSaveError(null); setTyping(null); } };
  const startEdit = () => { setSaveError(null); setPast([]); setDraft(draftOf(f.steps)); setTab('steps'); };
  const leaveEdit = () => { setDraft(null); setPast([]); setSaveError(null); setPicking(null); setMerging(null); setWaitFor(null); };
  const cancelEdit = () => (pending > 0 ? setConfirm('discard') : leaveEdit());
  const save = async () => {
    if (!draft || problems.length) return;
    setSaving(true); setSaveError(null);
    try {
      const r = await cfApi.put<FlowStepsSaved>(`/flows/${id}/steps`, payloadOf(draft));
      fl.setData(r.flow); leaveEdit(); invalidateNavCounts(); toast.success(r.summary);
    } catch (e) {
      setSaveError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    } finally { setSaving(false); }
  };
  const say = (error: string | null) => { if (error) toast.error(error); };
  /** Merge at a gap: when there is one obvious way — one other lane, meeting at the step under the gap — it is done at once. */
  const startMerge = (gap: Gap) => {
    if (!draft) return;
    const c = mergeChoices(draft, gap);
    const closers = c.lanes.filter((l) => !l.isGapLane && l.closable);
    if (c.below && closers.length === 1 && c.lanes.length === 2) {
      const refused = attempt((d) => mergeLanes(d, { closing: [closers[0].key], target: gap.lane, at: c.below as string }));
      if (!refused) return;
    }
    setMerging(gap);
  };
  const actions: FlowStepsActions = {
    add: (gap, beforeSplit) => setPicking({ mode: 'add', gap, beforeSplit }),
    split: (gap) => setPicking({ mode: 'split', gap }),
    merge: startMerge,
    move: (stepKey, gap) => say(attempt((d) => moveStep(d, stepKey, gap))),
    moveBy: (stepKey, direction) => say(attempt((d) => moveStepBy(d, stepKey, direction))),
    remove: (step) => change((d) => removeStep(d, step.key)),
    replace: (step) => setPicking({ mode: 'replace', stepKey: step.key }),
    edit: (step, patch) => {
      if (!draft) return;
      if (typing === step.key) setDraft(editStep(draft, step.key, patch)); else { apply(editStep(draft, step.key, patch)); setTyping(step.key); }
    },
    addWait: (step) => setWaitFor({ stepKey: step.key }),
    removeWait: (step, wait) => change((d) => removeWait(d, step.key, wait.key)),
    removeExtra: (step, afterKey) => change((d) => removeExtra(d, step.key, afterKey)),
  };
  const editTime = (step: DraftStep, which: 'setup' | 'work', anchor: HTMLElement) =>
    editor.editTime({ id: step.operation.id, code: step.operation.code, name: step.operation.name }, ruleOfTime(step.operation.id, times.get(step.operation.id)), which, anchor);

  const pickStep = picking?.mode === 'replace' && draft ? findStep(draft, picking.stepKey) : null;
  const pickLane = picking && picking.mode !== 'replace' && draft ? laneNumbers(draft, layout).get(picking.gap.lane) ?? 1 : 1;
  const allOps = ops.data ?? [];
  const passes = (operationId: number) => Object.values(draft?.steps ?? {}).filter((s) => s.operation.id === operationId).length;
  const picked = (o: Operation) => {
    const operation = { id: o.id, code: o.code, name: o.name, status: o.status };
    if (!picking) return;
    if (picking.mode === 'add') change((d) => addStep(d, picking.gap, operation, { beforeSplit: picking.beforeSplit }));
    else if (picking.mode === 'split') change((d) => splitAt(d, picking.gap, operation));
    else change((d) => setOperation(d, picking.stepKey, operation));
  };
  const waitStep = waitFor && draft ? findStep(draft, waitFor.stepKey) : null;
  const waitNumber = waitStep ? (layout.row.get(waitStep.key) ?? 0) * 10 : null;
  const empty = Object.keys(shown.steps).length === 0;

  const header = (
    <DetailHeader code={f.code} title={f.name} subtitle={f.description ?? undefined} badges={<StatusBadge status={f.status} />}
      actions={canManage && (
        <>
          {/* A flow with no steps is always refused, so say why here rather than after a round trip. */}
          {f.status !== 'active' && (
            <Tooltip title={f.steps.length ? '' : 'Add at least one step first'}>
              <span>
                <Button variant="contained" disabled={!!busy || stepEdit || f.steps.length === 0} onClick={() => setStatus('active')}
                  startIcon={busy === 'active' ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRounded />}>{f.status === 'draft' ? 'Activate' : 'Reactivate'}</Button>
              </span>
            </Tooltip>
          )}
          {f.status === 'active' && <Button variant="outlined" disabled={stepEdit} startIcon={<ArchiveRounded />} onClick={() => setConfirm('obsolete')}>Mark obsolete</Button>}
          {editable && <Button variant="outlined" disabled={stepEdit} startIcon={<HistoryRounded />} onClick={() => setConfirm('revise')}>New revision</Button>}
          <Button startIcon={<EditRounded />} disabled={stepEdit} onClick={() => setEditing(true)} sx={{ color: 'var(--c-text-2)' }}>Edit details</Button>
          <Tooltip title="Delete — refused while anything is made by it"><span><IconButton aria-label="Delete flow" disabled={stepEdit} onClick={() => setConfirm('delete')}><DeleteOutlineRounded /></IconButton></span></Tooltip>
        </>
      )}
      facts={(
        <>
          <Fact label="Revision"><Mono>{f.revision ?? '—'}</Mono></Fact>
          <Fact label="Steps"><Mono>{f.steps.length}</Mono></Fact>
          <Fact label="Waits"><Mono>{waits}</Mono></Fact>
          <Fact label="Made by it"><Mono>{recordTotal} record{recordTotal === 1 ? '' : 's'} · {f.uses.bomLines} BOM line{f.uses.bomLines === 1 ? '' : 's'}</Mono></Fact>
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
        <SectionCard title={stepEdit ? 'Steps — editing' : 'Steps'}
          subtitle={stepEdit
            ? 'Point at a gap for Add, Split (open a lane beside) or Merge (lanes meet). Drag a step by its handle, or use its arrows, to move it — within its lane or to another. Every lane you open must meet another again. Nothing changes until you save.'
            : 'Top to bottom. Steps side by side are in lanes and run at the same time: inside a lane a step waits for the one above it, and where lanes meet the step waits for the last step of each. Between pieces, a piece waits for all its child pieces to be complete — a wait rule on a step replaces that for the children it names.'}
          actions={editable && !stepEdit && <Button variant="outlined" startIcon={<EditRounded />} onClick={startEdit} data-testid="edit-steps">Edit steps</Button>}>
          {!stepEdit && problems.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              This flow ends in more than one lane. It works as it always has; the next time its steps are edited, the open lane has to meet another before it can be saved.
            </Alert>
          )}
          {empty ? (
            <Box sx={{ py: 1 }}>
              <Typography sx={{ color: 'var(--c-text-3)' }}>
                {stepEdit ? 'No steps yet. Add the operations in the order the work is done.' : editable ? 'No steps yet. Choose Edit steps and add the operations in the order the work is done.' : 'No steps yet.'}
              </Typography>
              {stepEdit && <Button variant="outlined" startIcon={<AddRounded />} onClick={() => setPicking({ mode: 'add', gap: { lane: shown.lanes[0].key, index: 0 }, beforeSplit: false })} sx={{ mt: 1 }}>Add the first step</Button>}
            </Box>
          ) : (
            <FlowSteps draft={shown} layout={layout} numberOf={numberOf} editing={stepEdit} changes={changes} timeOf={(operationId) => times.get(operationId)} idx={editor.idx}
              canEditTime={editor.canManage} onEditTime={editTime} actions={actions} />
          )}
          {stepEdit && changes && changes.removedSteps.length > 0 && (
            <Box data-testid="removed-steps" sx={{ mt: 1.5, pt: 1, borderTop: '1px dashed var(--c-border)', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
              <Badge family="danger" label="Removed" title="These steps go when you save. Undo brings the last one back." noIcon />
              {changes.removedSteps.map((s) => <Box key={s.id} component="span" sx={{ textDecoration: 'line-through' }}>{s.operation.name} <Mono muted>{s.operation.code}</Mono></Box>)}
            </Box>
          )}
        </SectionCard>
      )}

      {tab === 'uses' && (
        <SectionCard title="Made by this flow" subtitle="Items and templates that are usually made this way. BOM lines can also name it for one parent.">
          {usedBy === 0 ? <Typography sx={{ color: 'var(--c-text-3)' }}>Nothing names it yet — choose it on an item or template, under Details.</Typography> : (
            <EntityList>
              {f.uses.records.map((r) => (
                <EntityRow key={r.id} onClick={() => navigate(recordPath(r))} code={isDefinitionKind(r.kind) ? (r.shortName ? <Mono chip>{r.shortName}</Mono> : undefined) : <Mono chip>{r.code ?? '—'}</Mono>} primary={r.name} trailing={<KindChip kind={r.kind} />} />
              ))}
              {recordTotal > f.uses.records.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }}>Showing {f.uses.records.length} of {recordTotal} records.</Typography>}
              {f.uses.bomLines > 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }}>And {f.uses.bomLines} BOM line{f.uses.bomLines === 1 ? '' : 's'} name it for one parent.</Typography>}
            </EntityList>
          )}
        </SectionCard>
      )}

      {/* What is waiting, and the one way to save it. Sticky, and outside the tabs: the draft outlives a look at "Made by it". */}
      {stepEdit && (
        <Box sx={{ position: 'sticky', bottom: 12, zIndex: 'var(--z-sticky)', minWidth: 0, mt: 1.5 }}>
          <Surface e={2} role="region" aria-label="Edit mode — changes waiting to be saved" data-testid="flow-edit-bar"
            sx={{ px: 2, py: 1.25, borderColor: problems.length ? 'var(--c-danger-600)' : pending ? 'var(--c-warning-200)' : 'var(--c-border)' }}>
            {saveError && <Box sx={{ maxHeight: 220, overflowY: 'auto', mb: 1 }}><ErrorNotice error={saveError} sx={{ mb: 0 }} /></Box>}
            {problems.length > 0 && (
              <Alert severity="error" data-testid="flow-problems" sx={{ mb: 1 }}>
                <Box>This cannot be saved yet.</Box>
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>{problems.map((p) => <li key={p}>{p}</li>)}</Box>
              </Alert>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
              <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }} aria-live="polite">
                  {pending ? pendingText : 'No changes yet'}
                  {changes?.words && <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-2)' }}>{` · ${changes.words}`}</Box>}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>The flow stays as it was until you save.</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button onClick={undo} disabled={!past.length || saving} startIcon={<UndoRounded />} data-testid="undo-step">Undo</Button>
                <Button onClick={cancelEdit} disabled={saving}>Cancel</Button>
                <Tooltip title={problems.length ? 'Close every open lane first — see above.' : SAVE_REACH}>
                  <span>
                    <Button variant="contained" onClick={save} disabled={!pending || saving || problems.length > 0} data-testid="save-steps"
                      startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>{saving ? 'Saving…' : 'Save'}</Button>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          </Surface>
        </Box>
      )}

      {editor.ui}
      <FlowDialog open={editing} existing={f} onClose={() => setEditing(false)} onSaved={(savedFlow) => { fl.setData(savedFlow); toast.success('Saved.'); }} />
      <OperationPickDialog open={!!picking} options={allOps} loading={ops.loading} exclude={pickStep ? [pickStep.operation.id] : []} passes={picking?.mode === 'replace' ? undefined : passes}
        title={picking?.mode === 'replace' ? `Replace ${pickStep?.operation.name ?? 'the operation'}` : picking?.mode === 'split' ? `Split lane ${pickLane} — the first step of the new lane` : picking?.beforeSplit ? 'Add a step before the split' : 'Add a step here'}
        subtitle={picking?.mode === 'replace' ? 'The step keeps its place, name and waits.'
          : picking?.mode === 'split' ? `A lane opens beside lane ${pickLane} at this point, as lane ${pickLane + 1}. From here down the two run side by side, until they meet again.`
            : picking?.beforeSplit ? 'It comes before the lanes split off; they then split off after it.'
              : `It goes into lane ${pickLane} at this place and waits for the step above it.`}
        note={picking?.mode === 'replace'
          ? 'On Save, time overrides and contractor assignments of orders not yet released move to the new operation. A step already in production cannot change its operation — add a new step instead.'
          : picking?.mode === 'split' ? 'Every lane you open has to meet another again (Merge) before the flow can be saved.' : undefined}
        confirmLabel={picking?.mode === 'replace' ? 'Replace' : picking?.mode === 'split' ? 'Split' : 'Add step'} onClose={() => setPicking(null)} onPick={picked} />
      <MergeDialog open={!!merging} draft={draft} gap={merging} options={allOps} loading={ops.loading} onClose={() => setMerging(null)}
        onMerge={(merge: Merge) => attempt((d) => mergeLanes(d, merge))} />
      <WaitDialog open={!!waitFor} step={waitStep ? { sequence: waitNumber, operation: waitStep.operation } : null} options={allOps}
        clash={(w) => !!waitStep && waitClash(waitStep, w)} onClose={() => setWaitFor(null)} onAdd={(w) => { if (waitFor) change((d) => addWait(d, waitFor.stepKey, w)); }} />
      <ConfirmDialog open={confirm === 'discard'} danger confirmLabel="Discard changes" title="Discard the changes?"
        body="Everything changed since Edit steps is dropped. The flow stays as it was saved." onClose={() => setConfirm(null)} onConfirm={async () => { leaveEdit(); }} />
      <ConfirmDialog open={confirm === 'obsolete'} title={`Mark ${f.code} obsolete?`} confirmLabel="Mark obsolete"
        body="Records that name it keep it, but it can no longer be chosen or changed. It can be reactivated." onClose={() => setConfirm(null)}
        onConfirm={async () => { fl.setData(await cfApi.post<FlowDetailT>(`/flows/${id}/status`, { status: 'obsolete' })); invalidateNavCounts(); toast.success('Marked obsolete.'); }} />
      <ConfirmDialog open={confirm === 'revise'} title="New revision" confirmLabel="Revise"
        body={`Same flow, same id — only the label moves on (now ${f.revision ?? 'none'}). Use it when the steps change in a way people should notice.`}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { const next = await cfApi.post<FlowDetailT>(`/flows/${id}/revise`, {}); fl.setData(next); toast.success(`Now at revision ${next.revision}.`); }} />
      <ConfirmDialog open={confirm === 'delete'} danger confirmLabel="Delete" title="Delete this flow?" entityName={`${f.code} · ${f.name}`}
        body="Its steps and waits go with it. Refused while an item, template or BOM line names it — mark it obsolete instead." onClose={() => setConfirm(null)}
        onConfirm={async () => { await cfApi.del(`/flows/${id}`); invalidateNavCounts(); toast.success('Deleted.'); navigate(to('flows')); }} />
    </DetailLayout>
  );
}
