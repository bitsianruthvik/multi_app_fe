import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse,
  Divider, Paper, Snackbar, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon          from '@mui/icons-material/ExpandMore';
import ExpandLessIcon          from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon  from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon        from '@mui/icons-material/WarningAmber';
import ShoppingCartIcon        from '@mui/icons-material/ShoppingCart';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import InventoryIcon           from '@mui/icons-material/Inventory';

import { fabGet, fabPost } from '../api/client';
import { usePermission }   from '@core/hooks/usePermission';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlannedOrderNode {
  id: number;
  orderNumber: string;
  type: 'mrp_make' | 'mrp_buy';
  status: string;
  qty: number;
  requiredDate: string;
  scheduledStart: string | null;
  catalogItemId: number;
  itemName: string;
  itemCode: string;
  procurementType: string;
  leadTimeDays: number;
  stockOnHand: number;
  stockOnOrder: number;
  netQtyRequired: number;
  children: PlannedOrderNode[];
}

interface DemandGroup {
  demandType: 'sales_order' | 'safety_stock';
  soId: number | null;
  soNumber: string | null;
  customerName: string | null;
  customerPoRef: string | null;
  priority: string | null;
  soNotes: string | null;
  soRequiredDate: string | null;
  soStatus: string | null;
  tree: PlannedOrderNode[];
  totalOrders: number;
  makeCount: number;
  buyCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function collectIds(node: PlannedOrderNode): number[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)];
}

function priorityColor(p: string | null): 'error' | 'warning' | 'info' | 'default' {
  switch (p) {
    case 'critical': return 'error';
    case 'high':     return 'warning';
    case 'medium':   return 'info';
    default:         return 'default';
  }
}

// ── Single planned order row (recursive) ──────────────────────────────────────
function OrderRow({
  node, depth, selected, onToggle, canManage,
}: {
  node: PlannedOrderNode;
  depth: number;
  selected: Set<number>;
  onToggle: (ids: number[]) => void;
  canManage: boolean;
}) {
  const allIds    = collectIds(node);
  const allChosen = allIds.every(id => selected.has(id));
  const someChosen = allIds.some(id => selected.has(id));
  const isMake    = node.type === 'mrp_make';
  const stockOk   = node.stockOnHand + node.stockOnOrder >= node.qty;

  return (
    <>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        pl: 2 + depth * 3, pr: 2, py: 0.75,
        borderLeft: depth > 0 ? '2px dashed' : 'none',
        borderColor: 'divider',
        ml: depth > 0 ? 3 : 0,
        bgcolor: allChosen ? 'action.selected' : 'transparent',
        borderRadius: 0.5,
        '&:hover': { bgcolor: allChosen ? 'action.selected' : 'action.hover' },
        cursor: canManage ? 'pointer' : 'default',
        transition: 'background 0.1s',
      }}
        onClick={() => canManage && onToggle(allIds)}>

        {/* Type icon */}
        <Tooltip title={isMake ? 'Make — Manufacturing Work Order' : 'Buy — Purchase Order'}>
          {isMake
            ? <PrecisionManufacturingIcon fontSize="small" color="secondary" />
            : <ShoppingCartIcon fontSize="small" color="info" />}
        </Tooltip>

        {/* Item info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="body2" fontWeight={600} noWrap>{node.itemName}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {node.itemCode}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {node.orderNumber}
          </Typography>
        </Box>

        {/* Qty + stock */}
        <Box sx={{ textAlign: 'right', minWidth: 90 }}>
          <Typography variant="body2" fontWeight={700}>
            {node.qty.toLocaleString()} {node.qty === 1 ? 'pc' : 'pcs'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, justifyContent: 'flex-end' }}>
            <InventoryIcon sx={{ fontSize: 11, color: stockOk ? 'success.main' : 'text.disabled' }} />
            <Typography variant="caption" color={stockOk ? 'success.main' : 'text.secondary'}>
              {node.stockOnHand} on hand
            </Typography>
          </Box>
        </Box>

        {/* Required date */}
        <Box sx={{ textAlign: 'right', minWidth: 80 }}>
          <Typography variant="caption" color="text.secondary" display="block">Required</Typography>
          <Typography variant="caption" fontWeight={600}>
            {node.requiredDate?.slice(0, 10) ?? '—'}
          </Typography>
        </Box>

        {/* Lead time */}
        <Box sx={{ textAlign: 'right', minWidth: 60 }}>
          <Typography variant="caption" color="text.secondary" display="block">Lead</Typography>
          <Typography variant="caption">{node.leadTimeDays}d</Typography>
        </Box>

        {/* Selection indicator */}
        {canManage && (
          <Box sx={{
            width: 20, height: 20, borderRadius: '50%', border: '2px solid',
            borderColor: allChosen ? 'primary.main' : someChosen ? 'warning.main' : 'divider',
            bgcolor: allChosen ? 'primary.main' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {allChosen && <CheckCircleOutlineIcon sx={{ fontSize: 14, color: '#fff' }} />}
          </Box>
        )}
      </Box>

      {/* Children */}
      {node.children.map(child => (
        <OrderRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selected={selected}
          onToggle={onToggle}
          canManage={canManage}
        />
      ))}
    </>
  );
}

// ── Demand group card ─────────────────────────────────────────────────────────
function DemandGroupCard({
  group, onFirmed, canManage,
}: {
  group: DemandGroup;
  onFirmed: (msg: string) => void;
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [firming,  setFirming]  = useState(false);
  const [error,    setError]    = useState('');

  // Collect all IDs in this group
  const allGroupIds = group.tree.flatMap(collectIds);

  function toggleIds(ids: number[]) {
    setSelected(prev => {
      const next = new Set(prev);
      const allIn = ids.every(id => next.has(id));
      ids.forEach(id => allIn ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allGroupIds));
  }
  function deselectAll() {
    setSelected(new Set());
  }

  async function firmSelected() {
    if (selected.size === 0) return;
    setFirming(true); setError('');
    try {
      const res = await fabPost<{ firmed: { id: number; orderNumber: string; orderType: string }[] }>(
        'planner/firm-tree',
        { orderIds: [...selected] },
      );
      const wos = res.firmed.filter(f => f.orderType === 'manufacturing').map(f => f.orderNumber);
      const pos = res.firmed.filter(f => f.orderType === 'purchase').map(f => f.orderNumber);
      const parts = [];
      if (wos.length) parts.push(`${wos.length} WO${wos.length > 1 ? 's' : ''}`);
      if (pos.length) parts.push(`${pos.length} PO${pos.length > 1 ? 's' : ''}`);
      setSelected(new Set());
      onFirmed(`Firmed: ${parts.join(' + ')} — ${res.firmed.map(f => f.orderNumber).join(', ')}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? msg);
    } finally {
      setFirming(false);
    }
  }

  const isSalesOrder = group.demandType === 'sales_order';
  const allSelected  = allGroupIds.length > 0 && allGroupIds.every(id => selected.has(id));

  return (
    <Paper variant="outlined" sx={{ mb: 2 }}>
      {/* Group header */}
      <Box
        sx={{
          px: 2, py: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1.5,
          cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: '4px 4px 0 0',
        }}
        onClick={() => setExpanded(v => !v)}>

        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}

        <Box sx={{ flex: 1 }}>
          {isSalesOrder ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" fontWeight={700}>{group.soNumber}</Typography>
              {group.customerName && (
                <Typography variant="body2" color="text.secondary">— {group.customerName}</Typography>
              )}
              {group.customerPoRef && (
                <Typography variant="caption" color="text.disabled">PO: {group.customerPoRef}</Typography>
              )}
              {group.priority && (
                <Chip label={group.priority.toUpperCase()} size="small"
                  color={priorityColor(group.priority)} />
              )}
              {group.soStatus && (
                <Chip label={group.soStatus.replace(/_/g, ' ')} size="small" variant="outlined" />
              )}
            </Box>
          ) : (
            <Typography variant="subtitle1" fontWeight={700}>Safety Stock Replenishment</Typography>
          )}
          {group.soNotes && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {group.soNotes}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
            {group.soRequiredDate && (
              <Typography variant="caption" color="text.secondary">
                Customer due: <strong>{group.soRequiredDate.slice(0, 10)}</strong>
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {group.makeCount} make · {group.buyCount} buy · {group.totalOrders} total orders
            </Typography>
          </Box>
        </Box>

        {/* Firm controls */}
        {canManage && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexShrink: 0 }}
            onClick={e => e.stopPropagation()}>
            {selected.size > 0 && (
              <Typography variant="caption" color="primary">
                {selected.size} selected
              </Typography>
            )}
            <Button size="small" variant="outlined"
              onClick={allSelected ? deselectAll : selectAll}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
            <Button
              size="small" variant="contained" color="success"
              disabled={selected.size === 0 || firming}
              startIcon={firming ? <CircularProgress size={14} color="inherit" /> : <CheckCircleOutlineIcon />}
              onClick={firmSelected}>
              Firm {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => setError('')}>{error}</Alert>}

      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ py: 0.5 }}>
          {group.tree.map(node => (
            <OrderRow
              key={node.id}
              node={node}
              depth={0}
              selected={selected}
              onToggle={toggleIds}
              canManage={canManage}
            />
          ))}
        </Box>

        {/* Legend */}
        {canManage && (
          <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider',
            display: 'flex', gap: 2, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Click a row to select/deselect it and its sub-tree.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PrecisionManufacturingIcon fontSize="small" color="secondary" />
              <Typography variant="caption">= Manufacturing WO</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ShoppingCartIcon fontSize="small" color="info" />
              <Typography variant="caption">= Purchase Order</Typography>
            </Box>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PlanningWorkbench() {
  const canManage = usePermission('fab_erp_projects_manage');

  const [groups,  setGroups]  = useState<DemandGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [toast,   setToast]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await fabGet<DemandGroup[]>('planner/workbench');
      setGroups(data ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function onFirmed(msg: string) {
    setToast(msg);
    load();   // reload to show firmed orders have moved out of workbench
  }

  const totalOrders = groups.reduce((s, g) => s + g.totalOrders, 0);
  const totalMake   = groups.reduce((s, g) => s + g.makeCount,   0);
  const totalBuy    = groups.reduce((s, g) => s + g.buyCount,    0);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Planning Workbench</Typography>
        <Typography variant="body2" color="text.secondary">
          Review MRP-generated planned orders grouped by demand source. Select and firm to convert into work orders and purchase orders.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : groups.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <InventoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary" gutterBottom>
            No pending planned orders.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Run MRP first to generate planned orders, then come back here to firm them.
          </Typography>
        </Paper>
      ) : (
        <>
          {/* Summary banner */}
          <Box sx={{
            display: 'flex', gap: 3, mb: 2.5, px: 2, py: 1.25,
            bgcolor: 'action.hover', borderRadius: 1, flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <WarningAmberIcon color="warning" fontSize="small" />
              <Typography variant="body2">
                <strong>{totalOrders}</strong> planned order{totalOrders !== 1 ? 's' : ''} awaiting firm
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              <strong>{totalMake}</strong> manufacturing · <strong>{totalBuy}</strong> purchase
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>{groups.length}</strong> demand group{groups.length !== 1 ? 's' : ''}
            </Typography>
            <Button size="small" variant="outlined" onClick={load} sx={{ ml: 'auto' }}>
              Refresh
            </Button>
          </Box>

          {/* Demand groups */}
          {groups.map((group, i) => (
            <DemandGroupCard
              key={group.soId ?? `safety-${i}`}
              group={group}
              onFirmed={onFirmed}
              canManage={canManage}
            />
          ))}
        </>
      )}

      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast('')}
        message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
