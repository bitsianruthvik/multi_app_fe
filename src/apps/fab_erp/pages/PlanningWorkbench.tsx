import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Collapse, Divider, Tooltip, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';

import { fabGet, fabPost } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, StatStrip, StatusBadge, Mono, EmptyState, useToast, type Stat } from '../components';

interface PlannedOrderNode {
  id: number; orderNumber: string; type: 'mrp_make' | 'mrp_buy'; status: string;
  qty: number; requiredDate: string; scheduledStart: string | null;
  catalogItemId: number; itemName: string; itemCode: string;
  procurementType: string; leadTimeDays: number; stockOnHand: number; stockOnOrder: number;
  netQtyRequired: number; children: PlannedOrderNode[];
}
interface DemandGroup {
  demandType: 'sales_order' | 'safety_stock'; soId: number | null; soNumber: string | null;
  customerName: string | null; customerPoRef: string | null; priority: string | null;
  soNotes: string | null; soRequiredDate: string | null; soStatus: string | null;
  tree: PlannedOrderNode[]; totalOrders: number; makeCount: number; buyCount: number;
}

function collectIds(node: PlannedOrderNode): number[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)];
}
function priorityFamily(p: string | null): 'danger' | 'warning' | 'info' | 'neutral' {
  if (p === 'critical') return 'danger';
  if (p === 'high') return 'warning';
  if (p === 'medium') return 'info';
  return 'neutral';
}

function OrderRow({ node, depth, selected, onToggle, canManage }: {
  node: PlannedOrderNode; depth: number; selected: Set<number>; onToggle: (ids: number[]) => void; canManage: boolean;
}) {
  const allIds = collectIds(node);
  const allChosen = allIds.every((id) => selected.has(id));
  const someChosen = allIds.some((id) => selected.has(id));
  const isMake = node.type === 'mrp_make';
  const stockOk = node.stockOnHand + node.stockOnOrder >= node.qty;

  return (
    <>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.25,
          pl: `${16 + depth * 24}px`, pr: 2, py: 1,
          borderLeft: depth > 0 ? '2px dashed var(--c-border)' : 'none',
          ml: depth > 0 ? 3 : 0,
          background: allChosen ? 'var(--c-primary-50)' : 'transparent',
          borderRadius: 'var(--r-sm)',
          cursor: canManage ? 'pointer' : 'default',
          transition: 'background var(--t-fast) var(--ease)',
          '&:hover': { background: allChosen ? 'var(--c-primary-50)' : 'var(--c-surface-2)' },
        }}
        onClick={() => canManage && onToggle(allIds)}
      >
        <Tooltip title={isMake ? 'Make — manufacturing work order' : 'Buy — purchase order'}>
          {isMake
            ? <PrecisionManufacturingRounded fontSize="small" sx={{ color: 'var(--c-primary-600)' }} />
            : <ShoppingCartRounded fontSize="small" sx={{ color: 'var(--c-info-600)' }} />}
        </Tooltip>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.itemName}</Typography>
            <Mono sx={{ color: 'var(--c-text-3)' }}>{node.itemCode}</Mono>
          </Box>
          <Mono sx={{ color: 'var(--c-text-3)' }}>{node.orderNumber}</Mono>
        </Box>

        <Box sx={{ textAlign: 'right', minWidth: 90 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
            <Mono tabular>{node.qty.toLocaleString()}</Mono> {node.qty === 1 ? 'pc' : 'pcs'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, justifyContent: 'flex-end' }}>
            <Inventory2Rounded sx={{ fontSize: 11, color: stockOk ? 'var(--c-success-600)' : 'var(--c-text-3)' }} />
            <Typography sx={{ fontSize: 11, color: stockOk ? 'var(--c-success-600)' : 'var(--c-text-2)' }}>{node.stockOnHand} on hand</Typography>
          </Box>
        </Box>

        <Box sx={{ textAlign: 'right', minWidth: 80 }}>
          <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>Required</Typography>
          <Mono sx={{ fontWeight: 600 }}>{node.requiredDate?.slice(0, 10) ?? '—'}</Mono>
        </Box>

        <Box sx={{ textAlign: 'right', minWidth: 50 }}>
          <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>Lead</Typography>
          <Mono>{node.leadTimeDays}d</Mono>
        </Box>

        {canManage && (
          <Box sx={{
            width: 20, height: 20, borderRadius: '50%', border: '2px solid',
            borderColor: allChosen ? 'var(--c-primary-500)' : someChosen ? 'var(--c-warning-600)' : 'var(--c-border)',
            background: allChosen ? 'var(--c-primary-500)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {allChosen && <CheckCircleOutlineIcon sx={{ fontSize: 14, color: '#fff' }} />}
          </Box>
        )}
      </Box>

      {node.children.map((child) => (
        <OrderRow key={child.id} node={child} depth={depth + 1} selected={selected} onToggle={onToggle} canManage={canManage} />
      ))}
    </>
  );
}

function DemandGroupCard({ group, onFirmed, canManage }: { group: DemandGroup; onFirmed: (msg: string) => void; canManage: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [firming, setFirming] = useState(false);
  const [error, setError] = useState('');

  const allGroupIds = group.tree.flatMap(collectIds);

  function toggleIds(ids: number[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  }
  function selectAll() { setSelected(new Set(allGroupIds)); }
  function deselectAll() { setSelected(new Set()); }

  async function firmSelected() {
    if (selected.size === 0) return;
    setFirming(true); setError('');
    try {
      const res = await fabPost<{ firmed: { id: number; orderNumber: string; orderType: string }[] }>('planner/firm-tree', { orderIds: [...selected] });
      const wos = res.firmed.filter((f) => f.orderType === 'manufacturing').map((f) => f.orderNumber);
      const pos = res.firmed.filter((f) => f.orderType === 'purchase').map((f) => f.orderNumber);
      const parts: string[] = [];
      if (wos.length) parts.push(`${wos.length} WO${wos.length > 1 ? 's' : ''}`);
      if (pos.length) parts.push(`${pos.length} PO${pos.length > 1 ? 's' : ''}`);
      setSelected(new Set());
      onFirmed(`Firmed: ${parts.join(' + ')} — ${res.firmed.map((f) => f.orderNumber).join(', ')}`);
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message ?? (e as Error).message);
    } finally { setFirming(false); }
  }

  const isSalesOrder = group.demandType === 'sales_order';
  const allSelected = allGroupIds.length > 0 && allGroupIds.every((id) => selected.has(id));

  return (
    <Surface e={1} sx={{ mb: 2, overflow: 'hidden' }}>
      <Box
        sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1.5, cursor: 'pointer', '&:hover': { background: 'var(--c-surface-2)' } }}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ExpandLessRounded sx={{ color: 'var(--c-text-2)' }} /> : <ExpandMoreRounded sx={{ color: 'var(--c-text-2)' }} />}

        <Box sx={{ flex: 1 }}>
          {isSalesOrder ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Mono sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{group.soNumber}</Mono>
              {group.customerName && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>— {group.customerName}</Typography>}
              {group.customerPoRef && <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>PO: {group.customerPoRef}</Typography>}
              {group.priority && <StatusBadge status={group.priority} family={priorityFamily(group.priority)} />}
              {group.soStatus && <StatusBadge status={group.soStatus} />}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>Safety Stock Replenishment</Typography>
          )}
          {group.soNotes && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>{group.soNotes}</Typography>}
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
            {group.soRequiredDate && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Customer due: <strong>{group.soRequiredDate.slice(0, 10)}</strong></Typography>
            )}
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{group.makeCount} make · {group.buyCount} buy · {group.totalOrders} total orders</Typography>
          </Box>
        </Box>

        {canManage && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            {selected.size > 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-primary-600)', fontWeight: 500 }}>{selected.size} selected</Typography>}
            <Button size="small" variant="outlined" onClick={allSelected ? deselectAll : selectAll}>
              {allSelected ? 'Deselect all' : 'Select all'}
            </Button>
            <Button size="small" variant="contained" color="success" disabled={selected.size === 0 || firming}
              startIcon={firming ? <CircularProgress size={14} color="inherit" /> : <CheckCircleOutlineIcon />} onClick={firmSelected}>
              Firm {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => setError('')}>{error}</Alert>}

      <Collapse in={expanded}>
        <Divider sx={{ borderColor: 'var(--c-divider)' }} />
        <Box sx={{ py: 0.5 }}>
          {group.tree.map((node) => (
            <OrderRow key={node.id} node={node} depth={0} selected={selected} onToggle={toggleIds} canManage={canManage} />
          ))}
        </Box>

        {canManage && (
          <Box sx={{ px: 2, py: 1, background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-divider)', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>Click a row to select/deselect it and its sub-tree.</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PrecisionManufacturingRounded fontSize="small" sx={{ color: 'var(--c-primary-600)' }} />
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>= Manufacturing WO</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ShoppingCartRounded fontSize="small" sx={{ color: 'var(--c-info-600)' }} />
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>= Purchase Order</Typography>
            </Box>
          </Box>
        )}
      </Collapse>
    </Surface>
  );
}

export default function PlanningWorkbench() {
  const canManage = usePermission('fab_erp_projects_manage');
  const { toast } = useToast();

  const [groups, setGroups] = useState<DemandGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await fabGet<DemandGroup[]>('planner/workbench');
      setGroups(data ?? []);
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message ?? (e as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function onFirmed(msg: string) { toast(msg); load(); }

  const totalOrders = groups.reduce((s, g) => s + g.totalOrders, 0);
  const totalMake = groups.reduce((s, g) => s + g.makeCount, 0);
  const totalBuy = groups.reduce((s, g) => s + g.buyCount, 0);

  const stats: Stat[] = [
    { label: 'Awaiting firm', value: totalOrders, tone: totalOrders ? 'warning' : 'default', icon: <WarningAmberRounded /> },
    { label: 'Manufacturing', value: totalMake, tone: 'primary', icon: <PrecisionManufacturingRounded /> },
    { label: 'Purchase', value: totalBuy, tone: 'info', icon: <ShoppingCartRounded /> },
    { label: 'Demand groups', value: groups.length, icon: <Inventory2Rounded /> },
  ];

  return (
    <Box>
      <PageHeader
        title="Planning Workbench"
        subtitle="Review MRP-generated planned orders grouped by demand source — select and firm to convert into work orders and purchase orders."
        actions={!loading && groups.length > 0 ? <Button size="small" variant="outlined" onClick={load}>Refresh</Button> : undefined}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Surface e={1} sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>
      ) : groups.length === 0 ? (
        <EmptyState icon={<Inventory2Rounded />} title="No pending planned orders" hint="Run MRP first to generate planned orders, then come back here to firm them." />
      ) : (
        <>
          <StatStrip stats={stats} />
          {groups.map((group, i) => (
            <DemandGroupCard key={group.soId ?? `safety-${i}`} group={group} onFirmed={onFirmed} canManage={canManage} />
          ))}
        </>
      )}
    </Box>
  );
}
