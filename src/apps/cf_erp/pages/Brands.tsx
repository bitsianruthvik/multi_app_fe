import { useEffect, useState } from 'react';
import { Autocomplete, Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import CallMergeRounded from '@mui/icons-material/CallMergeRounded';
import LocalOfferRounded from '@mui/icons-material/LocalOfferRounded';
import { CfApiError } from '../api/client';
import { addBrand, listBrands, mergeBrand, renameBrand } from '../api/brands';
import type { Brand } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { EmptyState, ErrorNotice, Mono, PageHeader } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FormDialog } from '../components/FormDialog';
import { useToast } from '../components/toastContext';

/**
 * Setup › Brands (§117, user 2026-11-22): the company's ONE brand list, across every family — paints, bolts, spares alike.
 * Every new lot received from a supplier picks its brand from here (GRN), and a name not on it can be added there; this page
 * shows how many items and lots carry each brand, and puts right a duplicate (rename, or merge it into the right one —
 * its lots move with it). "Unbranded" is always first and is not renamed or merged away.
 */
function NameDialog({ open, existing, onClose, onSaved }: { open: boolean; existing: Brand | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [similar, setSimilar] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(existing?.name ?? ''); setSimilar(null); } }, [open, existing]);
  return (
    <FormDialog open={open} title={existing ? `Rename ${existing.name}` : 'New brand'} onClose={onClose} submitDisabled={!name.trim()}
      submitLabel={similar ? 'Add anyway' : undefined}
      onSubmit={async () => {
        if (existing) { await renameBrand(existing.id, name.trim()); onSaved(); return; }
        try { await addBrand(name.trim(), !!similar); onSaved(); } catch (e) {
          if (e instanceof CfApiError && e.code === 'SIMILAR' && !similar) { setSimilar(e.message); throw new CfApiError(422, `${e.message} Press "Add anyway" if it is a different brand.`); }
          throw e;
        }
      }}>
      <TextField label="Brand" required autoFocus value={name} onChange={(e) => { setName(e.target.value); setSimilar(null); }}
        helperText="As it is printed on the tin, box or tag. Another spelling of a name already on the list is the same brand." />
    </FormDialog>
  );
}

function MergeDialog({ from, brands, onClose, onSaved }: { from: Brand | null; brands: Brand[]; onClose: () => void; onSaved: (n: number) => void }) {
  const [into, setInto] = useState<Brand | null>(null);
  useEffect(() => { setInto(null); }, [from]);
  const choices = brands.filter((b) => b.id !== from?.id);
  return (
    <FormDialog open={!!from} title={`Merge ${from?.name ?? ''} into…`} onClose={onClose} submitDisabled={!into} submitLabel="Merge"
      subtitle="For a duplicate: every lot of it is moved to the brand you pick, and it leaves the list."
      onSubmit={async () => { if (from && into) { const r = await mergeBrand(from.id, into.id); onSaved(r.lotsMoved); } }}>
      <Autocomplete options={choices} value={into} onChange={(_, v) => setInto(v)} getOptionLabel={(b) => b.name} isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(p) => <TextField {...p} label="The right brand" autoFocus />} />
    </FormDialog>
  );
}

export default function Brands() {
  const toast = useToast();
  const can = useIsPermitted();
  const canAdd = can('cf_erp_inventory_manage') || can('cf_erp_stores') || can('cf_erp_purchase');
  const canManage = can('cf_erp_inventory_manage');
  const list = useLoad(() => listBrands({ withUse: true }), []);
  const [naming, setNaming] = useState<{ open: boolean; row: Brand | null }>({ open: false, row: null });
  const [merging, setMerging] = useState<Brand | null>(null);
  const rows = list.data ?? [];
  const columns: DataColumn<Brand>[] = [
    { key: 'name', header: 'Brand', render: (b) => <Box sx={{ fontWeight: b.unbranded ? 600 : 500 }}>{b.name}</Box>, sortValue: (b) => (b.unbranded ? '' : b.name.toLowerCase()), alwaysVisible: true },
    { key: 'items', header: 'Items', numeric: true, render: (b) => <Mono muted={!b.items}>{b.items ?? 0}</Mono>, sortValue: (b) => b.items ?? 0, width: 110 },
    { key: 'lots', header: 'Lots received', numeric: true, render: (b) => <Mono muted={!b.lots}>{b.lots ?? 0}</Mono>, sortValue: (b) => b.lots ?? 0, width: 140 },
    { key: 'inStock', header: 'Lots in stock', numeric: true, render: (b) => <Mono muted={!b.lotsInStock}>{b.lotsInStock ?? 0}</Mono>, sortValue: (b) => b.lotsInStock ?? 0, width: 140 },
  ];
  return (
    <Box>
      <PageHeader title="Brands" subtitle="One list for every family. A GRN picks each new lot's brand from it (or Unbranded); its vendor is the GRN's supplier."
        actions={canAdd && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setNaming({ open: true, row: null })}>New brand</Button>} />
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(b) => b.id} loading={list.loading && !list.data} storageKey="brands" exportName="brands" defaultSortKey="name"
        rowActions={canManage ? (b) => (b.unbranded ? null : (
          <>
            <Tooltip title="Rename"><IconButton size="small" aria-label={`Rename ${b.name}`} onClick={() => setNaming({ open: true, row: b })}><EditRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Merge into another brand"><IconButton size="small" aria-label={`Merge ${b.name}`} onClick={() => setMerging(b)}><CallMergeRounded fontSize="small" /></IconButton></Tooltip>
          </>
        )) : undefined}
        empty={<EmptyState icon={<LocalOfferRounded />} title="No brands yet" hint="Brands are added as goods come in, or here." />} />
      <Typography sx={{ mt: 1.5, fontSize: 12.5, color: 'var(--c-text-3)' }}>Stock that came in before brands were asked for has no brand ("not recorded"); set it on the lot when it is known.</Typography>
      <NameDialog open={naming.open} existing={naming.row} onClose={() => setNaming({ open: false, row: null })} onSaved={() => { toast.success('Saved.'); setNaming({ open: false, row: null }); list.reload(); }} />
      <MergeDialog from={merging} brands={rows} onClose={() => setMerging(null)} onSaved={(n) => { toast.success(`Merged — ${n} lot${n === 1 ? '' : 's'} moved.`); setMerging(null); list.reload(); }} />
    </Box>
  );
}
