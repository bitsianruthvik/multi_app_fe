import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import CallSplitRounded from '@mui/icons-material/CallSplitRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import { getLinePlaceholders, placeholderTitle } from '../api/placeholders';
import type { Sourcing, MasterRecord, Resolution, Rule, ScreenTree, Tree } from '../api/types';
import { screenTreePath } from '../lib/classificationScreens';
import { SOURCING_HELP, SOURCING_LABEL, SOURCING_OPTIONS, folderSharers, folderSharingNote } from '../lib/records';
import { findNode } from '../lib/tree';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { Badge, DetailSkeleton, ErrorNotice, Fact, KindChip, Mono, RuleBadge, SectionCard, SkeletonRows, StatusBadge } from '../components/ui';
import { ShortNameField } from '../components/ShortNameField';
import { shortNameBody, shortNameText } from '../lib/shortName';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { EntityList, EntityRow } from '../components/EntityList';
import { FormDialog } from '../components/FormDialog';
import { SpecsTable } from '../components/SpecsTable';
import { RuleDialog } from '../components/RuleDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SelectionPanel } from '../components/SelectionPanel';
import { BomPanel } from '../components/Bom/BomPanel';
import { ClassificationPicker } from '../components/ClassificationPicker';
import { CreateRecordDialog } from '../components/CreateRecordDialog';
import { FlowPicker } from '../components/FlowPicker';
import { FlowTag } from '../components/FlowTag';
import { ItemStockPanel } from '../components/ItemStockPanel';
import { ItemMoneyFacts } from '../components/ItemMoneyFacts';
import { useItemMoney } from '../hooks/useItemMoney';
import { BASIS_OPTIONS } from '../lib/money';
import { getTaxSettings } from '../api/gst';
import { gstRateText } from '../lib/gst';
import { HsnChip } from '../components/GstUi';
import type { PriceBasis } from '../api/money';
import { ValueHistory } from '../components/ValueHistory';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

/** HSN, GST rate and service tick, wherever the server puts them (on the record, or on its item). */
function recordTax(r: MasterRecord): { hsn: string | null; rate: number | null; isService: boolean } {
  return { hsn: r.hsnCode ?? r.item?.hsnCode ?? null, rate: r.gstRate ?? r.item?.gstRate ?? null, isService: !!(r.isService ?? r.item?.isService) };
}

const SELECTION_MODE: Record<string, string> = { allowed_list: 'An allowed list', spec_match: 'Matching specifications', both: 'List + matching' };

function RevisionDialog({ open, record, onClose, onDone }: { open: boolean; record: MasterRecord; onClose: () => void; onDone: (r: MasterRecord) => void }) {
  const [label, setLabel] = useState('');
  useEffect(() => { if (open) setLabel(''); }, [open]);
  const go = async () => onDone(await cfApi.post<MasterRecord>(`/records/${record.id}/revision`, { revision: label || null }));
  return (
    <FormDialog open={open} title="New revision" onClose={onClose} onSubmit={go} submitLabel="Revise" maxWidth="xs"
      subtitle={<>Same record, same id — only the label moves on. Documents keep the revision they were made with. Now at <Mono>{record.revision ?? 'none'}</Mono>.</>}>
      <TextField label="New revision label" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth helperText="Leave empty for the next label (A → B, 0 → 1, R3 → R4)" autoFocus />
    </FormDialog>
  );
}

/** The title as text that turns into a box on click: Enter saves, Escape cancels. */
function InlineName({ value, editable, onSave }: { value: string; editable: boolean; onSave: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const done = async () => {
    const next = text.trim();
    if (!next || next === value) { setEditing(false); setText(value); return; }
    setBusy(true);
    try { await onSave(next); setEditing(false); } catch { setText(value); setEditing(false); } finally { setBusy(false); }
  };
  if (!editable) return <>{value}</>;
  if (editing) {
    return (
      <TextField size="small" autoFocus fullWidth value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onBlur={done}
        inputProps={{ 'aria-label': 'Name' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void done(); } else if (e.key === 'Escape') { setText(value); setEditing(false); } }} />
    );
  }
  return (
    <Tooltip title="Click to rename">
      <Box component="span" role="button" tabIndex={0} onClick={() => { setText(value); setEditing(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { setText(value); setEditing(true); } }}
        sx={{ cursor: 'text', borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-primary-50)' } }}>{value}</Box>
    </Tooltip>
  );
}

function DetailsForm({ record, tree, canEdit, onSaved, onTreeChanged }: {
  record: MasterRecord; tree: Tree | null; canEdit: boolean; onSaved: (r: MasterRecord) => void; onTreeChanged: () => void;
}) {
  const screen = record.recordKind === 'item' ? 'items' : 'definitions';
  // A selection's search area is an Items branch: read that tree only for a selection.
  const searchesItems = record.definition?.definitionType === 'selection';
  const itemsTree = useLoad(() => (searchesItems ? cfApi.get<ScreenTree>(screenTreePath('items')) : Promise.resolve(null)), [searchesItems]);
  const [form, setForm] = useState({
    name: record.name, description: record.description ?? '', code: record.code ?? '', shortName: record.shortName ?? '', noShortName: record.shortName === '', classificationId: record.classificationId,
    uom: record.item?.uom ?? '', trackedBy: record.item?.trackedBy ?? 'quantity', sourcing: record.item?.sourcing ?? 'stock',
    selectionMode: record.definition?.selectionMode ?? 'allowed_list', candidateClassificationId: record.definition?.candidateClassificationId ?? null,
    defaultFlowId: record.defaultFlowId ?? null,
    listPrice: record.item?.listPrice == null ? '' : String(record.item.listPrice), priceBasis: (record.item?.priceBasis ?? 'unit') as PriceBasis,
    hsnCode: recordTax(record).hsn ?? '', gstRate: recordTax(record).rate == null ? '' : String(recordTax(record).rate), isService: recordTax(record).isService,
  });
  const rates = useLoad(() => getTaxSettings().then((t) => t.gstRates), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const isTemp = record.item?.itemType === 'temporary';
  const isSelection = record.definition?.definitionType === 'selection';
  // HSN / SAC and the GST rate live on a catalog item and on a template — what an order line is priced from.
  const taxable = !isTemp && !isSelection;
  // Frozen records keep every field read-only. A LOCKED line (not released)
  // still takes a new "Usually made by" — and only that (user, 2026-09-30).
  const readOnly = !!record.frozen;
  const flowOnly = record.frozen?.reason === 'locked';
  const save = async () => {
    setBusy(true);
    setError(null);
    if (flowOnly) {
      try { onSaved(await cfApi.put<MasterRecord>(`/records/${record.id}`, { defaultFlowId: form.defaultFlowId })); } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
      return;
    }
    const body: Record<string, unknown> = { name: form.name, description: form.description || null, ...shortNameBody(form.shortName, form.noShortName) };
    if (record.status === 'draft') body.code = form.code || null;
    if (!isTemp) body.classificationId = form.classificationId;
    if (record.item) { body.uom = form.uom; body.trackedBy = form.trackedBy; if (!isTemp) body.sourcing = form.sourcing; if (!isTemp) { body.listPrice = form.listPrice.trim() === '' ? null : form.listPrice; body.priceBasis = form.priceBasis; } }
    if (taxable) { body.hsnCode = form.hsnCode.trim() || null; body.gstRate = form.gstRate === '' ? null : Number(form.gstRate); body.isService = form.isService; }
    if (isSelection) { body.selectionMode = form.selectionMode; body.candidateClassificationId = form.candidateClassificationId; }
    else body.defaultFlowId = form.defaultFlowId;
    try { onSaved(await cfApi.put<MasterRecord>(`/records/${record.id}`, body)); } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  return (
    <SectionCard title="Details" sx={{ maxWidth: 880 }}>
      <ErrorNotice error={error} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Name" required disabled={readOnly} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ gridColumn: '1 / -1' }}
          error={!form.name.trim()} helperText={!form.name.trim() ? 'A name is required.' : ' '} />
        <TextField label="Code" value={form.code} disabled={readOnly || record.status !== 'draft'} onChange={(e) => setForm({ ...form, code: e.target.value })}
          helperText={record.status === 'draft' ? 'Editable while draft' : 'Fixed once active — documents may carry it'} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
        <ShortNameField disabled={readOnly} value={form.shortName} none={form.noShortName} onChange={(n) => setForm({ ...form, shortName: n.value, noShortName: n.none })}
          helperText="Codes are built from this. Editable at any status — codes already made keep theirs." />
        <TextField label="Description" disabled={readOnly} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} />
        <Box sx={{ gridColumn: '1 / -1' }}>
          <ClassificationPicker tree={tree} value={form.classificationId} onChange={(id) => id && setForm({ ...form, classificationId: id })} disabled={isTemp || readOnly}
            scope={record.recordKind} allowCreate={canEdit} onTreeChanged={onTreeChanged} screen={screen}
            helperText={isTemp ? 'A temporary item sits where its definition sits' : 'Moving it changes which rules and defaults reach it'} />
        </Box>
        {record.item && (
          <>
            <TextField select label="Tracked by" disabled={readOnly} value={form.trackedBy} onChange={(e) => setForm({ ...form, trackedBy: e.target.value as typeof form.trackedBy })}>
              <MenuItem value="quantity">Quantity</MenuItem><MenuItem value="batch">Batch</MenuItem><MenuItem value="individual">Individual unit</MenuItem>
            </TextField>
            <TextField label="Unit of measure" disabled={readOnly} value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
            {!isTemp && (
              <TextField select label="Comes from" disabled={readOnly} value={form.sourcing} sx={{ gridColumn: '1 / -1' }}
                onChange={(e) => setForm({ ...form, sourcing: e.target.value as Sourcing })}
                helperText={SOURCING_HELP[form.sourcing]}>
                {SOURCING_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            )}
            {!isTemp && (
              <>
                <TextField label="List price (₹)" disabled={readOnly} value={form.listPrice} onChange={(e) => setForm({ ...form, listPrice: e.target.value })}
                  inputProps={{ inputMode: 'decimal' }} helperText="What it sells for, before tax. Empty = no list price." />
                <TextField select label="Priced" disabled={readOnly} value={form.priceBasis} onChange={(e) => setForm({ ...form, priceBasis: e.target.value as PriceBasis })}
                  helperText="A sales line picks this up as its rate.">
                  {BASIS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </TextField>
              </>
            )}
          </>
        )}
        {taxable && (
          <>
            <TextField label="HSN / SAC" disabled={readOnly} value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value.replace(/s+/g, '') })}
              inputProps={{ inputMode: 'numeric', maxLength: 8, style: { fontFamily: 'var(--font-mono)' } }}
              helperText={form.isService ? 'SAC: 6 digits, starting 99' : 'HSN: 4, 6 or 8 digits. Steel girders: 7308.'} />
            <TextField select label="GST rate" disabled={readOnly} value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
              helperText="From your rate list in Setup › Company tax details. An invoice cannot be issued without one.">
              <MenuItem value="">no GST rate</MenuItem>
              {[...new Set([...(rates.data ?? []), ...(form.gstRate === '' ? [] : [Number(form.gstRate)])])].sort((a, b) => a - b).map((r) => <MenuItem key={r} value={String(r)}>{gstRateText(r)}</MenuItem>)}
            </TextField>
            <FormControlLabel sx={{ gridColumn: '1 / -1', mt: -1 }} disabled={readOnly}
              control={<Checkbox size="small" checked={form.isService} onChange={(e) => setForm({ ...form, isService: e.target.checked })} />} label="This is a service (SAC, not HSN)" />
          </>
        )}
        {!isSelection && (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <FlowPicker value={form.defaultFlowId} onChange={(id) => setForm({ ...form, defaultFlowId: id })} label="Usually made by"
              disabled={readOnly && !flowOnly}
              helperText={flowOnly
                ? 'Its line’s design is frozen, so only this can change — until the line is released.'
                : isTemp && record.definitionFlow && !form.defaultFlowId
                ? `Empty: its template's flow, ${record.definitionFlow.code}`
                : 'The flow it is made by unless a BOM line says otherwise. Empty for things bought in.'} />
          </Box>
        )}
        {isSelection && (
          <>
            <TextField select label="Chooses from" disabled={readOnly} value={form.selectionMode} onChange={(e) => setForm({ ...form, selectionMode: e.target.value as typeof form.selectionMode })}>
              <MenuItem value="allowed_list">An allowed list</MenuItem><MenuItem value="spec_match">Matching specifications</MenuItem><MenuItem value="both">Both</MenuItem>
            </TextField>
            <ClassificationPicker tree={itemsTree.data ?? tree} value={form.candidateClassificationId} onChange={(id) => setForm({ ...form, candidateClassificationId: id })} leafOnly={false} label="Search within (optional)" disabled={readOnly} screen="items" />
          </>
        )}
      </Box>
      {readOnly && !flowOnly ? null : canEdit ? (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="contained" onClick={save}
            disabled={busy || !form.name.trim() || (flowOnly && (form.defaultFlowId ?? null) === (record.defaultFlowId ?? null))}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
            {busy ? 'Saving…' : flowOnly ? 'Save how it is made' : 'Save details'}
          </Button>
        </Box>
      ) : (
        <Typography sx={{ mt: 2, fontSize: 13, color: 'var(--c-text-2)' }}>You can read these details but not change them.</Typography>
      )}
    </SectionCard>
  );
}


/** Record / Detail (DESIGN_SYSTEM.md §4.3) for an item or a definition. */
export default function RecordDetail({ recordKind }: { recordKind: 'item' | 'definition' }) {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canManage = isPermitted('cf_erp_catalog_manage');
  // Spec rules live under Setup, whatever they are attached to: the backend
  // guards /rules with setup_manage, not catalog_manage.
  const canSetup = isPermitted('cf_erp_setup_manage');
  const rec = useLoad(() => cfApi.get<MasterRecord>(`/records/${id}`), [id]);
  const specs = useLoad(() => cfApi.get<Resolution>(`/records/${id}/specs`), [id]);
  const rules = useLoad(() => cfApi.get<Rule[]>(`/rules${qs({ subjectType: 'master', subjectId: id })}`), [id]);
  const tree = useLoad(() => cfApi.get<ScreenTree>(screenTreePath(recordKind === 'item' ? 'items' : 'definitions')), [recordKind]);
  const money = useItemMoney(id, recordKind === 'item' && rec.data?.item?.itemType === 'catalog', rec.data?.updatedAt ?? '');
  const [tab, setTab] = useUrlParam('tab', 'specs');
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  /** "Make a similar one" — the create form, pre-filled from this record. */
  const [copying, setCopying] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'obsolete' | null>(null);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: Rule | null }>({ open: false, rule: null });
  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const [version, setVersion] = useState(0);
  /** After a definition is renamed: its own folder may still carry the old name. */
  const [folderOffer, setFolderOffer] = useState<{ nodeId: number; oldName: string; note: string | null } | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);

  const r = rec.data;
  // An order's row has no code until its line is locked; its page shows the code
  // its pieces will get instead, read from the line it belongs to.
  const ownerLineId = r?.kind === 'temporary' && !r.code ? r.item?.ownerOrderLineId ?? null : null;
  const placed = useLoad(() => (ownerLineId == null ? Promise.resolve(null) : getLinePlaceholders(ownerLineId).catch(() => null)), [ownerLineId]);
  const placeholder = placed.data?.rows.find((row) => row.itemId === id && row.code) ?? null;
  // The row it sits in has no code of its own either: show that row's code too, from the same answer.
  const parentPlaceholder = r?.placement ? placed.data?.rows.find((row) => row.itemId === r.placement?.parentId && row.code) ?? null : null;
  useDetailTitle(r ? (r.code ?? r.name) : null);
  const refreshAll = () => { rec.reload(); specs.reload(); rules.reload(); setVersion((v) => v + 1); };

  /**
   * `rethrow` is for the confirm dialog: it must stay open and show the refusal
   * itself, instead of closing as though the change went through.
   */
  const setStatus = async (status: 'active' | 'obsolete', rethrow = false) => {
    setBusyAction(status);
    setActionError(null);
    try {
      rec.setData(await cfApi.post<MasterRecord>(`/records/${id}/status`, { status }));
      invalidateNavCounts();
      toast.success(status === 'active' ? 'Activated.' : 'Marked obsolete.');
      specs.reload();
    } catch (e) {
      if (rethrow) throw e;
      setActionError(e as CfApiError);
    } finally {
      setBusyAction(null);
    }
  };

  if (rec.error) return <ErrorNotice error={rec.error} onRetry={rec.reload} />;
  if (!r) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const isDefinition = r.recordKind === 'definition';
  const frozen = r.frozen ?? null;
  const editable = canManage && !frozen;
  const isSelection = r.definition?.definitionType === 'selection';
  const listPath = recordKind === 'item' ? 'items' : 'definitions';
  const ruleCount = rules.data?.length ?? 0;
  const rulesEditable = canSetup && !frozen;
  // Copying makes a new record, so a frozen one may still be copied — but a
  // temporary item may not: it is born from a sales order line (ORDER_ONLY).
  const canCopy = canManage && r.kind !== 'temporary';
  // A row of an order has no status of its own to manage: locking its line
  // activates it, and a change after that is a new revision of the order.
  const isRow = r.kind === 'temporary';
  const frozenLabel = !frozen ? null
    : frozen.reason === 'released' ? `Released — ${frozen.orderCode} line ${frozen.lineNo}`
      : frozen.reason === 'locked' ? `Frozen — ${frozen.orderCode} line ${frozen.lineNo}`
        : `Frozen — order ${frozen.orderCode} is ${frozen.orderStatus}`;
  const frozenTitle = !frozen ? undefined
    : frozen.reason === 'released' ? 'Released to production: its structure and values are frozen.'
      : frozen.reason === 'locked' ? 'Its line’s design is frozen: the structure, values and cut pieces are fixed, and its pieces have their codes. A change is a new revision of the order.'
        : undefined;

  const renameTo = async (name: string) => {
    const oldName = r.name;
    const folder = (r.classificationPath ?? []).at(-1);
    try {
      rec.setData(await cfApi.put<MasterRecord>(`/records/${id}`, { name }));
      toast.success('Renamed.');
      // The tree was read with the page, so its counts still include this record; folderSharers takes it out.
      const node = folder ? findNode(tree.data?.roots ?? [], folder.id) : null;
      const note = folderSharingNote(folderSharers(node, isDefinition ? 'definition' : 'item'));
      setFolderOffer(isDefinition && canSetup && folder && folder.name === oldName ? { nodeId: folder.id, oldName, note } : null);
    } catch (e) { setActionError(e as CfApiError); throw e; }
  };
  const renameFolder = async () => {
    if (!folderOffer) return;
    setFolderBusy(true);
    try {
      await cfApi.put(`/classification/${folderOffer.nodeId}`, { name: r.name });
      setFolderOffer(null);
      toast.success('Folder renamed.');
      rec.reload(); tree.reload();
    } catch (e) { setActionError(e as CfApiError); } finally { setFolderBusy(false); }
  };

  const header = (
    <DetailHeader code={r.code ?? placeholder?.code ?? undefined} title={<InlineName value={r.name} editable={editable} onSave={renameTo} />} subtitle={r.description ?? undefined}
      badges={(
        <>
          <KindChip kind={r.kind} />
          {!isRow && <HsnChip hsn={recordTax(r).hsn} rate={recordTax(r).rate} isService={recordTax(r).isService} />}
          {!isRow && <StatusBadge status={r.status} />}
          {!r.code && (isRow
            ? <Badge family="neutral" label="Coded when its design is frozen" title={placeholder ? placeholderTitle(placeholder) : 'Its pieces get their codes when its design is frozen.'} />
            : <Badge family="warning" label="No code yet" />)}
          {frozen && <Badge family={frozen.reason === 'closed' ? 'neutral' : 'info'} icon={<LockRounded />} label={frozenLabel ?? ''} title={frozenTitle} />}
        </>
      )}
      actions={(editable || canCopy) && (
        <>
          {editable && (
            <>
              {!isRow && r.status === 'draft' && <Button variant="contained" startIcon={busyAction === 'active' ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRounded />} disabled={!!busyAction} onClick={() => setStatus('active')}>Activate</Button>}
              {!isRow && r.status === 'obsolete' && <Button variant="contained" startIcon={<CheckCircleRounded />} disabled={!!busyAction} onClick={() => setStatus('active')}>Reactivate</Button>}
              {!isRow && r.status === 'active' && <Button variant="outlined" startIcon={<ArchiveRounded />} onClick={() => setConfirm('obsolete')}>Mark obsolete</Button>}
              {!isRow && r.status !== 'obsolete' && <Button variant="outlined" startIcon={<HistoryRounded />} onClick={() => setRevising(true)}>New revision</Button>}
            </>
          )}
          {canCopy && <Button variant="outlined" startIcon={<ContentCopyRounded />} onClick={() => setCopying(true)}>Make a similar one</Button>}
          {editable && (
            <>
              <Button startIcon={<EditRounded />} onClick={() => setTab('details')} sx={{ color: 'var(--c-text-2)' }}>Edit</Button>
              <Tooltip title="Delete — refused while anything uses it"><IconButton aria-label="Delete" onClick={() => setConfirm('delete')}><DeleteOutlineRounded /></IconButton></Tooltip>
            </>
          )}
        </>
      )}
      facts={(
        <>
          <Fact label="Short name"><Mono>{shortNameText(r.shortName)}</Mono></Fact>
          <Fact label="Revision"><Mono>{r.revision ?? '—'}</Mono></Fact>
          {r.item && <Fact label="Tracked by">{r.item.trackedBy} <Mono muted>· {r.item.uom}</Mono></Fact>}
          {r.item && r.item.itemType === 'catalog' && <Fact label="Comes from">{SOURCING_LABEL[r.item.sourcing]}</Fact>}
          {r.owner && <Fact label="Order"><Mono><Link to={to(`orders/${r.owner.orderId}`)}>{r.owner.orderCode}</Link></Mono> <Mono muted>· line {r.owner.lineNo}</Mono></Fact>}
          {r.placement && <Fact label="Sits in"><Mono><Link to={to(`items/${r.placement.parentId}`)}>{r.placement.parentCode ?? parentPlaceholder?.code ?? r.placement.parentName}</Link></Mono> <Mono muted>· ×{r.placement.quantity}{r.placement.role && r.placement.role.trim().toLowerCase() !== r.name.trim().toLowerCase() ? ` · ${r.placement.role}` : ''}</Mono></Fact>}
          {r.item?.itemType === 'catalog' && money.data && <ItemMoneyFacts prices={money.data.prices} cost={money.data.cost} />}
          {r.bom && <Fact label="BOM"><Mono>{r.bom.lineCount} line{r.bom.lineCount === 1 ? '' : 's'}</Mono>{r.bom.bomType !== 'custom' && <Mono muted> · {r.bom.status}{r.bom.revision ? ` · rev ${r.bom.revision}` : ''}</Mono>}</Fact>}
          {(r.defaultFlow || r.definitionFlow) && (
            <Fact label="Made by"><FlowTag flow={r.defaultFlow ? { ...r.defaultFlow, from: 'item' } : { ...r.definitionFlow!, from: 'template' }} /></Fact>
          )}
          {isSelection && <Fact label="Chooses from">{SELECTION_MODE[r.definition!.selectionMode ?? 'allowed_list']}</Fact>}
          {r.counts && r.definition?.definitionType === 'template' && <Fact label="Items created"><Mono>{r.counts.temporaryItems}</Mono></Fact>}
          <Fact label="Updated"><Mono muted>{new Date(r.updatedAt).toLocaleDateString()}</Mono></Fact>
        </>
      )}>
      <ErrorNotice error={actionError} sx={{ mt: 2, mb: 0 }} />
      {folderOffer && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
          <span>Rename the folder &lsquo;{folderOffer.oldName}&rsquo; too?{folderOffer.note && <> {folderOffer.note}</>}</span>
          <Button size="small" variant="outlined" disabled={folderBusy} onClick={renameFolder}>Rename</Button>
          <Button size="small" disabled={folderBusy} onClick={() => setFolderOffer(null)} sx={{ color: 'var(--c-text-2)' }}>Keep it</Button>
        </Box>
      )}
    </DetailHeader>
  );
  const crossLinks = (
    <>
      {(r.classificationPath ?? []).map((p) => (
        <CrossLink key={p.id} icon={<AccountTreeRounded />} label={`${p.level}: ${p.name}`} to={to('classification')} />
      ))}
      {r.owner && <CrossLink icon={<ReceiptLongRounded />} label={`Order ${r.owner.orderCode}`} to={to(`orders/${r.owner.orderId}`)} />}
      {r.placement && <CrossLink icon={<AccountTreeRounded />} label={`Part of ${r.placement.parentCode ?? r.placement.parentName}`} to={to(`items/${r.placement.parentId}`)} />}
      {r.sourceDefinition && <CrossLink icon={<CallSplitRounded />} label={`Created from ${r.sourceDefinition.code ?? r.sourceDefinition.name}`} to={to(`definitions/${r.sourceDefinition.id}`)} />}
      {r.definition?.candidateClassification && <CrossLink icon={<SearchRounded />} label={`Searches ${r.definition.candidateClassification.name}`} />}
      {r.recordKind === 'item' && <CrossLink icon={<WarehouseRounded />} label="Stock" onClick={() => setTab('stock')} />}
    </>
  );
  const tabs = [
    { value: 'specs', label: 'Specifications', count: specs.data?.specs.length },
    ...(isSelection ? [{ value: 'selection', label: 'Selection' }] : []),
    { value: 'bom', label: isSelection ? 'Where used' : 'BOM', count: isSelection ? undefined : r.bom?.lineCount },
    ...(r.recordKind === 'item' ? [{ value: 'stock', label: 'Stock' }] : []),
    { value: 'history', label: 'History' },
    { value: 'details', label: 'Details' },
  ];

  return (
    <DetailLayout header={header} crossLinks={crossLinks} tabs={tabs} active={tab} onTab={setTab}>
      {tab === 'specs' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
          <SectionCard
            title={isDefinition ? 'What its items will carry' : 'Specifications'}
            subtitle={isDefinition
              ? 'Rules reaching this definition from its classification, plus its own. Values here are defaults for the items it creates.'
              : 'Every rule that reaches this item and where each value comes from. Fixed and calculated values cannot be typed here.'}>
            <ErrorNotice error={specs.error} onRetry={specs.reload} />
            {specs.loading && !specs.data ? <SkeletonRows rows={5} /> : specs.data && (
              <SpecsTable resolution={specs.data}
                emptyHint={isDefinition ? 'Add the rules every item it creates must capture.' : 'Add rules on its classification under Setup, or on this item below.'}
                onSave={editable ? async (values) => {
                  await cfApi.put(`/records/${id}/values`, { values });
                  toast.success('Values saved.');
                  specs.reload();
                  setVersion((v) => v + 1);
                } : undefined} />
            )}
          </SectionCard>
          <SectionCard title={isDefinition ? 'Rules this definition adds' : 'Rules on this item only'}
            subtitle={isDefinition
              ? 'What every item created from it must capture, on top of its classification. These override the classification’s rules for the same specification.'
              : 'Rarely needed — rules usually belong on the classification so every similar item shares them.'}
            actions={rulesEditable && <Button startIcon={<AddRounded />} onClick={() => setRuleDialog({ open: true, rule: null })}>Add rule</Button>}>
            <ErrorNotice error={rules.error} onRetry={rules.reload} />
            {ruleCount === 0 ? (
              <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13 }}>
                {isDefinition
                  ? 'None yet — every rule its items carry comes from the classification above.'
                  : 'None — this item follows its classification, which is usually what you want.'}
              </Typography>
            ) : (
              <EntityList>
                {(rules.data ?? []).map((rule) => (
                  <EntityRow key={rule.id} primary={<>{rule.specName} <Mono muted>{rule.specCode}</Mono></>}
                    secondary={rule.isApplicable ? `${rule.isRequired ? 'Required · ' : ''}${rule.captureAt}${rule.optionValues.length ? ` · only ${rule.optionValues.join(', ')}` : ''}` : 'Switched off'}
                    trailing={rule.isApplicable ? <RuleBadge rule={rule.valueRule} /> : undefined}
                    actions={rulesEditable && (
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
      {tab === 'selection' && isSelection && <SelectionPanel record={r} canManage={editable} onChanged={rec.reload} />}
      {tab === 'bom' && <BomPanel key={id} source={{ kind: 'record', recordId: id }} ownsBom showWhereUsed onChanged={() => { rec.reload(); specs.reload(); }} />}
      {tab === 'stock' && r.recordKind === 'item' && <ItemStockPanel record={r} />}
      {tab === 'history' && <ValueHistory path={`/records/${id}/history`} version={version} subtitle="Every change to a value on this record — who, when, from what to what. Calculated changes appear too." />}
      {tab === 'details' && <DetailsForm key={r.updatedAt} record={r} tree={tree.data} canEdit={canManage} onTreeChanged={tree.reload}
        onSaved={(saved) => { rec.setData(saved); toast.success('Details saved.'); specs.reload(); }} />}

      <RevisionDialog open={revising} record={r} onClose={() => setRevising(false)} onDone={(saved) => { rec.setData(saved); toast.success(`Now at revision ${saved.revision}.`); }} />
      <CreateRecordDialog open={copying} copyFrom={r} recordKind={recordKind} tree={tree.data} onTreeChanged={tree.reload} screen={recordKind === 'item' ? 'items' : 'definitions'}
        onClose={() => setCopying(false)}
        onCreated={(made) => {
          invalidateNavCounts();
          toast.success(`${made.code ?? made.name} created${made.status === 'active' ? ' and activated' : ' as a draft'}.`);
          (made.warnings ?? []).forEach((w) => toast.error(w));
          navigate(to(`${listPath}/${made.id}`));
        }} />
      <ConfirmDialog open={confirm === 'obsolete'} title="Mark this obsolete?" entityName={`${r.code ?? '—'} · ${r.name}`} confirmLabel="Mark obsolete"
        body="It stays on existing documents but is no longer offered for new use. It can be reactivated later."
        onClose={() => setConfirm(null)} onConfirm={() => setStatus('obsolete', true)} />
      <ConfirmDialog open={confirm === 'delete'} title={`Delete this ${isDefinition ? 'definition' : 'item'}?`} entityName={`${r.code ?? '—'} · ${r.name}`} danger confirmLabel="Delete"
        body="Its values and rules go with it. Refused while anything uses it — e.g. an allowed list, or items created from a definition."
        onClose={() => setConfirm(null)}
        onConfirm={async () => { await cfApi.del(`/records/${id}`); invalidateNavCounts(); toast.success('Deleted.'); navigate(to(listPath)); }} />
      <RuleDialog open={ruleDialog.open} existing={ruleDialog.rule} onClose={() => setRuleDialog({ open: false, rule: null })}
        onSaved={() => { toast.success('Rule saved.'); refreshAll(); }} subjectType="master" subjectId={id} subjectLabel={`${r.code ?? r.name}`} />
      <ConfirmDialog open={!!deleteRule} title="Delete this rule?" danger confirmLabel="Delete rule" entityName={deleteRule ? `${deleteRule.specCode} · ${deleteRule.specName}` : undefined}
        body="It falls back to whatever the classification says." onClose={() => setDeleteRule(null)}
        onConfirm={async () => { await cfApi.del(`/rules/${deleteRule?.id}`); toast.success('Rule deleted.'); refreshAll(); }} />
    </DetailLayout>
  );
}
