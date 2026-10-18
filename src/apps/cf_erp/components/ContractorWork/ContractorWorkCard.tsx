import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import EngineeringRounded from '@mui/icons-material/EngineeringRounded';
import { getWorkOrderBoard } from '../../api/contractorWorkOrders';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { rupeeText } from '../../lib/money';
import { LANE_FAMILY, tonnesText } from '../../lib/contractorWorkOrders';
import { Badge, ErrorNotice, Mono, SectionCard } from '../ui';
import { useToast } from '../toastContext';
import { GiveWorkDialog } from './GiveWorkDialog';

/**
 * Production order › CONTRACTOR WORK (Step 6): the work orders made from this production order ("with <contractor>
 * (WO-…)") and "Give work to a contractor", which opens the BOM rows × operations grid.
 */
export function ContractorWorkCard({ productionOrderId, canGive }: { productionOrderId: number; canGive: boolean }) {
  const company = useCompanySlug();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const load = useLoad(() => getWorkOrderBoard({ productionOrderId }), [productionOrderId]);
  const cards = (load.data?.lanes ?? []).flatMap((l) => l.cards);
  return (
    <SectionCard title="Contractor work"
      subtitle={cards.length ? `${cards.length} work order${cards.length === 1 ? '' : 's'} — their steps are done outside, not on the floor.` : 'Nothing is with a contractor. Steps given out show here and on the tracker as "with <contractor> (WO-…)".'}
      actions={canGive ? <Button size="small" variant="outlined" startIcon={<EngineeringRounded />} onClick={() => setOpen(true)} data-testid="give-work">Give work to a contractor</Button> : undefined}>
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {cards.length > 0 && (
        <Box sx={{ display: 'grid', gap: 0.5 }} data-testid="po-work-orders">
          {cards.map((w) => (
            <Box key={w.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.5, borderTop: '1px solid var(--c-divider)' }}>
              <Box component={Link} to={appPath(company, `contractor-work-orders/${w.id}`)} sx={{ color: 'inherit' }}><Mono>{w.code}</Mono></Box>
              <Typography sx={{ fontSize: 13 }}>with {w.contractor.name}</Typography>
              <Badge family={LANE_FAMILY[w.lane]} label={w.laneLabel} noIcon />
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{tonnesText(w.done)} of {tonnesText(w.tonnes)} · {rupeeText(w.value)}</Typography>
            </Box>
          ))}
        </Box>
      )}
      <GiveWorkDialog open={open} productionOrderId={productionOrderId} onClose={() => setOpen(false)}
        onMade={(wo) => { setOpen(false); toast.success(`${wo.code} raised — contractor PO ${wo.purchaseOrder?.code ?? ''} is with Management.`); load.reload(); }} />
    </SectionCard>
  );
}
