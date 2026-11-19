import { Box, Dialog, DialogContent, Typography, useMediaQuery } from '@mui/material';
import { Link } from 'react-router-dom';
import { getItemLedger, qtyText, type LedgerEvent } from '../../api/storesDesk';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { DialogHeader } from '../FormDialog';
import { Badge, ErrorNotice, Mono, SkeletonRows } from '../ui';

const TYPE_WORD: Record<string, string> = { receipt: 'Received', issue: 'Given out', transfer: 'Moved', adjustment: 'Count', scrap: 'Scrapped', return: 'Returned to customer' };
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
                  {v.lots.slice(0, 12).map((b) => <Box key={`${b.id}-${b.area.id}`} sx={line}><span><Mono>{b.code}</Mono>{b.supplierRef ? ` · ${b.supplierRef}` : ''}<Box component="span" sx={{ color: 'var(--c-text-3)' }}> · {b.area.name}</Box></span><Mono>{qtyText(b.quantity)}</Mono></Box>)}
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
                  <Mono sx={{ whiteSpace: 'nowrap', color: e.change < 0 ? 'var(--c-danger-700)' : undefined }}>{e.change > 0 ? '+' : ''}{qtyText(e.change)}</Mono>
                </Box>
              ))}
            </Block>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
