import { useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import EngineeringRounded from '@mui/icons-material/EngineeringRounded';
import { InfoButton } from '@shared/ui';
import { getContractorGrid, type ContractorGrid } from '../../api/contractorWorkOrders';
import { listProductionOrders } from '../../api/productionOrders';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useUrlParam } from '../../hooks/useUrlState';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { appPath } from '../../navMeta';
import { LANE_FAMILY, tonnesText } from '../../lib/contractorWorkOrders';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SectionCard, SkeletonRows } from '../../components/ui';
import { GiveWorkDialog } from '../../components/ContractorWork/GiveWorkDialog';
import { VendorAssign3D } from '../../components/ContractorWork/VendorAssign3D';
import { useToast } from '../../components/toastContext';

/**
 * Planning › VENDORS (user, 2026-11-14: "selecting a vendor for a few of the production order steps in planning … and a 3D
 * diagram that shows who is assigned on what"). One production order at a time: give some of its steps (BOM rows ×
 * operations) to a vendor — the same grid as the production order's, raising the contractor PO for Management — see who has
 * what (tonnes by vendor and operation, each work order and where it stands), and the structure in 3D in the vendors'
 * colours. The month and week plans take work given out off the plant's machine hours.
 */

/** Tonnes by vendor and operation, from the grid's cells (a row's tonnes counted once per operation given). */
function shareOf(grid: ContractorGrid) {
  const ops = new Map(grid.operations.map((o) => [String(o.id), o]));
  const by = new Map<number, { name: string; total: number; ops: Map<string, number> }>();
  let inHouse = 0; let given = 0;
  for (const r of grid.rows) {
    for (const [opId, c] of Object.entries(r.cells)) {
      const t = r.tonnes ?? 0;
      if (!c.workOrder) { inHouse += t; continue; }
      given += t;
      const v = by.get(c.workOrder.contractor.id) ?? { name: c.workOrder.contractor.name, total: 0, ops: new Map() };
      v.total += t; v.ops.set(opId, (v.ops.get(opId) ?? 0) + t);
      by.set(c.workOrder.contractor.id, v);
    }
  }
  return { vendors: [...by.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total), ops, inHouse, given };
}

export default function Vendors() {
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canGive = isPermitted('cf_erp_production_manage|cf_erp_accounts_manage');
  const [poParam, setPoParam] = useUrlParam('po', '');
  const list = useLoad(() => listProductionOrders({ state: 'all', limit: 200 }), []);
  const choices = useMemo(() => (list.data?.rows ?? []).flatMap((g) => g.productionOrders.map((p) => ({ ...p, order: g.order }))), [list.data]);
  const poId = Number(poParam) || choices.find((p) => p.state !== 'closed')?.id || choices[0]?.id || null;
  const [tick, setTick] = useState(0);
  const grid = useLoad(() => (poId ? getContractorGrid(poId) : Promise.resolve(null)), [poId, tick]);
  const [giving, setGiving] = useState(false);
  const share = useMemo(() => (grid.data ? shareOf(grid.data) : null), [grid.data]);
  const g = grid.data;

  return (
    <Box>
      <PageHeader title="Vendors" help={<InfoButton text="Give some steps of a production order to a vendor: pick its BOM rows × operations in the grid, the vendor and a rate per tonne. That raises the vendor's work order PO, which goes to the MD; once approved, those steps show as with the vendor on the tracker and the floor, and the plans take them off the plant's machines. Below: who has what, and the structure in the vendors' colours." label="How vendors work" />}
        subtitle="Which steps of a production order go to which vendor."
        actions={canGive && g ? <Button variant="contained" startIcon={<EngineeringRounded />} disabled={!g.editable} onClick={() => setGiving(true)} data-testid="vendors-give">Give steps to a vendor</Button> : undefined} />
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {!list.data ? <SkeletonRows rows={4} /> : !choices.length ? (
        <EmptyState icon={<EngineeringRounded />} title="No production orders yet" hint="Production orders are made when an order's execution plan is saved." />
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select size="small" label="Production order" value={poId ?? ''} onChange={(e) => setPoParam(String(e.target.value))} sx={{ minWidth: 340 }}
              slotProps={{ htmlInput: { 'data-testid': 'vendors-po' } }}>
              {choices.map((p) => <MenuItem key={p.id} value={p.id}><Mono sx={{ mr: 1 }}>{p.code}</Mono>{p.label}<Box component="span" sx={{ ml: 1, color: 'var(--c-text-3)' }}>· {p.stateLabel}</Box></MenuItem>)}
            </TextField>
            {g && !g.editable && g.why && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{g.why}</Typography>}
          </Box>
          <ErrorNotice error={grid.error} onRetry={grid.reload} />
          {!g ? <SkeletonRows rows={6} /> : (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 1.5 }}>
                <SectionCard title="Who has what" subtitle={share && share.given > 0 ? `${tonnesText(share.given)} of step-tonnes with vendors, ${tonnesText(share.inHouse)} in-house.` : 'Everything is in-house so far.'}>
                  {share && share.vendors.length > 0 ? (
                    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead><tr>
                        <Box component="th" sx={{ textAlign: 'left', fontWeight: 500, color: 'var(--c-text-3)', py: 0.5 }}>Vendor</Box>
                        <Box component="th" sx={{ textAlign: 'left', fontWeight: 500, color: 'var(--c-text-3)' }}>Operations (tonnes)</Box>
                        <Box component="th" sx={{ textAlign: 'right', fontWeight: 500, color: 'var(--c-text-3)' }}>Total</Box>
                      </tr></thead>
                      <tbody>
                        {share.vendors.map((v) => (
                          <tr key={v.id}>
                            <Box component="td" sx={{ py: 0.6, fontWeight: 600, borderTop: '1px solid var(--c-divider)', pr: 1 }}>{v.name}</Box>
                            <Box component="td" sx={{ borderTop: '1px solid var(--c-divider)', color: 'var(--c-text-2)' }}>
                              {[...v.ops.entries()].map(([op, t]) => `${share.ops.get(op)?.name ?? op} ${tonnesText(t)}`).join(' · ')}
                            </Box>
                            <Box component="td" sx={{ textAlign: 'right', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--c-divider)' }}>{tonnesText(v.total)}</Box>
                          </tr>
                        ))}
                      </tbody>
                    </Box>
                  ) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No step of {g.productionOrder.code} is with a vendor.</Typography>}
                </SectionCard>
                <SectionCard title="Work orders" subtitle="Each one raised a vendor PO for the MD; once approved it is issued.">
                  {g.workOrders.length ? (
                    <Box sx={{ display: 'grid', gap: 0.5 }} data-testid="vendors-work-orders">
                      {g.workOrders.map((w) => (
                        <Box key={w.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.5, borderTop: '1px solid var(--c-divider)' }}>
                          <Box component={Link} to={appPath(company, `contractor-work-orders/${w.id}`)} sx={{ color: 'inherit' }}><Mono>{w.code}</Mono></Box>
                          <Typography sx={{ fontSize: 13 }}>{w.contractor.name}</Typography>
                          <Badge family={LANE_FAMILY[w.lane]} label={w.lane.replace(/_/g, ' ')} noIcon />
                          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{w.cells} step{w.cells === 1 ? '' : 's'}{w.purchaseOrder ? ` · ${w.purchaseOrder.code}` : ''}</Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>None yet.</Typography>}
                </SectionCard>
              </Box>
              <SectionCard title="Who is on what, in 3D" subtitle="Each piece in its vendor's colour — work given on an assembly covers its parts. Two vendors on one piece share it half and half; in-house is grey.">
                <VendorAssign3D grid={g} />
              </SectionCard>
            </>
          )}
        </Box>
      )}
      {poId && (
        <GiveWorkDialog open={giving} productionOrderId={poId} onClose={() => setGiving(false)}
          onMade={(wo) => { setGiving(false); toast.success(`${wo.code} raised — the vendor PO ${wo.purchaseOrder?.code ?? ''} is with the MD.`); setTick((t) => t + 1); }} />
      )}
    </Box>
  );
}
