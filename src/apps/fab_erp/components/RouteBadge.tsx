import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import { fabGet, fabPost } from '../api/client';
import { StatusBadge } from './StatusBadge';
import RouteDialog from './RouteDialog';

interface RoutePlanSummary {
  id: number;
  name: string;
  status: 'draft' | 'released' | 'superseded' | 'archived';
  isCurrent: number;
}

/**
 * Per-BOM route indicator — shown next to any manufactured element (the BOM's
 * head item, or a sub-assembly that has its own nested BOM). No route yet →
 * a small "+ Route" affordance (edit mode only). A route exists → a clickable
 * chip that opens RouteDialog to view/edit it, without leaving the BOM screen.
 */
export default function RouteBadge({ bomId, mode }: { bomId: number; mode: 'edit' | 'readonly' }) {
  const [plans, setPlans] = useState<RoutePlanSummary[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<number | null>(null);

  const load = useCallback(() => {
    fabGet<{ data: RoutePlanSummary[] }>('routing/plans', { bomId })
      .then((r) => setPlans(r.data ?? []))
      .catch(() => setPlans([]));
  }, [bomId]);

  useEffect(() => { load(); }, [load]);

  async function createRoute() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fabPost<{ id: number }>('routing/plans', { bomId, name: name.trim() });
      setAdding(false); setName('');
      load();
      setOpenPlanId(res.id);
    } finally { setCreating(false); }
  }

  if (plans === null) return <CircularProgress size={12} />;

  const current = plans.find((p) => p.isCurrent) ?? plans[0];

  return (
    <>
      {current ? (
        <Tooltip title="View / edit route">
          <Box
            onClick={(e) => { e.stopPropagation(); setOpenPlanId(current.id); }}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
              border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 0.75, py: 0.25,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <RouteRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Box component="span" sx={{ fontSize: 12, fontWeight: 500 }}>{current.name}</Box>
            <StatusBadge status={current.status} />
          </Box>
        </Tooltip>
      ) : mode === 'edit' ? (
        adding ? (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <TextField
              size="small" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Route name" autoFocus sx={{ width: 140 }}
              onKeyDown={(e) => { if (e.key === 'Enter') createRoute(); if (e.key === 'Escape') { setAdding(false); setName(''); } }}
            />
            <Button size="small" variant="contained" onClick={createRoute} disabled={creating || !name.trim()}>
              {creating ? <CircularProgress size={14} /> : 'Add'}
            </Button>
            <Button size="small" onClick={() => { setAdding(false); setName(''); }}>×</Button>
          </Box>
        ) : (
          <Button
            size="small" startIcon={<AddIcon sx={{ fontSize: '14px !important' }} />}
            onClick={(e) => { e.stopPropagation(); setAdding(true); }}
            sx={{ fontSize: 11, py: 0.25, minHeight: 0 }}
          >
            Route
          </Button>
        )
      ) : (
        <Box component="span" sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>No route</Box>
      )}

      {openPlanId != null && (
        <RouteDialog planId={openPlanId} onClose={() => { setOpenPlanId(null); load(); }} />
      )}
    </>
  );
}
