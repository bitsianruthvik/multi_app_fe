import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, FormControlLabel, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { CfApiError } from '../api/client';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate, type TermTemplate, type Terms } from '../api/acceptance';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { triggerWords } from '../lib/acceptance';
import { rupeeText } from '../lib/money';
import { Badge, EmptyState, ErrorNotice, ListSkeleton, PageHeader, SectionCard } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DialogHeader } from '../components/FormDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ChargesGrid, MilestonesGrid, StagesGrid, type TermLists } from '../components/Acceptance/TermGrids';
import { useToast } from '../components/toastContext';

type Kind = TermTemplate['kind'];
const KINDS: [Kind, string, string][] = [
  ['charges', 'Charges', 'Rows per operation, the material rate and lump sums. A template may leave the operation and the rate for the order.'],
  ['milestones', 'Payment milestones', 'When each part of the order value is billed, and the credit days.'],
  ['stages', 'Post-production stages', 'What happens after dispatch, in order (inspection, erection, load test, handover).'],
];
const asTerms = (rows: Partial<Terms>): Terms => ({ charges: rows.charges ?? [], material: rows.material ?? null, lumpSums: rows.lumpSums ?? [], milestones: rows.milestones ?? [], stages: rows.stages ?? [] });
const rowsOf = (kind: Kind, t: Terms): Partial<Terms> => (kind === 'charges'
  ? { charges: t.charges, material: t.material?.rate != null ? t.material : null, lumpSums: t.lumpSums }
  : kind === 'milestones' ? { milestones: t.milestones } : { stages: t.stages.filter((s) => s.name.trim()) });

/** What a template holds, in one or two lines. */
function summary(t: TermTemplate, lists: TermLists | null): string {
  const r = t.rows;
  if (t.kind === 'charges') {
    const parts = (r.charges ?? []).map((c) => `${c.label || '—'}${c.rate != null ? ` ${rupeeText(c.rate)}/${c.basis?.type === 'formula' ? c.basis.unit : 't'}` : ''}`);
    if (r.material?.rate != null) parts.push(`material ${rupeeText(r.material.rate)}/t`);
    for (const l of r.lumpSums ?? []) parts.push(`${l.label} ${rupeeText(l.amount ?? 0)}`);
    return parts.join(' · ');
  }
  if (t.kind === 'milestones') {
    const op = (id: number) => lists?.operations.find((o) => o.id === id)?.name ?? null;
    return (r.milestones ?? []).map((m) => `${m.kind === 'percent' ? `${m.value} %` : rupeeText(m.value ?? 0)} ${triggerWords(m.trigger, { operation: op }).toLowerCase()}`).join(' · ');
  }
  return (r.stages ?? []).map((s, i) => `${i + 1}. ${s.name}`).join(' · ');
}

/**
 * SETUP › TEMPLATES (§73): the rows a Customer acceptance starts from — charges, payment milestones, post-production
 * stages. One DEFAULT per kind prefills every new acceptance; any other can be picked on the step ("Fill from template").
 */
export default function TermTemplates() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const [kindParam, setKind] = useUrlParam('kind', 'charges');
  const kind = (KINDS.some(([k]) => k === kindParam) ? kindParam : 'charges') as Kind;
  const [rows, setRows] = useState<TermTemplate[] | null>(null);
  const [lists, setLists] = useState<TermLists | null>(null);
  const [starter, setStarter] = useState<Record<Kind, Partial<Terms>> | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; name: string; isDefault: boolean; terms: Terms } | null>(null);
  const [deleting, setDeleting] = useState<TermTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<CfApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    listTemplates(undefined, true).then((r) => { setRows(r.rows); setLists(r.lists ?? null); setStarter(r.starter); }).catch((e) => setError(e as CfApiError));
  }, []);
  useEffect(() => { load(); }, [load]);
  const mine = (rows ?? []).filter((t) => t.kind === kind);
  const save = async () => {
    if (!editing) return;
    setBusy(true); setSaveError(null);
    try {
      const body = { name: editing.name.trim(), isDefault: editing.isDefault, rows: rowsOf(kind, editing.terms) };
      if (editing.id) await updateTemplate(editing.id, body); else await createTemplate({ kind, ...body });
      toast.success('Template saved.');
      setEditing(null);
      load();
    } catch (e) { setSaveError(e as CfApiError); } finally { setBusy(false); }
  };
  const makeDefault = async (t: TermTemplate) => {
    try { await updateTemplate(t.id, { isDefault: true }); toast.success(`"${t.name}" is the default now.`); load(); } catch (e) { setError(e as CfApiError); }
  };
  const meta = KINDS.find(([k]) => k === kind)!;
  const upTerms = (patch: Partial<Terms>) => setEditing((x) => (x ? { ...x, terms: { ...x.terms, ...patch } } : x));
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <PageHeader title="Templates" subtitle="What a customer acceptance starts from. The default of each kind fills every new one."
        actions={canManage && starter && <Button variant="contained" startIcon={<AddRounded />} onClick={() => { setSaveError(null); setEditing({ id: null, name: '', isDefault: !mine.length, terms: asTerms(starter[kind]) }); }} data-testid="tpl-new">New template</Button>} />
      <FilterBar>
        {KINDS.map(([k, label]) => <FacetChip key={k} label={label} active={kind === k} onClick={() => setKind(k)} count={(rows ?? []).filter((t) => t.kind === k).length} />)}
      </FilterBar>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{meta[2]}</Typography>
      <ErrorNotice error={error} onRetry={load} />
      {!rows && !error && <ListSkeleton rows={3} />}
      {rows && !mine.length && <EmptyState icon={<ReceiptLongRounded />} title={`No ${meta[1].toLowerCase()} template yet.`} hint="A new acceptance starts from a short starter until there is one." />}
      <Box data-testid="tpl-list" sx={{ display: 'grid', gap: 1.25 }}>
        {mine.map((t) => (
          <SectionCard key={t.id} title={t.name} subtitle={summary(t, lists)}
            actions={(
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {t.isDefault && <Badge family="success" noIcon label="Default" />}
                {canManage && !t.isDefault && <Button size="small" onClick={() => void makeDefault(t)}>Make default</Button>}
                {canManage && <Button size="small" onClick={() => { setSaveError(null); setEditing({ id: t.id, name: t.name, isDefault: t.isDefault, terms: asTerms(t.rows) }); }} data-testid="tpl-edit">Edit</Button>}
                {canManage && <Button size="small" color="error" onClick={() => setDeleting(t)}>Delete</Button>}
              </Box>
            )}>
            <span />
          </SectionCard>
        ))}
      </Box>
      <Dialog open={!!editing} onClose={() => !busy && setEditing(null)} maxWidth="lg" fullWidth>
        <DialogHeader title={editing?.id ? 'Edit template' : `New ${meta[1].toLowerCase()} template`} onClose={() => setEditing(null)} busy={busy} />
        <DialogContent>
          <ErrorNotice error={saveError} />
          {editing && lists && (
            <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField size="small" label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} sx={{ minWidth: 280 }} inputProps={{ 'data-testid': 'tpl-edit-name' }} />
                <FormControlLabel control={<Checkbox checked={editing.isDefault} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} />} label="Default — fills every new acceptance" />
              </Box>
              {kind === 'charges' && <ChargesGrid terms={editing.terms} onChange={upTerms} lists={lists} editable />}
              {kind === 'milestones' && <MilestonesGrid terms={editing.terms} onChange={upTerms} lists={lists} editable />}
              {kind === 'stages' && <StagesGrid terms={editing.terms} onChange={upTerms} editable linkMilestones={false} />}
              {kind === 'milestones' && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>A milestone on a post-production stage names the stage by its key (s1, s2 …) in the stages template.</Typography>}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !editing?.name.trim()} onClick={() => void save()} data-testid="tpl-save">Save</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={!!deleting} danger title="Delete this template?" confirmLabel="Delete" entityName={deleting?.name ?? ''}
        body="Acceptances already made from it keep their own rows." onClose={() => setDeleting(null)}
        onConfirm={async () => { if (deleting) { await deleteTemplate(deleting.id); toast.success('Template deleted.'); setDeleting(null); load(); } }} />
    </Box>
  );
}
