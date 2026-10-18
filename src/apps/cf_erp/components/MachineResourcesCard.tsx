import { useEffect, useRef, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import { CfApiError } from '../api/client';
import { getMachineResources, saveMachineResources, searchResourceItems, type MachineResource, type ResourceItem, type ResourceKind } from '../api/toolsResources';
import { blankDraft, defaultKind, draftProblems, draftsFromServer, isDirty, KINDS, KIND_LABEL, lifeText, toPayload, type ResourceDraft } from '../lib/toolsResources';
import { ServerPicker } from './ServerPicker';
import { ErrorNotice, Mono, SectionCard, SkeletonRows } from './ui';
import { useToast } from './toastContext';
import { useLoad } from '../hooks/useLoad';

/**
 * A machine's resource list (§81): the tools, spares and consumables it needs, with a typical quantity.
 * Compact and keyboard first — Enter in the last field starts the next line, Ctrl+Enter saves the whole list in one trip.
 * Maintenance orders prefill their material requests from it.
 */
export function MachineResourcesCard({ machineId, canManage }: { machineId: number; canManage: boolean }) {
  const toast = useToast();
  const saved = useLoad<MachineResource[]>(() => getMachineResources(machineId), [machineId]);
  const [rows, setRows] = useState<ResourceDraft[]>([]);
  const [wholeCatalog, setWholeCatalog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CfApiError | null>(null);
  const focusKey = useRef<string | null>(null);

  useEffect(() => {
    if (!saved.data) return;
    const next = draftsFromServer(saved.data);
    if (canManage) next.push(blankDraft());
    setRows(next);
  }, [saved.data, canManage]);

  const patch = (key: string, p: Partial<ResourceDraft>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const addLine = () => { const d = blankDraft(); focusKey.current = d.key; setRows((all) => [...all, d]); };
  const problems = draftProblems(rows);
  const dirty = !!saved.data && isDirty(rows, saved.data);
  const lastKey = rows[rows.length - 1]?.key;

  const save = async () => {
    if (!dirty || problems.length || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const out = await saveMachineResources(machineId, toPayload(rows));
      saved.setData(out);
      toast.success('Resource list saved.');
    } catch (e) {
      setFailure(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    } finally { setBusy(false); }
  };
  const onKeyDown = (e: React.KeyboardEvent, key: string) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save(); return; }
    // Enter in the last field of the last line starts the next one, once this line names an item.
    if (e.key === 'Enter' && key === lastKey && rows[rows.length - 1]?.item) { e.preventDefault(); addLine(); }
  };

  const list = saved.data ?? [];
  const count = list.length;
  const byKind = KINDS.map((k) => {
    const n = list.filter((r) => r.kind === k).length;
    return `${n} ${KIND_LABEL[k].toLowerCase()}${n === 1 ? '' : 's'}`;
  }).join(' · ');

  return (
    <SectionCard title="Tools, spares and consumables"
      subtitle={count ? byKind : 'What this machine needs to keep running. Maintenance orders start their material requests from this list.'}
      actions={canManage && (
        <>
          <FormControlLabel sx={{ m: 0 }} label={<Typography sx={{ fontSize: 12.5 }}>Search the whole catalog</Typography>}
            control={<Checkbox size="small" checked={wholeCatalog} onChange={(e) => setWholeCatalog(e.target.checked)} />} />
          <Button variant="contained" size="small" disabled={!dirty || problems.length > 0 || busy} onClick={() => void save()} data-testid="resources-save">Save list</Button>
        </>
      )}>
      <ErrorNotice error={saved.error} onRetry={saved.reload} />
      {failure && <ErrorNotice error={failure} onRetry={() => void save()} />}
      {saved.loading && !saved.data ? <SkeletonRows rows={3} /> : (
        <Box sx={{ display: 'grid', gap: 0.75 }} data-testid="machine-resources">
          {rows.length === 0 && <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>Nothing listed yet.</Typography>}
          {rows.map((r, i) => (
            <Box key={r.key} data-testid="resource-row"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '120px minmax(220px, 1fr) 84px 44px minmax(120px, 0.6fr) 36px' }, gap: 1, alignItems: 'center' }}>
              <TextField select size="small" value={r.kind} disabled={!canManage} onChange={(e) => patch(r.key, { kind: e.target.value as ResourceKind })}
                slotProps={{ htmlInput: { 'aria-label': `Kind, row ${i + 1}` } }}>
                {KINDS.map((k) => <MenuItem key={k} value={k}>{KIND_LABEL[k]}</MenuItem>)}
              </TextField>
              {canManage ? (
                <ServerPicker<ResourceItem> value={r.item} noun="tool, spare or consumable" placeholder="Item code or name" autoFocus={focusKey.current === r.key}
                  search={(t) => searchResourceItems(t, { all: wholeCatalog })}
                  onChange={(item) => patch(r.key, { item, kind: item && !r.id ? defaultKind(item) : r.kind })}
                  getId={(x) => x.id} getLabel={(x) => `${x.code} · ${x.name}`}
                  renderOption={(x) => (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
                      <Mono sx={{ minWidth: 110 }}>{x.code}</Mono>
                      <Typography sx={{ fontSize: 14 }} noWrap>{x.name}</Typography>
                      {x.kind && <Mono muted>{KIND_LABEL[x.kind]}</Mono>}
                    </Box>
                  )} />
              ) : <Box sx={{ fontSize: 14 }}><Mono>{r.item?.code}</Mono> {r.item?.name}</Box>}
              <TextField size="small" value={r.qty} disabled={!canManage || !r.item} onChange={(e) => patch(r.key, { qty: e.target.value })}
                onKeyDown={(e) => onKeyDown(e, r.key)} error={!!r.item && !(Number(r.qty) > 0)}
                slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': `Quantity, row ${i + 1}`, style: { textAlign: 'right' } } }} />
              <Mono muted>{r.item?.uom ?? ''}</Mono>
              <TextField size="small" placeholder="Note" value={r.notes} disabled={!canManage || !r.item} onChange={(e) => patch(r.key, { notes: e.target.value })}
                onKeyDown={(e) => onKeyDown(e, r.key)} slotProps={{ htmlInput: { 'aria-label': `Note, row ${i + 1}` } }} />
              {canManage ? (
                <Tooltip title={r.item?.lifeUnit ? `Life: ${lifeText(r.item.lifeUnit, r.item.lifeLimit)}. Remove` : 'Remove'}>
                  <span><IconButton size="small" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((all) => (all.length > 1 ? all.filter((x) => x.key !== r.key) : [blankDraft()]))}><DeleteOutlineRounded fontSize="small" /></IconButton></span>
                </Tooltip>
              ) : <span />}
            </Box>
          ))}
          {canManage && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Button size="small" startIcon={<AddRounded />} onClick={addLine}>Add a line</Button>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Enter in the last field adds a line · Ctrl+Enter saves</Typography>
            </Box>
          )}
          {problems.length > 0 && <Box sx={{ color: 'var(--c-danger, #b3261e)', fontSize: 12.5 }} data-testid="resource-problems">{problems.join(' ')}</Box>}
        </Box>
      )}
    </SectionCard>
  );
}
