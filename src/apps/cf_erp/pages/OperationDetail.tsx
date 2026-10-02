import { useEffect, useRef, useState } from 'react';
import { Autocomplete, Box, Button, CircularProgress, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { readPref, writePref } from '@shared/ui';
import { cfApi, CfApiError } from '../api/client';
import type { MasterRecord, Operation, OperationDetail as OperationDetailT, OperationMachine, TimingPreview, TimingRule, Tree } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { minutesText, subjectText, timeText } from '../lib/production';
import { timeInWords, type FieldIndex } from '../lib/formulaBuilder';
import { CapsLabel, DangerBadge, DetailSkeleton, ErrorNotice, Mono, SectionCard, StatusBadge, Surface } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { OperationDialog } from '../components/OperationDialog';
import { TimingRuleDialog } from '../components/TimingRuleDialog';
import { RecordPicker } from '../components/RecordPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MachineTypeCell, TimeCell as SimpleTimeCell } from '../components/OperationRuleEditor';
import { useOperationRuleEditor } from '../hooks/useOperationRuleEditor';
import { pickMainRule } from '../lib/operationRules';
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

/** A rule's time, plainly — "12 min per piece", or the formula in words — with the button that opens the time builder. (Advanced table.) */
function RuleTimeCell({ rule, which, idx, canManage, onEdit }: { rule: TimingRule; which: 'setup' | 'work'; idx: FieldIndex | null; canManage: boolean; onEdit: () => void }) {
  if (!rule.eligible) return <Mono muted>—</Mono>;
  const t = which === 'setup' ? rule.setup : rule.work;
  const empty = !t || (t.minutes == null && !t.formula);
  if (empty && which === 'work') {
    return canManage
      ? <Button size="small" variant="contained" startIcon={<TimerRounded />} onClick={onEdit} data-testid={`set-time-${rule.id}`}>Set time</Button>
      : <Typography sx={{ color: 'var(--c-warning-800)', fontSize: 13 }}>No time yet</Typography>;
  }
  return (
    <Box sx={{ py: 0.5, display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: which === 'work' ? 260 : 140 }}>
      <Box sx={{ flex: 1, minWidth: 0, whiteSpace: 'normal' }}>
        <Box sx={{ fontSize: 14, color: empty ? 'var(--c-text-3)' : 'var(--c-text)' }} data-testid={`time-words-${rule.id}-${which}`}>{timeInWords(t, which, idx)}</Box>
        {t?.formula && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }}>{t.formula.code}{which === 'work' ? ' · per piece' : ' · per run'}</Typography>}
      </Box>
      {canManage && (
        which === 'work'
          ? <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={onEdit} sx={{ flexShrink: 0 }} data-testid={`edit-time-${rule.id}`}>Edit time</Button>
          : <Tooltip title={empty ? 'Set a setup time' : 'Edit the setup time'}><IconButton size="small" aria-label="Edit setup time" onClick={onEdit}><EditRounded fontSize="small" /></IconButton></Tooltip>
      )}
    </Box>
  );
}

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const valid = (r: TimingRule) => (r.effectiveFrom || r.effectiveTo ? `${r.effectiveFrom ?? '…'} → ${r.effectiveTo ?? '…'}` : 'always');

/** The operation's name, renamed where it stands: click, type, Enter (or leave the box) to save, Esc to drop it. */
function InlineName({ value, canEdit, onSave }: { value: string; canEdit: boolean; onSave: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const skip = useRef(false);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  const commit = async () => {
    const next = text.trim();
    setEditing(false);
    if (!next || next === value) { setText(value); return; }
    setBusy(true);
    try { await onSave(next); } catch { setText(value); } finally { setBusy(false); }
  };
  if (!canEdit) return <Typography component="h1" sx={{ fontSize: 18, fontWeight: 600 }}>{value}</Typography>;
  if (editing) {
    return (
      <TextField autoFocus size="small" value={text} onChange={(e) => setText(e.target.value)} inputProps={{ 'aria-label': 'Operation name', 'data-testid': 'op-name-input' }} sx={{ minWidth: 280 }}
        onBlur={() => { if (skip.current) { skip.current = false; return; } void commit(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit(); }
          if (e.key === 'Escape') { skip.current = true; setText(value); setEditing(false); }
        }} />
    );
  }
  return (
    <Box component="button" type="button" data-testid="op-name" title="Click to rename" onClick={() => setEditing(true)} disabled={busy}
      sx={{ font: 'inherit', fontSize: 18, fontWeight: 600, color: 'var(--c-text)', background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--r-sm)', px: 0.75, mx: -0.75, cursor: 'text', textAlign: 'left', '&:hover': { borderColor: 'var(--c-primary-200)', background: 'var(--c-primary-50)' } }}>
      {value}
    </Box>
  );
}

const FIELD_LABEL = { fontSize: 11.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.25 } as const;

/** Record / Detail (§4.3) for an operation: one simple card, and an Advanced fold for everything per-machine. */
export default function OperationDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const op = useLoad(() => cfApi.get<OperationDetailT>(`/operations/${id}`), [id]);
  const tree = useLoad(() => cfApi.get<Tree>('/classification'), []);
  const [advancedParam] = useUrlParam('advanced', '');
  // Advanced is folded until asked for, and remembered per device; "+N more rules" in the list asks for it with ?advanced=1.
  const [advanced, setAdvanced] = useState<boolean>(() => advancedParam === '1' || readPref<boolean>('operation.advanced', false) === true);
  const toggleAdvanced = () => { const next = !advanced; setAdvanced(next); writePref('operation.advanced', next); };
  useEffect(() => { if (advancedParam === '1') setAdvanced(true); }, [advancedParam]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: TimingRule | null }>({ open: false, rule: null });
  const [deleteRule, setDeleteRule] = useState<TimingRule | null>(null);
  const reload = () => { op.reload(); invalidateNavCounts(); };
  const editor = useOperationRuleEditor(reload);
  const { canManage, idx } = editor;
  const o = op.data;
  useDetailTitle(o?.code ?? null);
  if (op.error) return <ErrorNotice error={op.error} onRetry={op.reload} />;
  if (!o) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const ref = { id: o.id, code: o.code, name: o.name };
  const main = pickMainRule(o.rules);
  const others = o.rules.length - 1;

  const ruleColumns: DataColumn<TimingRule>[] = [
    {
      key: 'for', header: 'For', alwaysVisible: true, sortValue: (r) => subjectText(r.subject),
      render: (r) => (
        <Box sx={{ py: 0.5 }}>
          <Box>{r.subject.type === 'machine'
            ? <Box component={Link} to={to(`machines/${r.subject.id}`)} sx={linkSx}><Mono>{r.subject.code ?? r.subject.name ?? '—'}</Mono></Box>
            : r.subject.name ?? r.subject.code ?? '—'}</Box>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{r.subject.level}{r.notes ? ` · ${r.notes}` : ''}</Typography>
        </Box>
      ),
    },
    { key: 'can', header: 'Can do it', alwaysVisible: true, render: (r) => (r.eligible ? <StatusBadge status="active" /> : <DangerBadge label="Kept out" />) },
    { key: 'work', header: 'Time per piece', alwaysVisible: true, render: (r) => <RuleTimeCell rule={r} which="work" idx={idx} canManage={canManage} onEdit={() => editor.editTime(ref, r, 'work', null)} /> },
    { key: 'setup', header: 'Setup per run', alwaysVisible: true, render: (r) => <RuleTimeCell rule={r} which="setup" idx={idx} canManage={canManage} onEdit={() => editor.editTime(ref, r, 'setup', null)} /> },
    { key: 'valid', header: 'Valid', alwaysVisible: true, render: (r) => <Mono muted>{valid(r)}</Mono> },
  ];
  const machineColumns: DataColumn<OperationMachine>[] = [
    { key: 'machine', header: 'Machine', alwaysVisible: true, sortValue: (m) => m.machine.code, render: (m) => <><Box component={Link} to={to(`machines/${m.machine.id}`)} sx={linkSx}><Mono>{m.machine.code}</Mono></Box> {m.machine.name}</> },
    { key: 'can', header: 'Can do it', alwaysVisible: true, render: (m) => (m.eligible ? <StatusBadge status="active" /> : <DangerBadge label="Kept out" />) },
    { key: 'from', header: 'Decided by', alwaysVisible: true, render: (m) => <Box sx={{ color: 'var(--c-text-2)' }}>{subjectText(m.from)}</Box> },
    { key: 'setup', header: 'Setup', alwaysVisible: true, render: (m) => <Mono>{m.eligible ? timeText(m.setup) : '—'}</Mono> },
    { key: 'work', header: 'Work', alwaysVisible: true, render: (m) => <Mono>{m.eligible ? timeText(m.work) : '—'}</Mono> },
  ];
  const rename = async (name: string) => {
    try { await cfApi.put<Operation>(`/operations/${o.id}`, { name }); toast.success('Renamed.'); reload(); } catch (e) { toast.error(e instanceof CfApiError ? e.message : String(e)); throw e; }
  };
  const setStatus = async (status: string) => {
    try { await cfApi.put<Operation>(`/operations/${o.id}`, { status }); reload(); } catch (e) { toast.error(e instanceof CfApiError ? e.message : String(e)); }
  };

  return (
    <Box sx={{ maxWidth: 980 }}>
      <Surface e={2} sx={{ p: 2, mb: 1.5 }} data-testid="op-card">
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
            <Box sx={FIELD_LABEL}>Name</Box>
            <InlineName value={o.name} canEdit={canManage} onSave={rename} />
          </Box>
          {canManage && (
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Tooltip title="Code and description"><Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>Edit</Button></Tooltip>
              <Tooltip title="Delete — refused while a flow uses it"><IconButton aria-label="Delete operation" onClick={() => setDeleting(true)}><DeleteOutlineRounded /></IconButton></Tooltip>
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: '110px 130px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.4fr)' }, gap: 2, alignItems: 'start' }}>
          <Box><Box sx={FIELD_LABEL}>Code</Box><Mono chip>{o.code}</Mono></Box>
          <Box>
            <Box sx={FIELD_LABEL}>Status</Box>
            {canManage
              ? <TextField select size="small" value={o.status} onChange={(e) => void setStatus(e.target.value)} inputProps={{ 'aria-label': 'Status', 'data-testid': 'op-status' }} sx={{ minWidth: 110 }}>
                <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
              </TextField>
              : <StatusBadge status={o.status} />}
          </Box>
          <Box><Box sx={FIELD_LABEL}>Machine type</Box><MachineTypeCell op={ref} rule={main} canManage={canManage} onPick={(el) => editor.pickType(ref, main, el)} /></Box>
          <Box><Box sx={FIELD_LABEL}>Setup time</Box><SimpleTimeCell op={ref} rule={main} which="setup" idx={idx} canManage={canManage} onEdit={(el) => editor.editTime(ref, main, 'setup', el)} /></Box>
          <Box><Box sx={FIELD_LABEL}>Time per quantity</Box><SimpleTimeCell op={ref} rule={main} which="work" idx={idx} canManage={canManage} onEdit={(el) => editor.editTime(ref, main, 'work', el)} /></Box>
        </Box>
        {others > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1.5 }} data-testid="op-more-rules">
            Showing the main rule — <Box component="button" type="button" onClick={() => { if (!advanced) toggleAdvanced(); }} sx={{ font: 'inherit', border: 0, background: 'none', p: 0, color: 'var(--c-primary-700)', cursor: 'pointer', textDecoration: 'underline' }}>+{others} more {others === 1 ? 'rule' : 'rules'} in Advanced</Box>.
          </Typography>
        )}
        <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid var(--c-divider)', fontSize: 13.5 }} data-testid="op-flows">
          <Box component="span" sx={{ color: 'var(--c-text-3)', mr: 1 }}>Used in flows:</Box>
          {o.flows.length === 0
            ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>none yet</Box>
            : o.flows.map((f, i) => (
              <Box component="span" key={f.id}>
                {i > 0 && <Box component="span" sx={{ color: 'var(--c-text-3)', mx: 0.75 }}>·</Box>}
                <Box component={Link} to={to(`flows/${f.id}`)} sx={{ ...linkSx, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} title={`${f.name} — step ${f.sequence}`}>{f.code}</Box>
              </Box>
            ))}
        </Box>
      </Surface>

      <Surface e={1} sx={{ mb: 1.5 }}>
        <Box component="button" type="button" aria-expanded={advanced} data-testid="advanced-toggle" onClick={toggleAdvanced}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', px: 2, py: 1.25, font: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
          {advanced ? <ExpandLessRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
          Advanced
          <Box component="span" sx={{ fontWeight: 400, fontSize: 12.5, color: 'var(--c-text-2)' }}>— rules per machine type or machine, dates, the machines it reaches, how long?</Box>
        </Box>
      </Surface>
      {advanced && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }} data-testid="advanced-body">
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
          <TryIt key={o.updatedAt + o.rules.length} op={o} />
        </Box>
      )}

      <OperationDialog open={editing} existing={o} onClose={() => setEditing(false)} onSaved={(saved) => { toast.success(`${saved.code} saved.`); reload(); }} />
      <TimingRuleDialog open={ruleDialog.open} operationId={id} operation={{ id: o.id, code: o.code, name: o.name }} existing={ruleDialog.rule} tree={tree.data}
        onClose={() => setRuleDialog({ open: false, rule: null })} onSaved={() => { toast.success('Rule saved.'); reload(); }} />
      {editor.ui}
      <ConfirmDialog open={!!deleteRule} danger confirmLabel="Delete rule" title="Delete this timing rule?" entityName={deleteRule ? subjectText(deleteRule.subject) : undefined}
        body="Machines under it fall back to the next rule up, if any."
        onClose={() => setDeleteRule(null)} onConfirm={async () => { await cfApi.del(`/operation-rules/${deleteRule?.id}`); toast.success('Rule deleted.'); reload(); }} />
      <ConfirmDialog open={deleting} danger confirmLabel="Delete" title="Delete this operation?" entityName={`${o.code} · ${o.name}`}
        body="Its timing rules go with it. Refused while it is a step of a flow or a wait rule waits for it — mark it inactive instead."
        onClose={() => setDeleting(false)}
        onConfirm={async () => { await cfApi.del(`/operations/${id}`); invalidateNavCounts(); toast.success('Deleted.'); navigate(to('operations')); }} />
    </Box>
  );
}
