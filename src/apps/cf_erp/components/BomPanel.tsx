import { useState } from 'react';
import { Box, Button, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import TouchAppRounded from '@mui/icons-material/TouchAppRounded';
import { cfApi, CfApiError } from '../api/client';
import type { BomLine, BomView, WhereUsedRow } from '../api/types';
import { recordPath } from '../lib/paths';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, Fact, KindChip, Mono, SectionCard, SkeletonRows, StatusBadge, WarnBadge } from './ui';
import { AddChildDialog, EditLineDialog } from './BomDialogs';
import { ChooseItemDialog } from './ChooseItemDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { FlowTag } from './FlowTag';
import { useToast } from './toastContext';

const TYPE_TEXT = {
  standard: { title: 'Standard BOM', body: 'What this catalog item is made of, every time. Catalog items only.' },
  template: { title: 'Template BOM', body: 'The usual structure of this blueprint. An order copies it — each template line becomes a temporary item there, and can then be changed freely.' },
  custom: { title: 'Custom BOM', body: 'This order’s own structure. Adding a template creates a new temporary item here.' },
} as const;

function childCell(company: string, l: BomLine) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mono><Link to={appPath(company, recordPath(l.child.kind, l.child.id))}>{l.child.code ?? '—'}</Link></Mono>
        <KindChip kind={l.child.kind} />
        {!l.resolved && l.selection && <WarnBadge label="Item not chosen" title="Choose a catalog item for this selection before release." />}
      </Box>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
        {l.child.name}{l.selection && l.resolved ? ` · chosen for ${l.selection.code ?? l.selection.name}` : ''}
      </Typography>
    </Box>
  );
}

/**
 * The BOM tab of an item or definition (DESIGN_SYSTEM.md §4.3): its immediate
 * children, what it may hold, its status and revision, and where it is used.
 * A Custom BOM is edited here too, but the order's Structure tab shows it whole.
 */
export function BomPanel({ recordId, recordLabel, onChanged }: { recordId: number; recordLabel: string; onChanged?: () => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const bom = useLoad(() => cfApi.get<BomView>(`/records/${recordId}/bom`), [recordId]);
  const used = useLoad(() => cfApi.get<WhereUsedRow[]>(`/records/${recordId}/where-used`), [recordId]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BomLine | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<BomLine | null>(null);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const refresh = () => { bom.reload(); used.reload(); onChanged?.(); };

  const act = async (path: string, body: unknown, done: string) => {
    setActionError(null);
    try { bom.setData(await cfApi.post<BomView>(`/records/${recordId}/bom/${path}`, body)); toast.success(done); onChanged?.(); } catch (e) { setActionError(e as CfApiError); }
  };

  if (bom.error) return <ErrorNotice error={bom.error} onRetry={bom.reload} />;
  const b = bom.data;
  if (!b) return <SkeletonRows rows={4} />;

  const usedCard = (
    <SectionCard title="Where it is used" subtitle="BOMs that hold it — directly, or as the item chosen for a selection.">
      <ErrorNotice error={used.error} onRetry={used.reload} />
      {(used.data ?? []).length === 0 ? <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>Not used in any BOM.</Typography> : (
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          {(used.data ?? []).map((u) => (
            <Box key={u.lineId} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', p: 0.75, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' } }}>
              <Mono><Link to={appPath(company, recordPath(u.parent.kind, u.parent.id))}>{u.parent.code ?? '—'}</Link></Mono>
              <Typography sx={{ flex: 1, fontSize: 13, minWidth: 140 }}>{u.parent.name}</Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{TYPE_TEXT[u.bomType].title}{u.via === 'selection' ? ' · via selection' : ''}</Typography>
              {u.order && <Mono muted><Link to={appPath(company, `orders/${u.order.id}`)}>{u.order.code}</Link></Mono>}
              <Mono>×{u.quantity}</Mono>
            </Box>
          ))}
        </Box>
      )}
    </SectionCard>
  );

  if (!b.canHaveBom) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <SectionCard title="No BOM"><Typography sx={{ color: 'var(--c-text-2)' }}>A selection definition chooses an existing catalog item, so it has no BOM of its own.</Typography></SectionCard>
        {usedCard}
      </Box>
    );
  }
  const type = TYPE_TEXT[b.bomType!];
  const custom = b.bomType === 'custom';
  const locked = b.parent.status === 'obsolete' || (b.order && (['closed', 'lost', 'cancelled'].includes(b.order.status) || b.order.released));

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <ErrorNotice error={actionError} />
      <SectionCard title={type.title} subtitle={type.body}
        actions={!locked && <Button startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add line</Button>}>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', mb: b.lines.length ? 2 : 0 }}>
          {b.bom && !custom && <Fact label="Status"><StatusBadge status={b.bom.status} /></Fact>}
          {b.bom && !custom && <Fact label="Revision"><Mono>{b.bom.revision ?? '—'}</Mono></Fact>}
          <Fact label="Lines"><Mono>{b.lines.length}</Mono></Fact>
          {b.unresolvedSelections > 0 && <Fact label="To choose"><WarnBadge label={`${b.unresolvedSelections} selection${b.unresolvedSelections > 1 ? 's' : ''}`} /></Fact>}
          {b.order && <Fact label="Order"><Mono><Link to={appPath(company, `orders/${b.order.id}`)}>{b.order.code}</Link></Mono></Fact>}
          <Box sx={{ flex: 1 }} />
          {b.bom && !custom && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {b.bom.status === 'draft' && <Button variant="contained" size="small" startIcon={<CheckCircleRounded />} onClick={() => act('status', { status: 'active' }, 'BOM activated.')}>Activate BOM</Button>}
              {b.bom.status === 'active' && <Button size="small" startIcon={<ArchiveRounded />} onClick={() => act('status', { status: 'obsolete' }, 'BOM marked obsolete.')}>Mark obsolete</Button>}
              {b.bom.status === 'obsolete' && <Button size="small" startIcon={<CheckCircleRounded />} onClick={() => act('status', { status: 'active' }, 'BOM reactivated.')}>Reactivate</Button>}
              {b.bom.status !== 'obsolete' && <Button size="small" startIcon={<HistoryRounded />} onClick={() => act('revision', {}, 'Revision moved on.')}>New revision</Button>}
            </Box>
          )}
        </Box>
        {b.lines.length === 0 ? (
          <EmptyState title="No lines yet" body={custom ? 'Add catalog items, templates (each becomes a temporary item) or selections.' : `Add the first ${b.bomType === 'standard' ? 'catalog item' : 'item or definition'} it is made of.`}
            action={!locked && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add line</Button>} />
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell scope="col">Line</TableCell>
                  <TableCell scope="col">Holds</TableCell>
                  <TableCell scope="col">Role</TableCell>
                  <TableCell scope="col" align="right">Qty per parent</TableCell>
                  <TableCell scope="col">Made by</TableCell>
                  <TableCell scope="col">Status</TableCell>
                  <TableCell scope="col" align="right" aria-label="Actions" />
                </TableRow>
              </TableHead>
              <TableBody>
                {b.lines.map((l) => (
                  <TableRow key={l.id} hover>
                    <TableCell><Mono muted>{l.lineNo}</Mono></TableCell>
                    <TableCell>{childCell(company, l)}</TableCell>
                    <TableCell>{l.role ?? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>}</TableCell>
                    <TableCell align="right"><Mono>{l.quantity}</Mono>{l.child.uom && <Mono muted> {l.child.uom}</Mono>}</TableCell>
                    <TableCell>{l.effectiveFlow ? <FlowTag flow={l.effectiveFlow} /> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>}</TableCell>
                    <TableCell><StatusBadge status={l.child.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {!locked && l.selection && (
                        <Tooltip title="Choose the catalog item"><IconButton size="small" aria-label={`Choose the item for line ${l.lineNo}`} onClick={() => setChoosing(l.id)}><TouchAppRounded fontSize="small" /></IconButton></Tooltip>
                      )}
                      {!locked && <IconButton size="small" aria-label={`Change line ${l.lineNo}`} onClick={() => setEditing(l)}><EditRounded fontSize="small" /></IconButton>}
                      {!locked && <IconButton size="small" aria-label={`Remove line ${l.lineNo}`} onClick={() => setRemoving(l)}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </SectionCard>
      {usedCard}

      <AddChildDialog open={adding} parentId={recordId} parentLabel={recordLabel} allowedKinds={b.allowedChildKinds} custom={custom}
        onClose={() => setAdding(false)} onDone={() => { toast.success('Line added.'); refresh(); }} />
      <EditLineDialog open={!!editing} lineId={editing?.id ?? null} label={editing ? `line ${editing.lineNo}` : ''} quantity={editing?.quantity ?? 1} role={editing?.role ?? null}
        flowId={editing?.flow?.id ?? null} canHaveFlow={!!editing && !editing.selection && editing.child.kind !== 'selection'}
        onClose={() => setEditing(null)} onDone={() => { toast.success('Line saved.'); refresh(); }} />
      <ChooseItemDialog open={choosing != null} lineId={choosing} onClose={() => setChoosing(null)} onDone={() => { toast.success('Item chosen.'); refresh(); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove line" title={`Remove line ${removing?.lineNo}?`}
        body={removing?.child.kind === 'temporary'
          ? `${removing.child.code ?? removing.child.name} exists only for this place, so it is deleted with everything below it. Its code is not given out again.`
          : 'The line goes; the item itself stays in the catalog.'}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { await cfApi.del(`/bom-lines/${removing?.id}`); toast.success('Line removed.'); refresh(); }} />
    </Box>
  );
}
