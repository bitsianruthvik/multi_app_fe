import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import { cfApi, LONG_WRITE_MS } from '../api/client';
import type { MasterRecord, SalesOrder, SalesOrderLine } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { recordPath } from '../lib/paths';
import { LOCKED_STATUSES } from '../lib/orders';
import { Badge, EmptyState, KindChip, Mono, SectionCard, StatusBadge, WarnBadge } from './ui';
import { DataTable, type DataColumn } from './DataTable';
import { FormDialog } from './FormDialog';
import { RecordPicker } from './RecordPicker';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** A new line: a catalog item (standard) or a template definition (custom — its structure is created at once). */
function AddLineDialog({ order, open, onClose, onDone }: { order: SalesOrder; open: boolean; onClose: () => void; onDone: (o: SalesOrder) => void }) {
  const [rec, setRec] = useState<MasterRecord | null>(null);
  const [form, setForm] = useState({ quantity: '1', committedDate: '', description: '' });
  useEffect(() => { if (open) { setRec(null); setForm({ quantity: '1', committedDate: '', description: '' }); } }, [open]);
  const stock = order.orderType === 'stock';
  // A template line copies its whole Template BOM beneath it — long on production, so wait for it.
  const save = async () => onDone(await cfApi.post<SalesOrder>(`/orders/${order.id}/lines`, { recordId: rec?.id ?? null, quantity: form.quantity, committedDate: form.committedDate || null, description: form.description || null }, { timeoutMs: LONG_WRITE_MS }));
  const hint = rec?.kind === 'template'
    ? `Creates the temporary item this line sells from ${rec.code ?? rec.name}, with its whole Template BOM copied beneath it — as drafts.`
    : rec?.kind === 'catalog' ? 'A standard line: the catalog item as it is, with its Standard BOM if it has one.'
      : stock ? 'Stock orders make catalog items only.' : 'A catalog item for a standard line, or a template definition for a custom one.';
  return (
    <FormDialog open={open} title={<>Add a line to <Mono sx={{ fontSize: 'inherit' }}>{order.code}</Mono></>} onClose={onClose} onSubmit={save}
      submitLabel="Add line" busyLabel="Adding…" submitDisabled={!rec}>
      <RecordPicker kinds={stock ? ['catalog'] : ['catalog', 'template']} value={rec} onChange={setRec} activeOnly label="What it sells" autoFocus helperText={hint} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '140px minmax(0, 1fr)' }, gap: 2 }}>
        <TextField label="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={rec?.kind === 'template' ? 'Identical copies' : undefined} />
        <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Empty = the order's date" />
      </Box>
      <TextField label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="The customer's wording" />
    </FormDialog>
  );
}

/** Changes a line's quantity, date and wording. What it sells cannot change — remove it and add another. */
function EditOrderLineDialog({ line, onClose, onDone }: { line: SalesOrderLine | null; onClose: () => void; onDone: (o: SalesOrder) => void }) {
  const [form, setForm] = useState({ quantity: '', committedDate: '', description: '' });
  useEffect(() => { if (line) setForm({ quantity: String(line.quantity), committedDate: line.committedDate ?? '', description: line.description ?? '' }); }, [line]);
  const save = async () => onDone(await cfApi.put<SalesOrder>(`/order-lines/${line?.id}`, { quantity: form.quantity, committedDate: form.committedDate || null, description: form.description || null }));
  return (
    <FormDialog open={!!line} title={`Change line ${line?.lineNo ?? ''}`} onClose={onClose} onSubmit={save} maxWidth="xs"
      subtitle="What it sells cannot change — remove the line and add another.">
      <TextField label="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} autoFocus inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
      <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} />
      <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
    </FormDialog>
  );
}

/** What is under a line, in a phrase: a custom structure's counts, or the Standard BOM it uses. */
function structureText(l: SalesOrderLine) {
  if (l.lineType === 'custom' && l.structure) {
    const s = l.structure;
    return (
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13 }}>{s.temporaryItems} item{s.temporaryItems === 1 ? '' : 's'}</Typography>
        {s.drafts > 0 && <WarnBadge label={`${s.drafts} draft`} title="Release will need every temporary item active." />}
        {s.unresolvedSelections > 0 && <WarnBadge label={`${s.unresolvedSelections} to choose`} title="Selections still without a catalog item." />}
      </Box>
    );
  }
  if (l.bom) return <Typography sx={{ fontSize: 13 }}>Standard BOM <Mono>rev {l.bomRevision ?? '—'}</Mono>{l.bom.currentRevision !== l.bomRevision && <Mono muted> (now {l.bom.currentRevision ?? '—'})</Mono>}</Typography>;
  return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No BOM — bought or traded</Typography>;
}

/**
 * The order's lines, with everything that changes them: add, change, remove,
 * and the way into a line's structure.
 *
 * One panel, two homes — the order's Lines stage and, on an order with no
 * process, its plain Lines tab. Keeping it in one place is the point: a stage
 * that offered less than the tab it replaced is the exact failure this screen
 * was built to avoid.
 */
export function OrderLinesPanel({ order, onSaved, onOpenStructure, onRelease, onRowClick, subtitle, title = 'Lines' }: {
  order: SalesOrder;
  /** The saved order that came back from adding, changing or removing a line. */
  onSaved: (o: SalesOrder) => void;
  onOpenStructure: (line: SalesOrderLine) => void;
  /** Given when this screen may release a line; the button still obeys permission and status. */
  onRelease?: (line: SalesOrderLine) => void;
  /** Clicking a row. The Lines stage uses it to switch the line being worked on. */
  onRowClick?: (line: SalesOrderLine) => void;
  subtitle?: ReactNode;
  title?: string;
}) {
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SalesOrderLine | null>(null);
  const [removing, setRemoving] = useState<SalesOrderLine | null>(null);

  const lines = order.lines ?? [];
  const locked = LOCKED_STATUSES.includes(order.status);
  const editable = isPermitted('cf_erp_orders_manage') && !locked;
  const canProduce = isPermitted('cf_erp_production_manage');
  const to = (path: string) => appPath(company, path);

  const columns: DataColumn<SalesOrderLine>[] = [
    { key: 'no', header: 'Line', alwaysVisible: true, render: (l) => <Mono muted>{l.lineNo}</Mono> },
    {
      key: 'sells', header: 'Sells', alwaysVisible: true,
      render: (l) => (
        <Box sx={{ py: 0.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {l.item ? <Mono><Box component={Link} to={to(recordPath(l.item.kind, l.item.id))} sx={linkSx}>{l.item.code ?? '—'}</Box></Mono> : <Mono muted>—</Mono>}
            {l.item && <KindChip kind={l.item.kind} />}
            {l.item && l.item.status !== 'active' && <StatusBadge status={l.item.status} />}
          </Box>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>
            {l.item?.name}{l.lineType === 'custom' ? ` · from ${l.design.code ?? l.design.name}` : ''}{l.description ? ` · “${l.description}”` : ''}
          </Typography>
        </Box>
      ),
    },
    { key: 'qty', header: 'Qty', numeric: true, alwaysVisible: true, render: (l) => <><Mono>{l.quantity}</Mono>{l.item?.uom && <Mono muted> {l.item.uom}</Mono>}</> },
    { key: 'committed', header: 'Committed', alwaysVisible: true, render: (l) => <Mono muted={!l.committedDate}>{l.committedDate ?? order.committedDate ?? '—'}</Mono> },
    { key: 'structure', header: 'Structure', alwaysVisible: true, render: (l) => structureText(l) },
    ...(order.status === 'confirmed' || lines.some((l) => l.release) ? [{
      key: 'production', header: 'Production', alwaysVisible: true,
      render: (l: SalesOrderLine) => (l.release ? <Badge family="info" label="Released" title={`Released ${new Date(l.release.releasedAt).toLocaleDateString()}`} /> : <Badge family="neutral" noIcon label="Not released" />),
    }] : []),
  ];

  return (
    <>
      <SectionCard flush title={title}
        subtitle={subtitle ?? 'Each line sells an item: a catalog item as it is, or a temporary item made for this order from a template.'}
        actions={editable && <Button startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add line</Button>}>
        <DataTable bare rows={lines} columns={columns} getRowId={(l) => l.id} onRowClick={onRowClick}
          empty={<EmptyState title="No lines yet" hint={order.orderType === 'stock' ? 'Add the catalog items to make for stock.' : 'Add a catalog item, or a template definition — its whole structure is created on the spot.'}
            action={editable && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add line</Button>} />}
          rowActions={(l) => (
            <>
              <Tooltip title="Open its structure"><IconButton size="small" aria-label={`Structure of line ${l.lineNo}`} onClick={() => onOpenStructure(l)}><AccountTreeRounded fontSize="small" /></IconButton></Tooltip>
              {onRelease && canProduce && order.status === 'confirmed' && !l.release && <Button size="small" variant="outlined" startIcon={<RocketLaunchRounded />} onClick={() => onRelease(l)}>Release</Button>}
              {editable && !l.release && <Tooltip title="Change"><IconButton size="small" aria-label={`Change line ${l.lineNo}`} onClick={() => setEditing(l)}><EditRounded fontSize="small" /></IconButton></Tooltip>}
              {editable && !l.release && <Tooltip title="Remove"><IconButton size="small" aria-label={`Remove line ${l.lineNo}`} onClick={() => setRemoving(l)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>}
            </>
          )} />
      </SectionCard>

      <AddLineDialog order={order} open={adding} onClose={() => setAdding(false)} onDone={(saved) => { onSaved(saved); toast.success('Line added.'); }} />
      <EditOrderLineDialog line={editing} onClose={() => setEditing(null)} onDone={(saved) => { onSaved(saved); toast.success('Line saved.'); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove line" title="Remove this line?"
        entityName={removing ? `${order.code} · line ${removing.lineNo} · ${removing.item?.code ?? removing.item?.name ?? ''}` : undefined}
        body={removing?.lineType === 'custom'
          ? `${removing.item?.code ?? 'Its temporary item'} and everything below it exist only for this order, so they are deleted with the line. Their codes are not given out again.`
          : 'The line goes; the catalog item stays.'}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { onSaved(await cfApi.del<SalesOrder>(`/order-lines/${removing?.id}`)); toast.success('Line removed.'); }} />
    </>
  );
}
