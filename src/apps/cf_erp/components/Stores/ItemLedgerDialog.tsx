import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogContent, TextField, Typography, useMediaQuery } from '@mui/material';
import { Link } from 'react-router-dom';
import { takeBack, askReservedUse, getItemLedger, getReservedFor, listReservedUse, qtyText, withdrawReservedUse, type LedgerEvent } from '../../api/storesDesk';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import type { CfApiError } from '../../api/client';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { DialogHeader } from '../FormDialog';
import { Badge, ErrorNotice, Mono, SkeletonRows } from '../ui';

const TYPE_WORD: Record<string, string> = { receipt: 'Received', issue: 'Given out', transfer: 'Moved', adjustment: 'Audit', scrap: 'Scrapped', return: 'Returned to customer' };
const eventWord = (e: LedgerEvent) => (e.returnIn ? 'Came back' : TYPE_WORD[e.type] ?? e.type);
const eventFor = (e: LedgerEvent) => [e.given?.label, e.person, e.machine, e.reason, e.reference].filter(Boolean).join(' · ');

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75 }}>{title}</Typography>
      {children}
    </Box>
  );
}
const line = { display: 'flex', justifyContent: 'space-between', gap: 1.5, py: 0.75, borderBottom: '1px solid var(--c-divider)', fontSize: 13.5, '&:last-child': { borderBottom: 0 } } as const;

/** Everything behind one row of the ledger: where it is, each event of the period, who holds some, what is on order. Read only. */
export function ItemLedgerDialog({ itemId, from, to, onClose }: { itemId: number | null; from: string; to: string; onClose: () => void }) {
  const company = useCompanySlug();
  const phone = useMediaQuery('(max-width:700px)');
  const d = useLoad(() => (itemId ? getItemLedger(itemId, { from, to }) : Promise.resolve(null)), [itemId, from, to]);
  const v = itemId && d.data?.item.id === itemId ? d.data : null;
  // §115: who the stock is reserved for, and Stores asking planning and production to use some of it.
  const can = useIsPermitted();
  const canAsk = can('cf_erp_stores') || can('cf_erp_inventory_manage');
  const held = useLoad(() => (itemId ? getReservedFor(itemId) : Promise.resolve([])), [itemId]);
  const asks = useLoad(() => (itemId ? listReservedUse({ itemId, status: 'all' }) : Promise.resolve({ rows: [] })), [itemId]);
  const [asking, setAsking] = useState(false);
  const [askQty, setAskQty] = useState('');
  const [askWhy, setAskWhy] = useState('');
  const [askErr, setAskErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAsking(false); setAskQty(''); setAskWhy(''); setAskErr(null); }, [itemId]);
  // 2026-11-22: take back what was given out and not used — a quantity on the give-out's own line.
  const [backOf, setBackOf] = useState<number | null>(null);
  const [backQty, setBackQty] = useState('');
  const [backErr, setBackErr] = useState<string | null>(null);
  useEffect(() => { setBackOf(null); setBackQty(''); setBackErr(null); }, [itemId]);
  const sendBack = async (movementId: number) => {
    if (!itemId) return;
    setBusy(true); setBackErr(null);
    try { await takeBack({ movementId, itemId, quantity: Number(backQty) }); setBackOf(null); setBackQty(''); d.reload(); }
    catch (e) { setBackErr((e as CfApiError).message); } finally { setBusy(false); }
  };
  const pending = (asks.data?.rows ?? []).find((r) => r.status === 'pending') ?? null;
  const lastAsk = (asks.data?.rows ?? [])[0] ?? null;
  const sendAsk = async () => {
    if (!itemId) return;
    setBusy(true); setAskErr(null);
    try { await askReservedUse({ itemId, quantity: Number(askQty), reason: askWhy.trim() }); setAsking(false); asks.reload(); }
    catch (e) { setAskErr((e as CfApiError).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!itemId} onClose={onClose} fullWidth maxWidth="md" fullScreen={phone}>
      <DialogHeader title={v ? v.item.name : 'Item'} onClose={onClose}
        subtitle={v ? `${v.item.code ?? ''}${v.item.min != null ? ` · minimum ${qtyText(v.item.min)} ${v.item.uom}` : ''}${v.item.returnable ? ' · comes back' : ''}` : undefined} />
      <DialogContent sx={{ display: 'grid', gap: 2.5, pt: 1 }} data-testid="item-ledger">
        <ErrorNotice error={d.error} onRetry={d.reload} />
        {!v && !d.error && <SkeletonRows rows={6} />}
        {v && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2.5 }}>
              <Block title="Where it is">
                {v.areas.length === 0 && <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>None in any area.</Typography>}
                {v.areas.map((a) => <Box key={a.id} sx={line}><span>{a.name}{!a.store && <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · {a.purpose}</Box>}</span><Mono>{qtyText(a.quantity)} {v.item.uom}</Mono></Box>)}
              </Block>
              {(held.data?.length ?? 0) > 0 && (
                <Block title="Reserved for">
                  <Box data-testid="reserved-for">
                    {held.data!.map((h) => <Box key={h.reservationId} sx={line}><span>{h.order?.code ?? 'An order'}<Box component="span" sx={{ color: 'var(--c-text-3)' }}>{h.hold ? ' · held from a purchase' : ' · released to production'}</Box></span><Mono>{qtyText(h.quantity)} {v.item.uom}</Mono></Box>)}
                    {pending && (
                      <Box sx={{ mt: 1, fontSize: 13 }}>
                        <b>{pending.code}</b> asks for {qtyText(pending.quantity)} {v.item.uom}: planning {pending.planning ? 'approved' : 'waiting'}, production {pending.production ? 'approved' : 'waiting'}.
                        {canAsk && <Button size="small" sx={{ ml: 1 }} onClick={async () => { await withdrawReservedUse(pending.id); asks.reload(); }}>Take back</Button>}
                      </Box>
                    )}
                    {!pending && lastAsk && lastAsk.status !== 'withdrawn' && (
                      <Typography sx={{ mt: 1, fontSize: 12.5, color: 'var(--c-text-2)' }}>{lastAsk.code}: {lastAsk.status}{lastAsk.decisionNote ? ` — ${lastAsk.decisionNote}` : ''}{lastAsk.status === 'approved' ? ' — issue it on its material request' : ''}</Typography>
                    )}
                    {canAsk && !pending && !asking && <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setAsking(true)} data-testid="reserved-ask">Ask to use reserved stock</Button>}
                    {asking && (
                      <Box sx={{ mt: 1, display: 'grid', gap: 1 }}>
                        <TextField size="small" label={`Quantity needed (${v.item.uom})`} value={askQty} onChange={(e) => setAskQty(e.target.value)} inputProps={{ inputMode: 'decimal' }} />
                        <TextField size="small" label="Why is it needed now?" value={askWhy} onChange={(e) => setAskWhy(e.target.value)} multiline minRows={2} helperText="Planning and production both approve. Purchase is told what the order is then short of." />
                        {askErr && <Typography sx={{ fontSize: 13, color: 'var(--c-danger-600)' }}>{askErr}</Typography>}
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button size="small" variant="contained" disabled={busy || !(Number(askQty) > 0) || !askWhy.trim()} onClick={() => void sendAsk()}>Send for approval</Button>
                          <Button size="small" onClick={() => setAsking(false)}>Cancel</Button>
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Block>
              )}
              {v.outWith.length > 0 && (
                <Block title="Out with">
                  {v.outWith.map((c) => <Box key={c.id} sx={line}><span>{c.holder ?? c.holderType}<Box component="span" sx={{ color: 'var(--c-text-3)' }}> · since {c.issuedOn}</Box></span><Mono>{qtyText(c.left)}</Mono></Box>)}
                </Block>
              )}
              {v.onOrder.length > 0 && (
                <Block title="On order">
                  {v.onOrder.map((o) => <Box key={o.id} sx={line}><span>{o.code}{o.supplier ? ` · ${o.supplier}` : ''}<Box component="span" sx={{ color: 'var(--c-text-3)' }}>{o.expected ? ` · due ${o.expected}` : ''}</Box></span><Mono>{qtyText(o.quantity)}</Mono></Box>)}
                </Block>
              )}
              {v.lots.length > 0 && (
                <Block title="Lots in the store">
                  {v.lots.slice(0, 12).map((b) => <Box key={`${b.id}-${b.area.id}`} sx={line}><span><Mono>{b.code}</Mono>{b.brand ? ` · ${b.brand.name}` : ''}{b.vendor ? ` · from ${b.vendor.name}` : ''}{b.supplierRef ? ` · ${b.supplierRef}` : ''}<Box component="span" sx={{ color: 'var(--c-text-3)' }}>{b.receivedOn ? ` · in ${b.receivedOn}` : ''} · {b.area.name}</Box></span><Mono>{qtyText(b.quantity)}</Mono></Box>)}
                  {v.lots.length > 12 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>and {v.lots.length - 12} more</Typography>}
                </Block>
              )}
            </Box>
            <Block title={`What happened · ${v.period.from} to ${v.period.to}`}>
              {v.events.length === 0 && <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing moved in this period.</Typography>}
              {v.events.map((e) => (
                <Box key={e.id} sx={{ ...line, alignItems: 'baseline', opacity: e.reversed || e.reversal ? 0.55 : 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Mono muted>{e.date}</Mono><span>{eventWord(e)}</span>
                      {(e.reversed || e.reversal) && <Badge family="neutral" label={e.reversal ? 'Reversal' : 'Reversed'} noIcon />}
                      <Link to={appPath(company, `movements/${e.movementId}`)} style={{ fontSize: 12.5, color: 'var(--c-primary-700)' }}>{e.code}</Link>
                    </Box>
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{[eventFor(e), e.area, e.lot, e.by ? `by ${e.by}` : null].filter(Boolean).join(' · ')}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Mono sx={{ color: e.change < 0 ? 'var(--c-danger-700)' : undefined }}>{e.change > 0 ? '+' : ''}{qtyText(e.change)}</Mono>
                    {canAsk && e.type === 'issue' && e.change < 0 && !e.reversed && !e.reversal && !v.item.returnable && backOf !== e.id && (
                      <Box><Button size="small" onClick={() => { setBackOf(e.id); setBackQty(''); setBackErr(null); }} data-testid="take-back">Take back</Button></Box>
                    )}
                    {backOf === e.id && (
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', justifyContent: 'flex-end', mt: 0.5, flexWrap: 'wrap' }}>
                        <TextField size="small" label={`Came back (${v.item.uom})`} value={backQty} onChange={(ev) => setBackQty(ev.target.value)} sx={{ width: 130 }} autoFocus inputProps={{ inputMode: 'decimal' }} />
                        <Button size="small" variant="contained" disabled={busy || !(Number(backQty) > 0)} onClick={() => void sendBack(e.movementId)}>Save</Button>
                        <Button size="small" onClick={() => setBackOf(null)}>Cancel</Button>
                        {backErr && <Typography sx={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--c-danger-600)', whiteSpace: 'normal' }}>{backErr}</Typography>}
                      </Box>
                    )}
                  </Box>
                </Box>
              ))}
            </Block>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
