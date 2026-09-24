import { useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import FormatListNumberedRounded from '@mui/icons-material/FormatListNumberedRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import ListAltRounded from '@mui/icons-material/ListAltRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import RuleRounded from '@mui/icons-material/RuleRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { cfApi, type CfApiError } from '../api/client';
import type { Process, ProcessDetail as ProcessDetailT, ProcessRule, ProcessStage, RecordStatus, StageKind } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import {
  ALREADY_ADDED, APPLIES_TO_NOTHING, NO_MANAGE, SCOPE_WORD, appliesTo, isHouseDefault, kindName, kindOf, moveStage,
  noScreenWarning, noScreenYet, notActiveReason, overrideSentence, renumber, requirementHelp, requirementWord,
  ruleScope, ruleSentence, ruleTitle, sortRules, toStageInput,
} from '../lib/process';
import {
  Badge, CapsLabel, DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, PageHeader, SectionCard,
  StatStrip, StatusBadge, WarnBadge,
} from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { EntityList, EntityRow } from '../components/EntityList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Gated, NoManageNotice, ProcessDialog, ProcessRuleDialog, StageDialog } from '../components/ProcessDialogs';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

/**
 * Processes: how an order is worked through the office — its stages, in order,
 * and who each process applies to.
 *
 * Deliberately never called a flow. A flow in this app is how a girder is made
 * (cut, weld, paint) and lives under Production; a process is the office's
 * running order for a whole sales order. Sharing a word would confuse the two
 * daily, so the copy here says "process", "stage" and "order" only.
 */

const STATUS_CHIPS = [['', 'All'], ['active', 'Active'], ['draft', 'Drafts'], ['obsolete', 'Obsolete']] as const;

/** The API owns `rules`; a screen should not fall over if one process comes back without it. */
const rulesOf = (p: Process) => p.rules ?? [];

const matches = (p: Process, term: string) =>
  !term || [p.code, p.name, appliesTo(rulesOf(p))].some((v) => v?.toLowerCase().includes(term));

const COLUMNS: DataColumn<Process>[] = [
  { key: 'code', header: 'Code', render: (p) => <Mono chip>{p.code}</Mono>, sortValue: (p) => p.code, alwaysVisible: true },
  { key: 'name', header: 'Name', render: (p) => <Box sx={{ fontWeight: 500 }}>{p.name}</Box>, sortValue: (p) => p.name },
  {
    key: 'stages', header: 'Stages', numeric: true, sortValue: (p) => p.stageCount ?? 0,
    render: (p) => (p.stageCount ? <Mono>{p.stageCount}</Mono> : <WarnBadge label="None" title="An order following it has nothing to work through" />),
  },
  {
    key: 'applies', header: 'Applies to', sortValue: (p) => appliesTo(rulesOf(p)), exportValue: (p) => appliesTo(rulesOf(p)),
    render: (p) => (rulesOf(p).length
      ? (
        <Box sx={{ whiteSpace: 'normal', minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
          {appliesTo(rulesOf(p))}
          {/* Rules on a process no order can be given are the quiet failure. */}
          {p.status !== 'active' && <WarnBadge label="Not active" title={notActiveReason(p.code, p.status)} />}
        </Box>
      )
      : <Box sx={{ color: 'var(--c-text-3)' }}>{APPLIES_TO_NOTHING}</Box>),
  },
  { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} />, sortValue: (p) => p.status },
];

/** Collection / List (§4.2) of processes. */
export default function Processes() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_setup_manage');
  const [status, setStatus] = useUrlParam('status', '');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  useNewParam(() => { if (canManage) setCreating(true); });
  const list = useLoad(() => cfApi.get<Process[]>('/processes'), []);

  const term = search.trim().toLowerCase();
  const base = useMemo(() => (list.data ?? []).filter((p) => matches(p, term)), [list.data, term]);
  const rows = useMemo(() => base.filter((p) => !status || p.status === status), [base, status]);

  // Figures that name something to fix, not a restatement of the row count (§4.2).
  const stats = [
    { label: 'Processes', value: base.length },
    { label: 'Active', value: base.filter((p) => p.status === 'active').length, tone: 'success' as const, onClick: () => setStatus('active') },
    { label: 'Drafts', value: base.filter((p) => p.status === 'draft').length, tone: 'warning' as const, hint: 'Still being arranged', onClick: () => setStatus('draft') },
    { label: 'Applies to nothing', value: base.filter((p) => !rulesOf(p).length).length, tone: 'warning' as const, hint: 'No customer and no kind of order points at it, so no order picks it' },
  ];

  // The gap nobody notices until an order lands with no process at all.
  const noDefault = !!list.data?.length && !list.data.some((p) => p.status === 'active' && isHouseDefault(rulesOf(p)));
  const filtered = !!term || !!status;
  const open = (p: Process) => navigate(appPath(company, `processes/${p.id}`));

  return (
    <Box>
      <PageHeader
        title="Processes"
        subtitle="How an order is worked through the office: the stages it goes through, in order. Not how a girder is made — that is a flow, under Production."
        actions={(
          <Gated can={canManage}>
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New process</Button>
          </Gated>
        )}
      />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name or who it applies to">
        {STATUS_CHIPS.map(([v, label]) => (
          <FacetChip key={v || 'all'} label={label} active={status === v} count={base.filter((p) => !v || p.status === v).length} onClick={() => setStatus(v)} />
        ))}
      </FilterBar>
      {noDefault && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No active process is the house default. An order that matches no rule is left without one — open a process and add a rule with no customer and no kind of order.
        </Alert>
      )}
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable
        rows={rows} columns={COLUMNS} getRowId={(p) => p.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="processes" exportName="processes" defaultSortKey="code"
        empty={(
          <EmptyState
            icon={<ListAltRounded />}
            title={filtered ? 'No process matches' : 'No processes yet'}
            hint={filtered
              ? 'Clear the search or pick another status.'
              : 'Start with the way most orders run — lines, then structure, then values — and give it to everybody as the house default.'}
            action={!filtered && (
              <Gated can={canManage}>
                <Button variant="contained" onClick={() => setCreating(true)}>New process</Button>
              </Gated>
            )}
          />
        )}
      />
      <ProcessDialog
        open={creating} existing={null} onClose={() => setCreating(false)}
        onSaved={(p) => {
          toast.success(p?.code ? `${p.code} created as a draft.` : 'Created as a draft.');
          // Land on it: a process with no stages is not finished being made.
          if (p?.id) navigate(appPath(company, `processes/${p.id}`)); else list.reload();
        }}
      />
    </Box>
  );
}

/** One stage of a process: its number, what it is, and the controls that reorder it. */
function StageRow({ stage, index, count, kinds, editable, busy, onMove, onMenu, onOptional }: {
  stage: ProcessStage;
  index: number;
  count: number;
  kinds: StageKind[];
  editable: boolean;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onMenu: (el: HTMLElement) => void;
  onOptional: () => void;
}) {
  const own = kindName(stage.stageKey, kinds);
  const title = stage.label?.trim() || own;
  const kind = kindOf(stage.stageKey, kinds);
  const skips = !!stage.overrideSpec;
  const unbuilt = noScreenWarning(stage);

  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '34px minmax(0, 1fr)', sm: '44px minmax(0, 1fr) auto' },
        columnGap: 1.5, rowGap: 1, alignItems: 'flex-start',
        p: 1.5, borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'var(--c-surface)',
      }}
    >
      <Box sx={{
        height: 28, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums',
        background: 'var(--c-primary-50)', color: 'var(--c-primary-900)', border: '1px solid var(--c-primary-200)',
      }}>
        {index + 1}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text)', minWidth: 0, overflowWrap: 'anywhere' }}>{title}</Box>
          <Badge
            family={stage.requirement === 'optional' ? 'info' : 'neutral'}
            label={requirementWord(stage.requirement)}
            title={requirementHelp(stage.requirement)}
            noIcon
          />
          {/* Renamed here: say what it is called everywhere else. */}
          {!!stage.label?.trim() && stage.label.trim() !== own && <Mono muted>{own}</Mono>}
        </Box>
        {kind?.description && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>{kind.description}</Typography>}
        {/* A stage the app cannot work yet never reports as done — say what that costs. */}
        {unbuilt && (
          <Box sx={{
            mt: 1, display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', p: 0.75, borderRadius: 'var(--r-sm)', fontSize: 12.5,
            background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', color: 'var(--c-warning-800)',
          }}>
            <WarningAmberRounded sx={{ fontSize: 16, flexShrink: 0 }} aria-hidden />
            <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>{unbuilt}</Box>
            {editable && stage.requirement === 'required' && (
              <Button size="small" color="inherit" disabled={busy} onClick={onOptional} sx={{ flexShrink: 0, textDecoration: 'underline' }}>
                Make it optional
              </Button>
            )}
          </Box>
        )}
        <Box sx={{
          mt: 1, display: 'flex', gap: 0.75, alignItems: 'flex-start', p: 0.75, borderRadius: 'var(--r-sm)', fontSize: 12.5,
          background: skips ? 'var(--c-info-50)' : 'var(--c-surface-2)',
          border: skips ? '1px solid var(--c-info-200)' : '1px solid var(--c-border)',
          color: skips ? 'var(--c-info-800)' : 'var(--c-text-2)',
        }}>
          <RuleRounded sx={{ fontSize: 16, mt: '1px', flexShrink: 0 }} aria-hidden />
          <Box sx={{ minWidth: 0 }}>
            {overrideSentence(stage)}
            {stage.overrideSpec && <> <Mono muted>{stage.overrideSpec.code}</Mono></>}
          </Box>
        </Box>
      </Box>

      {editable && (
        <Box sx={{ gridColumn: { xs: '2 / -1', sm: 'auto' }, display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
          <Tooltip title="Move up">
            <span>
              <IconButton size="small" aria-label={`Move ${title} up`} disabled={busy || index === 0} onClick={() => onMove(-1)}>
                <ArrowUpwardRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Move down">
            <span>
              <IconButton size="small" aria-label={`Move ${title} down`} disabled={busy || index === count - 1} onClick={() => onMove(1)}>
                <ArrowDownwardRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton size="small" aria-label={`More for ${title}`} disabled={busy} onClick={(e) => onMenu(e.currentTarget)}>
            <MoreVertRounded fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

/** Record / Detail (§4.3) for one process: its stages in order, and who it applies to. */
export function ProcessDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_setup_manage');
  const pr = useLoad(() => cfApi.get<ProcessDetailT>(`/processes/${id}`), [id]);
  const cat = useLoad(() => cfApi.get<StageKind[]>('/stage-catalogue'), []);
  const [tab, setTab] = useUrlParam('tab', 'stages');
  const [editing, setEditing] = useState(false);
  const [addMenu, setAddMenu] = useState<null | HTMLElement>(null);
  const [rowMenu, setRowMenu] = useState<{ el: HTMLElement; stage: ProcessStage } | null>(null);
  const [stageEdit, setStageEdit] = useState<ProcessStage | null>(null);
  const [stageRemove, setStageRemove] = useState<ProcessStage | null>(null);
  const [ruleAdd, setRuleAdd] = useState(false);
  const [ruleRemove, setRuleRemove] = useState<ProcessRule | null>(null);
  const [obsoleting, setObsoleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const p = pr.data;
  useDetailTitle(p?.code ?? null);

  if (pr.error) return <ErrorNotice error={pr.error} onRetry={pr.reload} />;
  if (!p) return <DetailSkeleton />;

  const kinds = cat.data ?? [];
  const stages = p.stages ?? [];
  const rules = sortRules(p.rules ?? []);
  const editable = canManage && p.status !== 'obsolete';
  const editReason = canManage ? 'An obsolete process cannot be changed — reactivate it first.' : NO_MANAGE;
  const optional = stages.filter((s) => s.requirement === 'optional').length;

  /**
   * The API takes the stages only as a whole ordered list, so every change —
   * a move, a rename, a removal — sends all of them. The list is updated first
   * so the row moves under the cursor; a failure puts the old list back and
   * says why above it.
   */
  const putStages = async (next: ProcessStage[]) => {
    const optimistic = renumber(next);
    pr.setData({ ...p, stages: optimistic, stageCount: optimistic.length });
    setBusy(true);
    setActionError(null);
    try {
      const saved = await cfApi.put<ProcessDetailT>(`/processes/${id}/stages`, { stages: optimistic.map(toStageInput) });
      // The contract does not promise the process back; use it when it comes, refetch when it does not.
      if (saved && saved.id === id && Array.isArray(saved.stages)) pr.setData(saved); else pr.reload();
    } catch (e) {
      pr.setData(p);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  /** The same save for the controls that are not inside a dialog of their own. */
  const runStages = (next: ProcessStage[], done?: string) => {
    void putStages(next).then(() => { if (done) toast.success(done); }).catch((e) => setActionError(e as CfApiError));
  };

  const addStage = (kind: StageKind) => {
    setAddMenu(null);
    const unbuilt = noScreenYet(kind.key);
    runStages([...stages, {
      // A stand-in id until the save answers — it is only a key, and the save sends kinds, not ids.
      id: -Date.now(),
      stageKey: kind.key,
      label: null,
      sequence: stages.length + 1,
      requirement: 'required',
      overrideSpec: null,
      settings: null,
    }], unbuilt
      ? `${kind.label} added. ${unbuilt} Mark it optional unless you want it to hold orders up.`
      : `${kind.label} added at the end.`);
  };

  const setStatus = async (status: RecordStatus) => {
    setBusy(true);
    setActionError(null);
    try {
      const saved = await cfApi.post<ProcessDetailT>(`/processes/${id}/status`, { status });
      if (saved && saved.id === id) pr.setData(saved); else pr.reload();
      toast.success(status === 'active' ? 'Activated.' : 'Marked obsolete.');
    } catch (e) {
      setActionError(e as CfApiError);
    } finally {
      setBusy(false);
    }
  };

  const menuStage = rowMenu?.stage ?? null;
  const closeRowMenu = () => setRowMenu(null);

  const header = (
    <DetailHeader
      code={p.code} title={p.name} subtitle={p.description ?? undefined} badges={<StatusBadge status={p.status} />}
      actions={(
        <>
          {/* A process with no stages is refused, so say why here rather than after a round trip. */}
          {p.status !== 'active' && (
            <Gated can={canManage && stages.length > 0} reason={canManage ? 'Add at least one stage first' : NO_MANAGE}>
              <Button
                variant="contained" disabled={busy} onClick={() => setStatus('active')}
                startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRounded />}
              >
                {p.status === 'draft' ? 'Activate' : 'Reactivate'}
              </Button>
            </Gated>
          )}
          {p.status === 'active' && (
            <Gated can={canManage}>
              <Button variant="outlined" startIcon={<ArchiveRounded />} onClick={() => setObsoleting(true)}>Mark obsolete</Button>
            </Gated>
          )}
          <Gated can={editable} reason={editReason}>
            <Button startIcon={<EditRounded />} onClick={() => setEditing(true)} sx={{ color: 'var(--c-text-2)' }}>Edit</Button>
          </Gated>
        </>
      )}
      facts={(
        <>
          <Fact label="Stages"><Mono>{stages.length}</Mono></Fact>
          <Fact label="Optional"><Mono muted={!optional}>{optional}</Mono></Fact>
          <Fact label="Applies to">{rules.length ? <Box sx={{ fontSize: 13.5 }}>{rules.map(ruleTitle).join(' · ')}</Box> : <Box sx={{ color: 'var(--c-text-3)', fontSize: 13.5 }}>{APPLIES_TO_NOTHING}</Box>}</Fact>
        </>
      )}
    >
      <ErrorNotice error={actionError} sx={{ mt: 2, mb: 0 }} />
    </DetailHeader>
  );

  const crossLinks = (
    <>
      <CrossLink icon={<FormatListNumberedRounded />} label="Stages" count={stages.length} onClick={() => setTab('stages')} />
      <CrossLink icon={<GroupsRounded />} label="Applies to" count={rules.length} onClick={() => setTab('rules')} />
    </>
  );

  return (
    <DetailLayout
      header={header} crossLinks={crossLinks} active={tab} onTab={setTab}
      tabs={[{ value: 'stages', label: 'Stages', count: stages.length }, { value: 'rules', label: 'Who it applies to', count: rules.length }]}
    >
      {/* Said once, rather than a screenful of disabled icons on every row. */}
      {!canManage && <NoManageNotice />}

      {/* Only an active process is handed to a new order, so the order of work
          is: stages, then activate, then rules. A rule added first does nothing. */}
      {p.status === 'draft' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Only an active process is given to new orders. The usual order is: add its stages, activate it, then say who it applies to.
        </Alert>
      )}
      {p.status === 'obsolete' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No new order is given an obsolete process. Orders already following it keep it; reactivate it to use it again.
        </Alert>
      )}

      {tab === 'stages' && (
        <SectionCard
          title="Stages"
          subtitle="In the order they are worked, top to bottom. Move a stage with the arrows; every change saves the whole list. An order is given its process when it is created, so a change here never moves an order onto a different process."
          actions={(
            <>
              {busy && <CapsLabel>Saving…</CapsLabel>}
              <Gated can={editable} reason={editReason}>
                <Button startIcon={<AddRounded />} disabled={busy} onClick={(e) => setAddMenu(e.currentTarget)}>Add stage</Button>
              </Gated>
            </>
          )}
        >
          <ErrorNotice error={cat.error} onRetry={cat.reload} />
          {stages.length === 0 ? (
            <EmptyState
              icon={<FormatListNumberedRounded />}
              title="No stages yet"
              hint="Add the first stage from the catalogue — most processes start with the order's lines, then its structure."
              action={(
                <Gated can={editable} reason={editReason}>
                  <Button variant="contained" onClick={(e) => setAddMenu(e.currentTarget)}>Add stage</Button>
                </Gated>
              )}
            />
          ) : (
            <Box
              component="ol"
              aria-busy={busy}
              sx={{
                m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1,
                opacity: busy ? 0.6 : 1, pointerEvents: busy ? 'none' : 'auto',
                transition: 'opacity var(--t-fast) var(--ease)',
              }}
            >
              {stages.map((s, i) => (
                <StageRow
                  key={s.id} stage={s} index={i} count={stages.length} kinds={kinds} editable={editable} busy={busy}
                  onMove={(dir) => runStages(moveStage(stages, i, dir))}
                  onMenu={(el) => setRowMenu({ el, stage: s })}
                  onOptional={() => runStages(
                    stages.map((x) => (x.id === s.id ? { ...x, requirement: 'optional' } : x)),
                    'Now optional — an order can move past it.',
                  )}
                />
              ))}
            </Box>
          )}
        </SectionCard>
      )}

      {tab === 'rules' && (
        <SectionCard
          title="Who it applies to"
          subtitle="An order takes the process whose rule fits it best: a rule naming both a customer and a kind of order beats one naming only the customer, which beats one naming only the kind, which beats the house default."
          actions={(
            <Gated can={editable} reason={editReason}>
              <Button startIcon={<AddRounded />} onClick={() => setRuleAdd(true)}>Add rule</Button>
            </Gated>
          )}
        >
          {rules.length === 0 ? (
            <EmptyState
              icon={<GroupsRounded />}
              title="No order picks this process yet"
              hint="Add a rule: a customer, a kind of order, or neither. Neither makes it the house default — what an order follows when nothing narrower claims it."
              action={(
                <Gated can={editable} reason={editReason}>
                  <Button variant="contained" onClick={() => setRuleAdd(true)}>Add rule</Button>
                </Gated>
              )}
            />
          ) : (
            <>
              {/* The API's own words for a rule that points at a process no order can be given. */}
              {p.status !== 'active' && <Alert severity="warning" sx={{ mb: 2 }}>{notActiveReason(p.code, p.status)}</Alert>}
              <CapsLabel>Most specific first</CapsLabel>
              <Box sx={{ mt: 1 }}>
                <EntityList>
                  {rules.map((r) => (
                    <EntityRow
                      key={r.id}
                      primary={ruleTitle(r)}
                      secondary={ruleSentence(r)}
                      trailing={<Badge family={ruleScope(r) === 'default' ? 'neutral' : 'info'} label={SCOPE_WORD[ruleScope(r)]} noIcon />}
                      actions={editable && (
                        <Tooltip title="Remove">
                          <IconButton size="small" aria-label={`Remove rule: ${ruleTitle(r)}`} onClick={() => setRuleRemove(r)}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    />
                  ))}
                </EntityList>
              </Box>
            </>
          )}
        </SectionCard>
      )}

      <Menu anchorEl={addMenu} open={!!addMenu} onClose={() => setAddMenu(null)}>
        {cat.loading && !cat.data && <MenuItem disabled>Loading the catalogue…</MenuItem>}
        {!!cat.error && <MenuItem disabled>The catalogue of stages could not be loaded</MenuItem>}
        {kinds.map((k) => {
          // A kind happens once: two of them would work out the same state, so
          // neither could ever be the reason an order is held up. The API
          // refuses it — the menu says so before the click.
          const already = stages.some((s) => s.stageKey === k.key);
          const unbuilt = noScreenYet(k.key);
          return (
            <MenuItem key={k.key} disabled={already} onClick={() => addStage(k)} sx={{ display: 'block', maxWidth: 360, whiteSpace: 'normal', py: 1 }}>
              <Box sx={{ fontSize: 14, fontWeight: 500 }}>{k.label}</Box>
              {k.description && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{k.description}</Typography>}
              {already && <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{ALREADY_ADDED}</Typography>}
              {!already && unbuilt && (
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-warning-800)' }}>{unbuilt} Mark it optional unless you want it to hold orders up.</Typography>
              )}
            </MenuItem>
          );
        })}
        {!cat.loading && !cat.error && kinds.length === 0 && <MenuItem disabled>No kinds of stage are on offer</MenuItem>}
      </Menu>

      <Menu anchorEl={rowMenu?.el ?? null} open={!!rowMenu} onClose={closeRowMenu}>
        <MenuItem
          onClick={() => {
            closeRowMenu();
            if (!menuStage) return;
            const next = menuStage.requirement === 'optional' ? 'required' : 'optional';
            runStages(
              stages.map((s) => (s.id === menuStage.id ? { ...s, requirement: next } : s)),
              next === 'optional' ? 'Now optional — an order can move past it.' : 'Now required — an order waits here.',
            );
          }}
        >
          {menuStage?.requirement === 'optional' ? 'Make it required' : 'Make it optional'}
        </MenuItem>
        <MenuItem onClick={() => { setStageEdit(menuStage); closeRowMenu(); }}>Edit name and skipping…</MenuItem>
        <MenuItem onClick={() => { setStageRemove(menuStage); closeRowMenu(); }}>Remove stage</MenuItem>
      </Menu>

      <ProcessDialog
        open={editing} existing={p} onClose={() => setEditing(false)}
        onSaved={(saved) => { if (saved?.id === id) pr.setData(saved); else pr.reload(); toast.success('Saved.'); }}
      />

      {!!stageEdit && (
        <StageDialog
          open stage={stageEdit} kinds={kinds} onClose={() => setStageEdit(null)}
          onSave={async (patch) => {
            await putStages(stages.map((s) => (s.id === stageEdit.id ? { ...s, ...patch } : s)));
            toast.success('Stage saved.');
          }}
        />
      )}

      {ruleAdd && (
        <ProcessRuleDialog
          open processId={id} onClose={() => setRuleAdd(false)}
          onSaved={() => { pr.reload(); toast.success('Rule added.'); }}
        />
      )}

      <ConfirmDialog
        open={!!stageRemove} danger confirmLabel="Remove stage" title="Remove this stage?"
        entityName={stageRemove ? `${p.code} · ${stageRemove.label?.trim() || kindName(stageRemove.stageKey, kinds)}` : undefined}
        body="The stages after it move up, and the whole list is saved as it then stands."
        onClose={() => setStageRemove(null)}
        onConfirm={async () => {
          await putStages(stages.filter((s) => s.id !== stageRemove?.id));
          toast.success('Stage removed.');
        }}
      />

      <ConfirmDialog
        open={!!ruleRemove} danger confirmLabel="Remove rule" title="Remove this rule?"
        entityName={ruleRemove ? ruleTitle(ruleRemove) : undefined}
        body="Orders already running keep the process they were given. New orders that matched this rule fall back to the next best one — or to nothing, if there is none."
        onClose={() => setRuleRemove(null)}
        onConfirm={async () => { await cfApi.del(`/process-rules/${ruleRemove?.id}`); pr.reload(); toast.success('Rule removed.'); }}
      />

      <ConfirmDialog
        open={obsoleting} title={`Mark ${p.code} obsolete?`} confirmLabel="Mark obsolete"
        body="Orders already following it keep it, but no new order picks it and it can no longer be changed. It can be reactivated."
        onClose={() => setObsoleting(false)}
        onConfirm={async () => {
          const saved = await cfApi.post<ProcessDetailT>(`/processes/${id}/status`, { status: 'obsolete' });
          if (saved && saved.id === id) pr.setData(saved); else pr.reload();
          toast.success('Marked obsolete.');
        }}
      />
    </DetailLayout>
  );
}
