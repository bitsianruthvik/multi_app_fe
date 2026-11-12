import { useRef, useState } from 'react';
import { Alert, Box, Button, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { Link } from 'react-router-dom';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import { CfApiError } from '../../api/client';
import {
  getLineMaterialReady, getMaterialsRequired, getOrderRequisitions, raiseRequisitions, setLineSupply, type LineWithout, type MaterialSupply, type MaterialsRequired,
} from '../../api/requisitions';
import { listMaterialRequests } from '../../api/purchaseRequests';
import type { OrderStage, SalesOrder } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { lockedWords, raisedMessage, supplyLabel } from '../../lib/materialRequest';
import { Badge, ErrorNotice, InfoTip, Mono, SectionCard, SkeletonBlock } from '../ui';
import { saveXlsx, type Table } from '../../lib/dashboardExport';
import { useToast } from '../toastContext';
import { StageStateBadge } from '../OrderProcess/stageUi';
import { MaterialReadyChip } from './MaterialReadyChip';
import { PromisedDateDialog } from './CustomerMaterialStatus';
import { PrStatusBadge } from './purchaseFlowUi';
import { mrDocument } from '../../api/acceptance';
import { saveBlob } from '../../lib/acceptance';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import TableViewRounded from '@mui/icons-material/TableViewRounded';
import { nudgeIfRefused, useFreshKeys } from '../salesMotion';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const NO_MANAGE = 'Creating the material request needs the orders manage or the inventory manage permission.';

type Refusal = { message: string; problems: string[] };
const refusalOf = (e: unknown): Refusal => (e instanceof CfApiError ? { message: e.message, problems: e.problems } : { message: (e as Error).message, problems: [] });

const fmtQty = (n: number) => Number(n.toFixed(3)).toLocaleString('en-IN');
const cellSx = { px: 1, py: 0.75, borderBottom: '1px solid var(--c-divider)', fontSize: 13, verticalAlign: 'middle' } as const;

/** Every required material as an Excel file (one sheet: the items; one: by line). */
function downloadRequired(order: SalesOrder, data: MaterialsRequired) {
  const items: Table = {
    name: 'Material required',
    columns: ['Item code', 'Item', 'Unit', 'Needed', 'In store', 'Issued', 'Earmarked', 'Short', 'Lines'],
    rows: data.items.map((m) => [m.item.code, m.item.name, m.item.uom, m.need, m.inStore, m.issued, m.reserved, m.short, m.lines.join(', ')]),
  };
  const name = new Map(data.items.map((m) => [m.item.id, m.item]));
  const byLine: Table = {
    name: 'By line',
    columns: ['Line', 'Line item', 'Supplied by', 'Item code', 'Item', 'Unit', 'Needed'],
    rows: data.lines.flatMap((l) => l.items.map((x) => [l.lineNo, l.name, supplyLabel(l.supply), name.get(x.itemId)?.code ?? null, name.get(x.itemId)?.name ?? null, name.get(x.itemId)?.uom ?? null, x.need])),
  };
  saveXlsx(`Material-required-${order.code.replace(/[^A-Za-z0-9._-]+/g, '-')}`, [items, byLine]);
}

/**
 * MATERIAL REQUIRED — the sales order's material step (user, 2026-11-12: "Instead of Material request, we should call it
 * material required. In that we should show what's in the store against each item. Just for them to view. And they should
 * have a button which says create a material request. There should be another button to download all required materials.
 * … Only now [after the MD accepts] should that material request button become available.")
 *
 * The table is a view (materialRequiredService): need, what the store has, what is short. "Create material request"
 * raises the MRs (to Stores, as before: §79) and is enabled once the order is confirmed. Explanations sit in i-buttons.
 */
export function OrderPurchasePanel({ order, stage, onChanged }: { order: SalesOrder; stage: OrderStage; onChanged?: () => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canView = isPermitted('cf_erp_inventory_view') || isPermitted('cf_erp_orders_view');
  const canManage = isPermitted('cf_erp_inventory_manage') || isPermitted('cf_erp_orders_manage');
  const canSeeStores = isPermitted('cf_erp_inventory_view') || isPermitted('cf_erp_stores') || isPermitted('cf_erp_purchase');
  const need = useLoad(() => (canView ? getMaterialsRequired(order.id) : Promise.resolve(null)), [order.id, canView]);
  const reqs = useLoad(() => (canView ? getOrderRequisitions(order.id) : Promise.resolve(null)), [order.id, canView]);
  const mrs = useLoad(() => (canSeeStores ? listMaterialRequests({ orderId: order.id, open: false }) : Promise.resolve(null)), [order.id, canSeeStores]);
  const data = reqs.data;
  const req = need.data;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [asking, setAsking] = useState<{ lineIds?: number[]; proposed: string | null } | null>(null);
  const requisitions = data?.requisitions ?? [];
  const freshMrs = useFreshKeys(data ? requisitions.map((r) => String(r.id)) : null);
  const raiseButton = useRef<HTMLElement | null>(null);
  const without = data?.linesWithout ?? [];
  const raisable = without.filter((w) => w.canRaise);
  const canRequest = !!req?.canRequest;
  const prOf = new Map((mrs.data?.rows ?? []).map((m) => [m.id, m.purchaseRequest]));
  const orderSupply: MaterialSupply = data?.order.materialSupply ?? order.materialSupply ?? 'we_buy';
  const reload = () => { reqs.reload(); mrs.reload(); need.reload(); invalidateNavCounts(); onChanged?.(); };
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
    } catch (e) { setRefusal(refusalOf(e)); nudgeIfRefused(e, raiseButton.current); } finally { setBusy(false); }
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
  const shortCount = req?.items.filter((m) => m.short > 0).length ?? 0;
  const gateWhy = !canManage ? NO_MANAGE : !canRequest ? (req?.requestWhy ?? 'Not yet.') : !raisable.length ? (requisitions.length ? 'Every line has its material request.' : (data?.reason ?? 'No line needs material yet.')) : '';

  return (
    <SectionCard
      title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>Material required
        <InfoTip testId="mr-info" text={<>What this order needs, and what the stores have of it now — to look at. <b>Create material request</b> sends it to Stores, who take what is in stock and ask Purchase for the rest. It opens once the customer has accepted and the MD has accepted the order. {orderSupply === 'customer' ? 'The customer sends the material for this order: the request makes a ₹0 purchase order to them.' : ''}</>} /></Box>}
      actions={(
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {req && req.items.length > 0 && (
            <Button size="small" variant="outlined" startIcon={<DownloadRounded />} onClick={() => downloadRequired(order, req)} data-testid="mr-download-required">Download required materials</Button>
          )}
          {canManage && (
            <Tooltip title={gateWhy}>
              <span>
                <Button size="small" variant="contained" startIcon={<PlaylistAddCheckRounded />} disabled={busy || !!gateWhy}
                  onClick={(e) => { raiseButton.current = e.currentTarget; void raise(); }} data-testid="raise-mr">
                  {requisitions.length ? 'Create material request for the other lines' : 'Create material request'}
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      )}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <StageStateBadge stage={stage} />
          {req && !req.canRequest && <Badge family="warning" noIcon label={req.requestWhy ?? 'Not yet'} />}
          {req && req.items.length > 0 && <Mono muted>{req.items.length} {req.items.length === 1 ? 'item' : 'items'}{shortCount ? ` · ${shortCount} short` : ' · all in store'}</Mono>}
          <Box sx={{ flex: 1 }} />
          {requisitions.length > 0 && <>
            <Button size="small" startIcon={<PictureAsPdfRounded />} onClick={() => void share('pdf')} data-testid="mr-share-pdf">MR as PDF</Button>
            <Button size="small" startIcon={<TableViewRounded />} onClick={() => void share('xlsx')} data-testid="mr-share-xlsx">MR as Excel</Button>
          </>}
          {canSeeStores && <Button size="small" endIcon={<LaunchRounded />} component={Link} to={`${appPath(company, 'material-requests')}?order=${order.id}`}>Open in Stores</Button>}
        </Box>
        {!canView && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Seeing this needs the orders view or the inventory view permission.</Typography>}
        {canView && !canManage && <Typography data-testid="buying-readonly" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>{NO_MANAGE}</Typography>}
        {refusal && (
          <Alert severity="warning" className="cfm-fade-in" data-testid="buying-refusal" action={<Button color="inherit" size="small" onClick={() => { setRefusal(null); reload(); }}>Reload</Button>}>
            <Box>{refusal.message}</Box>
            {refusal.problems.filter((p) => p !== refusal.message).map((p) => <Box key={p} sx={{ fontSize: 12.5 }}>{p}</Box>)}
          </Alert>
        )}
        <ErrorNotice error={need.error ?? reqs.error} onRetry={reload} />
        {canView && !req && !need.error && <SkeletonBlock h={160} r={8} />}

        {/* What is needed, against what the store has. */}
        {req && (req.items.length === 0
          ? <Typography data-testid="required-empty" sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
              {req.lines.find((l) => l.why)?.why ?? 'Nothing to show yet — the material is known once the design is frozen and nested.'}
            </Typography>
          : (
            <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
              <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }} data-testid="required-table">
                <thead>
                  <tr>
                    {['Item', 'Lines', 'Needed', 'In store', 'Short'].map((h, i) => (
                      <Box component="th" key={h} sx={{ ...cellSx, textAlign: i > 1 ? 'right' : 'left', fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)', background: 'var(--c-surface-2)' }}>
                        {h}{h === 'In store' && <Box component="span" sx={{ ml: 0.5 }}><InfoTip size={14} text="Free stock in the stores now — not earmarked for anything else. The customer's own material for this order counts too. Nothing is held by looking at it." /></Box>}
                      </Box>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {req.items.map((m) => (
                    <tr key={m.item.id} data-testid="required-row">
                      <Box component="td" sx={cellSx}>
                        <Box sx={{ fontWeight: 500 }}>{m.item.name ?? m.item.code}</Box>
                        {m.item.code && m.item.name && <Mono muted sx={{ fontSize: 12 }}>{m.item.code}</Mono>}
                      </Box>
                      <Box component="td" sx={{ ...cellSx, color: 'var(--c-text-2)' }}>{m.lines.join(', ')}</Box>
                      <Box component="td" sx={{ ...cellSx, textAlign: 'right' }}><Mono>{fmtQty(m.need)}</Mono> <Mono muted>{m.item.uom ?? ''}</Mono></Box>
                      <Box component="td" sx={{ ...cellSx, textAlign: 'right' }}><Mono>{fmtQty(m.inStore)}</Mono></Box>
                      <Box component="td" sx={{ ...cellSx, textAlign: 'right' }}>
                        {m.short > 0 ? <Mono sx={{ color: 'var(--c-danger-600)', fontWeight: 600 }}>{fmtQty(m.short)}</Mono> : <Mono muted>—</Mono>}
                      </Box>
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Box>
          ))}

        {data && !requisitions.length && !without.length && (
          <Typography data-testid="buying-empty" sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{data.reason ?? 'No line of this order buys any material.'}</Typography>
        )}
        {/* The material requests raised, and the lines without one. */}
        {data && requisitions.length > 0 && (
          <Box data-testid="mr-status" sx={{ display: 'grid', gap: 0.75 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Material requests</Typography>
            {requisitions.map((r) => {
              const pr = prOf.get(r.id) ?? null;
              return (
                <Box key={r.id} data-testid="mr-status-row" data-mr={r.id} className={freshMrs.has(String(r.id)) ? 'cfm-rise-in' : undefined} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <Mono chip><Box component={Link} to={appPath(company, `material-requests/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono>
                  <Typography component="span" sx={{ fontSize: 13 }}>Line {r.line.lineNo}</Typography>
                  {r.supply === 'customer' && <Badge family="info" label="Customer supplies" />}
                  {r.heldForAcceptance && <Badge family="warning" noIcon label="Held until the order is confirmed" />}
                  <Badge family={r.done ? 'success' : 'warning'} noIcon label={r.statusLabel} />
                  <Mono muted>{lockedWords(r)}</Mono>
                  {pr && <><Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${pr.id}`)} sx={linkSx}>{pr.code}</Box></Mono><PrStatusBadge status={pr.status} /></>}
                  {r.materialReady && <MaterialReadyChip state={r.materialReady.state} date={r.materialReady.readyDate} text={r.materialReady.text} testId="mr-ready" load={() => getLineMaterialReady(r.line.id).then((x) => x.materials)} />}
                </Box>
              );
            })}
          </Box>
        )}
        {data && without.length > 0 && (
          <Box data-testid="lines-without" sx={{ display: 'grid', gap: 1 }}>
            {without.map((w) => <LineWithoutRow key={w.line.id} w={w} canManage={canManage} canRequest={canRequest} busy={busy} orderSupply={orderSupply} onSupply={(v) => void changeSupply(w.line.id, v)} onRaise={(el) => { raiseButton.current = el ?? null; void raise([w.line.id]); }} />)}
          </Box>
        )}
      </Box>
      <PromisedDateDialog open={!!asking} proposed={asking?.proposed ?? null} onClose={() => setAsking(null)}
        onConfirm={async (date) => { const a = asking; setAsking(null); await raiseNow(a?.lineIds, date); }} />
    </SectionCard>
  );
}

/** A line of the order with no MR yet: who supplies it (changeable until raised), and Raise MR — or why it cannot be. */
function LineWithoutRow({ w, canManage, canRequest, busy, orderSupply, onSupply, onRaise }: {
  w: LineWithout; canManage: boolean; canRequest: boolean; busy: boolean; orderSupply: MaterialSupply; onSupply: (v: string) => void; onRaise: (button?: HTMLElement) => void;
}) {
  const mr = w.materialReady;
  return (
    <Box data-testid="line-without" data-line={w.line.id} sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 13.5 }}><strong>Line {w.line.lineNo}</strong>{w.line.name ? ` · ${w.line.name}` : ''} </Typography>
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
        ? canManage && canRequest && <Button size="small" variant="outlined" startIcon={<PlaylistAddCheckRounded />} disabled={busy} onClick={(e) => onRaise(e.currentTarget)}>Create for this line</Button>
        : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{w.reason}</Typography>}
    </Box>
  );
}
