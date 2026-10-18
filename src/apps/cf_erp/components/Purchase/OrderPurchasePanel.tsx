import { useState } from 'react';
import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import { CfApiError } from '../../api/client';
import {
  getLineMaterialReady, getOrderRequisitions, raiseRequisitions, setLineSupply, type LineWithout, type MaterialSupply,
} from '../../api/requisitions';
import { listMaterialRequests } from '../../api/purchaseRequests';
import type { OrderStage, SalesOrder } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { lockedWords, raisedMessage, supplyLabel } from '../../lib/materialRequest';
import { Badge, ErrorNotice, Mono, SectionCard, SkeletonBlock } from '../ui';
import { useToast } from '../toastContext';
import { StageStateBadge } from '../OrderProcess/stageUi';
import { MaterialReadyChip } from './MaterialReadyChip';
import { PromisedDateDialog } from './CustomerMaterialStatus';
import { PrStatusBadge } from './purchaseFlowUi';
import { mrDocument } from '../../api/acceptance';
import { saveBlob } from '../../lib/acceptance';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import TableViewRounded from '@mui/icons-material/TableViewRounded';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const NO_MANAGE = 'You can see the material request. Raising it needs the inventory manage permission.';

type Refusal = { message: string; problems: string[] };
const refusalOf = (e: unknown): Refusal => (e instanceof CfApiError ? { message: e.message, problems: e.problems } : { message: (e as Error).message, problems: [] });

/**
 * The sales order's MATERIAL REQUEST stage (§71, 2026-10-18). The MR is raised here from what nesting says the lines
 * need; from then on everything happens in Purchase (Purchase › Material requests): taking from stock, the purchase
 * request with its vendors' quotes, the POs, the MD's approval and the goods. This stage keeps only "Raise MR" and a
 * read-only status of each MR, with a link into Purchase.
 */
export function OrderPurchasePanel({ order, stage, onChanged }: { order: SalesOrder; stage: OrderStage; onChanged?: () => void }) {
  // (§73) Before the customer accepts, the MR is raised HELD: shared with the customer, nothing happens in Purchase yet.
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canView = isPermitted('cf_erp_inventory_view');
  const canManage = isPermitted('cf_erp_inventory_manage');
  const reqs = useLoad(() => (canView ? getOrderRequisitions(order.id) : Promise.resolve(null)), [order.id, canView]);
  const mrs = useLoad(() => (canView ? listMaterialRequests({ orderId: order.id, open: false }) : Promise.resolve(null)), [order.id, canView]);
  const data = reqs.data;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [asking, setAsking] = useState<{ lineIds?: number[]; proposed: string | null } | null>(null);
  const requisitions = data?.requisitions ?? [];
  const without = data?.linesWithout ?? [];
  const raisable = without.filter((w) => w.canRaise);
  const prOf = new Map((mrs.data?.rows ?? []).map((m) => [m.id, m.purchaseRequest]));
  const orderSupply: MaterialSupply = data?.order.materialSupply ?? order.materialSupply ?? 'we_buy';
  const reload = () => { reqs.reload(); mrs.reload(); invalidateNavCounts(); onChanged?.(); };
  // §73: the MR is shared with the customer as a file (no customer login): the order's MRs as PDF or Excel.
  const share = async (format: 'pdf' | 'xlsx') => {
    try { saveBlob(await mrDocument(order.id, format), `MR-${order.code.replace(/[^A-Za-z0-9._-]+/g, '-')}.${format}`); }
    catch (e) { setRefusal(refusalOf(e)); }
  };

  const raiseNow = async (lineIds?: number[], customerDate?: string) => {
    setBusy(true); setRefusal(null);
    try {
      const r = await raiseRequisitions(order.id, { ...(lineIds ? { lineIds } : {}), ...(customerDate ? { customerDate } : {}) });
      reqs.setData(r);
      toast.success(raisedMessage(r, { lines: lineIds }));
      reload();
    } catch (e) { setRefusal(refusalOf(e)); } finally { setBusy(false); }
  };
  /* A customer-supplied line's MR asks the customer at once (a ₹0 PO to them): first the date they promised (§68). */
  const raise = (lineIds?: number[]) => {
    const fresh = without.filter((w) => w.canRaise && (!lineIds || lineIds.includes(w.line.id)));
    const theirs = fresh.filter((w) => w.supply === 'customer');
    if (!theirs.length) return raiseNow(lineIds);
    setAsking({ lineIds, proposed: theirs.map((w) => w.customerDateDefault).filter((d): d is string => !!d).sort()[0] ?? null });
    return Promise.resolve();
  };
  const changeSupply = async (lineId: number, v: string) => {
    setBusy(true); setRefusal(null);
    try { await setLineSupply(lineId, v === '' ? null : (v as MaterialSupply)); toast.success('Material supply saved.'); reload(); } catch (e) { setRefusal(refusalOf(e)); } finally { setBusy(false); }
  };

  return (
    <SectionCard title="Material request" subtitle={`Raise ${order.code}'s material request (MR) from what nesting says the lines need. Taking from stock, buying and receiving happen in Purchase.`}
      actions={(
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {requisitions.length > 0 && <>
            <Button size="small" variant="outlined" startIcon={<PictureAsPdfRounded />} onClick={() => void share('pdf')} data-testid="mr-share-pdf">Share as PDF</Button>
            <Button size="small" variant="outlined" startIcon={<TableViewRounded />} onClick={() => void share('xlsx')} data-testid="mr-share-xlsx">Share as Excel</Button>
          </>}
          {canView && <Button size="small" endIcon={<LaunchRounded />} component={Link} to={`${appPath(company, 'material-requests')}?order=${order.id}`}>Open in Purchase</Button>}
        </Box>
      )}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <StageStateBadge stage={stage} />
          <Typography data-testid="buying-summary" sx={{ fontSize: 13.5, color: 'var(--c-text-2)', flex: '1 1 240px', minWidth: 0 }}>{stage.detail}</Typography>
        </Box>
        <Typography data-testid="order-supply" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          Material: <strong>{supplyLabel(orderSupply)}</strong>
          {orderSupply === 'customer'
            ? ' — the customer sends it. Raising the MR makes a purchase order to the customer (₹0); what arrives is kept as their stock.'
            : ' — raising the MR sends it to Purchase, where stock is taken and the rest is bought.'}
          {" A line can say otherwise until the customer's acceptance is approved."}
        </Typography>
        {!canView && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Seeing the material request needs the inventory view permission.</Typography>}
        {canView && !canManage && <Typography data-testid="buying-readonly" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>{NO_MANAGE}</Typography>}
        {refusal && (
          <Alert severity="warning" data-testid="buying-refusal" action={<Button color="inherit" size="small" onClick={() => { setRefusal(null); reload(); }}>Reload</Button>}>
            <Box>{refusal.message}</Box>
            {refusal.problems.filter((p) => p !== refusal.message).map((p) => <Box key={p} sx={{ fontSize: 12.5 }}>{p}</Box>)}
          </Alert>
        )}
        <ErrorNotice error={reqs.error} onRetry={reqs.reload} />
        {canView && !data && !reqs.error && <SkeletonBlock h={120} r={8} />}
        {data && (
          <>
            {canManage && raisable.length > 0 && (
              <Box data-testid="buying-header-actions">
                <Button variant="contained" startIcon={<PlaylistAddCheckRounded />} disabled={busy} onClick={() => void raise()} data-testid="raise-mr">
                  {requisitions.length ? 'Raise MR for the other lines' : 'Raise MR'}
                </Button>
              </Box>
            )}
            {!requisitions.length && !without.length && (
              <Typography data-testid="buying-empty" sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{data.reason ?? 'No line of this order buys any material.'}</Typography>
            )}
            {requisitions.length > 0 && (
              <Box data-testid="mr-status" sx={{ display: 'grid', gap: 0.75 }}>
                {requisitions.map((r) => {
                  const pr = prOf.get(r.id) ?? null;
                  return (
                    <Box key={r.id} data-testid="mr-status-row" data-mr={r.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                      <Mono chip><Box component={Link} to={appPath(company, `material-requests/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono>
                      <Typography component="span" sx={{ fontSize: 13 }}>Line {r.line.lineNo}</Typography>
                      {r.supply === 'customer' && <Badge family="info" label="Customer supplies" />}
                      {r.heldForAcceptance && <Badge family="warning" noIcon label="Shared — waits for the acceptance" />}
                      <Badge family={r.done ? 'success' : 'warning'} noIcon label={r.statusLabel} />
                      <Mono muted>{lockedWords(r)}</Mono>
                      {pr && <><Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${pr.id}`)} sx={linkSx}>{pr.code}</Box></Mono><PrStatusBadge status={pr.status} /></>}
                      {r.materialReady && <MaterialReadyChip state={r.materialReady.state} date={r.materialReady.readyDate} text={r.materialReady.text} testId="mr-ready" load={() => getLineMaterialReady(r.line.id).then((x) => x.materials)} />}
                    </Box>
                  );
                })}
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Locked = earmarked for this order; nobody else can use it. Open an MR in Purchase to take stock and buy the rest.</Typography>
              </Box>
            )}
            {without.length > 0 && (
              <Box data-testid="lines-without" sx={{ display: 'grid', gap: 1 }}>
                {without.map((w) => <LineWithoutRow key={w.line.id} w={w} canManage={canManage} busy={busy} orderSupply={orderSupply} onSupply={(v) => void changeSupply(w.line.id, v)} onRaise={() => void raise([w.line.id])} />)}
              </Box>
            )}
          </>
        )}
      </Box>
      <PromisedDateDialog open={!!asking} proposed={asking?.proposed ?? null} onClose={() => setAsking(null)}
        onConfirm={async (date) => { const a = asking; setAsking(null); await raiseNow(a?.lineIds, date); }} />
    </SectionCard>
  );
}

/** A line of the order with no MR yet: who supplies it (changeable until raised), and Raise MR — or why it cannot be. */
function LineWithoutRow({ w, canManage, busy, orderSupply, onSupply, onRaise }: {
  w: LineWithout; canManage: boolean; busy: boolean; orderSupply: MaterialSupply; onSupply: (v: string) => void; onRaise: () => void;
}) {
  const mr = w.materialReady;
  return (
    <Box data-testid="line-without" data-line={w.line.id} sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 13.5 }}><strong>Line {w.line.lineNo}</strong>{w.line.name ? ` · ${w.line.name}` : ''} has no material request yet.</Typography>
      {canManage
        ? (
          <TextField select size="small" label="Material" value={w.ownSupply ?? ''} disabled={busy} onChange={(e) => onSupply(e.target.value)}
            sx={{ minWidth: 200 }} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true, SelectDisplayProps: { 'data-testid': 'line-supply' } as never }}>
            <MenuItem value="">As the order ({supplyLabel(orderSupply)})</MenuItem>
            <MenuItem value="we_buy">We buy</MenuItem>
            <MenuItem value="customer">Customer supplies</MenuItem>
          </TextField>
        )
        : <Mono muted>{supplyLabel(w.supply)}</Mono>}
      {w.materials.length > 0 && <Mono muted>{w.materials.length} {w.materials.length === 1 ? 'material' : 'materials'}</Mono>}
      {mr && <MaterialReadyChip state={mr.state} date={mr.readyDate} text={mr.text} testId="line-without-ready" />}
      {w.canRaise
        ? canManage && <Button size="small" variant="outlined" startIcon={<PlaylistAddCheckRounded />} disabled={busy} onClick={onRaise}>Raise MR</Button>
        : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{w.reason}</Typography>}
    </Box>
  );
}
