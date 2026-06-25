import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon     from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RouteIcon   from '@mui/icons-material/Route';

import { fabGet, fabPost } from '../api/client';
import type { FabRoutingPlan } from '../types';
import InfoTooltip, { type InfoContent } from '@shared/components/InfoTooltip';

// ─── INFO TOOLTIP CONTENT ─────────────────────────────────────────────────────
// INFO_TOOLTIP — update this block whenever features on this page change.
// Keep bullets in sync with what the Routing Plans page actually does.
// ─────────────────────────────────────────────────────────────────────────────

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
  id: number;
  bom_name: string;
  catalog_item_id: number;
  catalog_item_name: string;
  catalog_item_code: string;
}

function StatusChip({ status }: { status: FabRoutingPlan['status'] }) {
  const map = {
    draft:      { label: 'Draft',      color: 'default'  as const },
    released:   { label: 'Released',   color: 'success'  as const },
    superseded: { label: 'Superseded', color: 'warning'  as const },
    archived:   { label: 'Archived',   color: 'error'    as const },
  };
  const { label, color } = map[status] ?? { label: status, color: 'default' as const };
  return <Chip label={label} color={color} size="small" />;
}

export default function RoutingPlans() {
  const { company } = useParams<{ company: string }>();
  const navigate    = useNavigate();

  const [boms,     setBoms]     = useState<BomRow[]>([]);
  const [plans,    setPlans]    = useState<FabRoutingPlan[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // create dialog state
  const [dlgOpen,  setDlgOpen]  = useState(false);
  const [dlgBomId, setDlgBomId] = useState('');
  const [dlgName,  setDlgName]  = useState('');
  const [dlgNotes, setDlgNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bomsRes, plansRes] = await Promise.all([
        fabGet<{ data: BomRow[] }>('routing/boms'),
        fabGet<{ data: FabRoutingPlan[] }>('routing/plans'),
      ]);
      setBoms(bomsRes.data ?? []);
      setPlans(plansRes.data ?? []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!dlgBomId || !dlgName.trim()) return;
    setCreating(true);
    try {
      const res = await fabPost<{ id: number }>('routing/plans', {
        bomId: parseInt(dlgBomId),
        name:  dlgName.trim(),
        notes: dlgNotes.trim() || null,
      });
      setDlgOpen(false);
      setDlgBomId('');
      setDlgName('');
      setDlgNotes('');
      navigate(`/${company}/fab_erp/routing-plans/${res.id}`);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>;

  return (
    <Box p={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Stack direction="row" alignItems="center" gap={1}>
          <RouteIcon color="primary" />
          <Typography variant="h5">Routing Plans</Typography>
          <InfoTooltip content={INFO_ROUTING_PLANS} placement="right" />
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlgOpen(true)}>
          New Routing Plan
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Plan Name</TableCell>
              <TableCell>Item</TableCell>
              <TableCell>BOM</TableCell>
              <TableCell>Version</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Steps</TableCell>
              <TableCell>Last Updated</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {plans.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No routing plans yet. Click "New Routing Plan" to create one.
                </TableCell>
              </TableRow>
            )}
            {plans.map(p => (
              <TableRow
                key={p.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/${company}/fab_erp/routing-plans/${p.id}`)}
              >
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{p.name}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{p.catalogItemName}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.catalogItemCode}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{p.bomName}</Typography>
                </TableCell>
                <TableCell>v{p.versionNo}</TableCell>
                <TableCell><StatusChip status={p.status} /></TableCell>
                <TableCell align="center">
                  <Chip label={p.stepCount ?? 0} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title="Open Builder">
                    <OpenInNewIcon fontSize="small" color="action" />
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* Create Dialog */}
      <Dialog open={dlgOpen} onClose={() => setDlgOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New Routing Plan</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <TextField
              select
              label="BOM / Product"
              value={dlgBomId}
              onChange={e => setDlgBomId(e.target.value)}
              fullWidth
              required
              size="small"
              helperText="Select the Bill of Materials this routing plan will process"
            >
              {boms.map(b => (
                <MenuItem key={b.id} value={String(b.id)}>
                  <Stack>
                    <Typography variant="body2">{b.catalog_item_name} ({b.catalog_item_code})</Typography>
                    <Typography variant="caption" color="text.secondary">{b.bom_name}</Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Plan Name"
              value={dlgName}
              onChange={e => setDlgName(e.target.value)}
              fullWidth
              required
              size="small"
              placeholder="e.g. Standard Process v1"
            />
            <TextField
              label="Notes (optional)"
              value={dlgNotes}
              onChange={e => setDlgNotes(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !dlgBomId || !dlgName.trim()}
          >
            {creating ? <CircularProgress size={18} /> : 'Create & Open Builder'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
