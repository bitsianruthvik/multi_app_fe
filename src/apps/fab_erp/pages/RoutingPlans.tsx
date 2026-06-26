import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RouteRounded from '@mui/icons-material/RouteRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import { fabGet, fabPost } from '../api/client';
import type { FabRoutingPlan } from '../types';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';
import { PageHeader, EntityList, EntityRow, StatusBadge, Mono, EmptyState, ListSkeleton, type SortableField } from '../components';
import { statusFamily } from '../statusMap';

const INFO_ROUTING_PLANS: InfoContent = [
  {
    heading: 'What it is',
    items: [
      'A routing plan is the ordered sequence of manufacturing operations for a specific BOM.',
      'Each operation (step) is linked to a resource type — machine group or work centre.',
    ],
  },
  {
    heading: 'How to use',
    items: [
      'New Routing Plan — pick a BOM, give the plan a name, confirm; opens the builder.',
      'Edit button — re-open the visual builder to add, remove, or reorder steps.',
      'Status flow: Draft → Released. Only Released plans are picked up by the scheduler.',
      'Superseded / Archived — older revisions kept for reference; not used in scheduling.',
      'A BOM can have multiple routing plans (e.g. Standard vs. Rework) — manage them from the BOM editor or here.',
    ],
  },
];

interface BomRow {
  id: number; bom_name: string; catalog_item_id: number; catalog_item_name: string; catalog_item_code: string;
}

const ROUTING_PLAN_SORT_FIELDS: SortableField<FabRoutingPlan>[] = [
  { key: 'name', label: 'Name' },
  { key: 'catalogItemName', label: 'Item' },
  { key: 'bomName', label: 'BOM' },
  { key: 'status', label: 'Status' },
  { key: 'updatedAt', label: 'Updated' },
];

export default function RoutingPlans() {
  const { company } = useParams<{ company: string }>();
  const navigate = useNavigate();

  const [boms, setBoms] = useState<BomRow[]>([]);
  const [plans, setPlans] = useState<FabRoutingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dlgOpen, setDlgOpen] = useState(false);
  const [dlgBomId, setDlgBomId] = useState('');
  const [dlgName, setDlgName] = useState('');
  const [dlgNotes, setDlgNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [bomsRes, plansRes] = await Promise.all([
        fabGet<{ data: BomRow[] }>('routing/boms'),
        fabGet<{ data: FabRoutingPlan[] }>('routing/plans'),
      ]);
      setBoms(bomsRes.data ?? []);
      setPlans(plansRes.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!dlgBomId || !dlgName.trim()) return;
    setCreating(true);
    try {
      const res = await fabPost<{ id: number }>('routing/plans', {
        bomId: parseInt(dlgBomId), name: dlgName.trim(), notes: dlgNotes.trim() || null,
      });
      setDlgOpen(false); setDlgBomId(''); setDlgName(''); setDlgNotes('');
      navigate(`/${company}/fab_erp/routing-plans/${res.id}`);
    } catch (e) { setError((e as Error).message); }
    finally { setCreating(false); }
  };

  const newBtn = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlgOpen(true)}>
      New routing plan
    </Button>
  );

  return (
    <Box>
      <PageHeader
        title={<Stack direction="row" alignItems="center" gap={1}>Routing Plans <InfoTooltip content={INFO_ROUTING_PLANS} placement="right" /></Stack>}
        subtitle="Operation sequences for each BOM — drives the scheduler"
        actions={newBtn}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : plans.length === 0 ? (
        <EmptyState icon={<RouteRounded />} title="No routing plans yet" hint="Create one from a BOM to define its manufacturing steps." action={newBtn} />
      ) : (
        <EntityList
          rows={plans}
          sortableFields={ROUTING_PLAN_SORT_FIELDS}
          defaultSortKey="name"
          renderRow={(p) => (
            <EntityRow
              key={p.id}
              primary={p.name}
              secondary={
                <Box component="span" sx={{ display: 'inline-flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <span>{p.catalogItemName} ({p.catalogItemCode})</span>
                  <span>BOM: {p.bomName}</span>
                  <span>v{p.versionNo}</span>
                  <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                </Box>
              }
              trailing={<>
                <Mono chip>{p.stepCount ?? 0} steps</Mono>
                <StatusBadge status={p.status} family={statusFamily(p.status)} />
              </>}
              onClick={() => navigate(`/${company}/fab_erp/routing-plans/${p.id}`)}
              actions={<ChevronRightRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} />}
            />
          )}
        />
      )}

      <Dialog open={dlgOpen} onClose={() => setDlgOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 600 }}>New routing plan</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <TextField select label="BOM / product" value={dlgBomId} onChange={(e) => setDlgBomId(e.target.value)} fullWidth required size="small"
              helperText="Select the Bill of Materials this routing plan will process">
              {boms.map((b) => (
                <MenuItem key={b.id} value={String(b.id)}>
                  <Stack>
                    <Typography variant="body2">{b.catalog_item_name} ({b.catalog_item_code})</Typography>
                    <Typography variant="caption" color="text.secondary">{b.bom_name}</Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Plan name" value={dlgName} onChange={(e) => setDlgName(e.target.value)} fullWidth required size="small" placeholder="e.g. Standard Process v1" />
            <TextField label="Notes (optional)" value={dlgNotes} onChange={(e) => setDlgNotes(e.target.value)} fullWidth size="small" multiline rows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating || !dlgBomId || !dlgName.trim()}>
            {creating ? <CircularProgress size={18} color="inherit" /> : 'Create & open builder'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
