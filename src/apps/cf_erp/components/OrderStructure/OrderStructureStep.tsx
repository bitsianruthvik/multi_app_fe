import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Link, useSearchParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ArchitectureRounded from '@mui/icons-material/ArchitectureRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import { cfApi, CfApiError } from '../../api/client';
import { lineLock } from '../../api/lock';
import { movedLine, reorderLines } from '../../api/orderStructure';
import type { OrderProcessView, SalesOrder, SalesOrderLine } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useFullScreen } from '../../hooks/useFullScreen';
import { appPath } from '../../navMeta';
import { recordPath } from '../../lib/paths';
import { LOCKED_STATUSES } from '../../lib/orders';
import { rateText } from '../../lib/money';
import { standardLabel } from '../../api/standards';
import { definitionLabel } from '../../lib/displayCode';
import { fixedNumberWhy, lineGroupWords, openGroupsAtStart, readOpenGroups, writeOpenGroups } from '../../lib/orderStructure';
import { ORDER_VALUES_PARAM } from '../../lib/process';
import { Badge, EmptyState, ErrorNotice, Mono, SectionCard } from '../ui';
import { FullScreenFrame, FullScreenToggle } from '../FullScreen';
import { BomPanel } from '../Bom/BomPanel';
import { StandardLineBanner } from '../StandardLineBanner';
import { OrderTotalBar } from '../OrderTotalBar';
import { OrderSpecValuesPanel } from '../OrderSpecValuesPanel';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../toastContext';
import { AddLineDialog, EditOrderLineDialog, StandardLineDialog, LineStructureText } from './LineDialogs';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * STRUCTURE & VALUES — the sales order's FIRST step (user, 2026-10-18: "merge Line items and Structure, with
 * Values, into ONE first step that captures the ENTIRE order's structure and values in one view"). Every line of
 * the order is a top-level GROUP here: its header row says what it sells, how many, its price and state, with the
 * line's own actions (move up / down, change, standard drawing, remove); under it, the line's own grid — every row
 * with its values beside it, amber where a required one is still empty. New lines are added right here, from the
 * catalog, a template or a standard drawing. The order's own values (for every line) open above the lines.
 *
 * Each line's grid is the same BomPanel a line always had, so editing, Excel upload, drawings and linked copies all
 * work as before; a line's group can be folded away (remembered in this browser). Full screen fills the window.
 */
export function OrderStructureStep({ order, view, onOrderSaved, onChanged, onGoCutPieces }: {
  order: SalesOrder;
  /** The order's process answer, for each line's Structure & values marks (null without a process). */
  view: OrderProcessView | null;
  onOrderSaved: (o: SalesOrder) => void;
  /** A grid saved: the order and its stages are read again. */
  onChanged: () => void;
  onGoCutPieces?: () => void;
}) {
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const full = useFullScreen('so-structure');
  const lines = order.lines ?? [];
  const stopped = LOCKED_STATUSES.includes(order.status);
  const editable = isPermitted('cf_erp_orders_manage') && !stopped;
  const [open, setOpen] = useState<Set<number>>(() => readOpenGroups(order.id) ?? openGroupsAtStart(lines));
  const [adding, setAdding] = useState<'catalog' | 'standard' | null>(null);
  const [editing, setEditing] = useState<SalesOrderLine | null>(null);
  const [removing, setRemoving] = useState<SalesOrderLine | null>(null);
  const [standardOf, setStandardOf] = useState<SalesOrderLine | null>(null);
  // Open at once when the address asks (an old link to the Order values tab — OrderDetail).
  const [params] = useSearchParams();
  const [valuesOpen, setValuesOpen] = useState(() => params.get(ORDER_VALUES_PARAM) === '1');
  const [moveError, setMoveError] = useState<CfApiError | null>(null);
  const [moving, setMoving] = useState(false);

  // A line added since the groups were remembered opens by itself.
  const ids = lines.map((l) => l.id).join(',');
  useEffect(() => {
    setOpen((cur) => {
      const known = readOpenGroups(order.id, { knownOnly: true });
      const next = new Set(cur);
      for (const l of lines) if (known && !known.has(l.id) && !cur.has(l.id)) next.add(l.id);
      return next;
    });
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { writeOpenGroups(order.id, open, lines.map((l) => l.id)); }, [open, order.id, ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (lineId: number) => setOpen((cur) => { const next = new Set(cur); if (next.has(lineId)) next.delete(lineId); else next.add(lineId); return next; });
  const fixedNumber = (l: SalesOrderLine) => !!fixedNumberWhy(l, !!lineLock(l));
  const move = async (index: number, dir: -1 | 1) => {
    setMoving(true); setMoveError(null);
    try {
      onOrderSaved(await reorderLines(order.id, movedLine(lines.map((l) => l.id), index, dir)));
    } catch (e) { setMoveError(e as CfApiError); } finally { setMoving(false); }
  };
  const lineStages = (lineId: number) => view?.lines.find((x) => x.lineId === lineId)?.stages ?? [];

  const addButtons = editable && (
    <>
      <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setAdding('catalog')} data-testid="add-line">Add line</Button>
      {order.orderType !== 'stock' && <Button size="small" startIcon={<ArchitectureRounded />} onClick={() => setAdding('standard')} data-testid="add-from-standard">From a standard drawing</Button>}
    </>
  );

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25, minWidth: 0 }} data-testid="structure-step">
        <SectionCard title="Structure & values"
          subtitle={lines.length
            ? `${lines.length === 1 ? 'The line' : `All ${lines.length} lines`} of the order, each with its parts and values. Fill the amber cells.`
            : 'Add the lines of the order. Each one gets its parts and values here.'}
          actions={(
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
              {addButtons}
              {lines.length > 1 && (
                <>
                  <Tooltip title="Open every line"><IconButton size="small" aria-label="Open every line" onClick={() => setOpen(new Set(lines.map((l) => l.id)))}><UnfoldMoreRounded fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Fold every line"><IconButton size="small" aria-label="Fold every line" onClick={() => setOpen(new Set())}><UnfoldLessRounded fontSize="small" /></IconButton></Tooltip>
                </>
              )}
              <FullScreenToggle on={full.on} onToggle={full.toggle} />
            </Box>
          )}>
          <ErrorNotice error={moveError} />
          {lines.length === 0 ? (
            <EmptyState icon={<AccountTreeRounded />} title="No lines yet"
              hint={order.orderType === 'stock' ? 'Add the catalog items to make for stock.' : 'Add a catalog item, a template (its whole structure is laid out at once) or a standard drawing.'}
              action={addButtons ? <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>{addButtons}</Box> : undefined} />
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5 }}>
              {lines.some((l) => l.lineType === 'custom') && (
                <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
                  <Box component="button" type="button" onClick={() => setValuesOpen((v) => !v)} aria-expanded={valuesOpen} data-testid="order-values-toggle"
                    sx={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.75, fontSize: 13.5, fontWeight: 600, '&:focus-visible': { outline: '2px solid var(--c-primary-500)' } }}>
                    <ChevronRightRounded sx={{ fontSize: 18, transform: valuesOpen ? 'rotate(90deg)' : 'none', transition: 'transform var(--t-fast) var(--ease)' }} aria-hidden />
                    Values for the whole order
                    <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontWeight: 400 }}>— coats, grade, impact class… set once, every line takes them</Typography>
                  </Box>
                  {valuesOpen && <Box sx={{ p: 1, pt: 0 }}><OrderSpecValuesPanel orderId={order.id} canEdit={editable} onChanged={onChanged} /></Box>}
                </Box>
              )}
              {lines.map((l, i) => {
                const isOpen = open.has(l.id);
                const stages = lineStages(l.id);
                const words = lineGroupWords(l, stages);
                const upBlocked = i === 0 || fixedNumber(l) || fixedNumber(lines[i - 1]);
                const downBlocked = i === lines.length - 1 || fixedNumber(l) || fixedNumber(lines[i + 1]);
                // Why a move is not offered: this line's own reason, else the neighbour's.
                const why = (other: SalesOrderLine | undefined) => fixedNumberWhy(l, !!lineLock(l)) ?? (other ? fixedNumberWhy(other, !!lineLock(other)) : null);
                return (
                  <Box key={l.id} data-testid={`line-group-${l.lineNo}`} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, flexWrap: 'wrap', background: 'var(--c-surface-2)', borderBottom: isOpen ? '1px solid var(--c-border)' : 'none', borderRadius: isOpen ? 'var(--r-md) var(--r-md) 0 0' : 'var(--r-md)' }}>
                      <IconButton size="small" onClick={() => toggle(l.id)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Fold' : 'Open'} line ${l.lineNo}`} data-testid={`line-toggle-${l.lineNo}`}>
                        <ChevronRightRounded sx={{ fontSize: 18, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform var(--t-fast) var(--ease)' }} />
                      </IconButton>
                      <Mono muted>Line {l.lineNo}</Mono>
                      <Box sx={{ minWidth: 0, flex: '1 1 260px' }}>
                        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          {l.item
                            ? <Box component={Link} to={appPath(company, recordPath(l.item.kind, l.item.id))} sx={{ ...linkSx, fontSize: 14, fontWeight: 600 }}>{l.item.name ?? l.item.code ?? 'Unnamed item'}</Box>
                            : <Mono muted>—</Mono>}
                          <Mono>×{l.quantity}{l.item?.uom ? ` ${l.item.uom}` : ''}</Mono>
                          {l.rate != null && <Mono muted>{rateText(l.rate, l.rateBasis)}</Mono>}
                        </Box>
                        <Typography component="div" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>
                          {l.lineType === 'custom'
                            ? <>From template {definitionLabel(l.design)} · {l.item?.code ? <Mono>{l.item.code}</Mono> : 'gets its code when the design is frozen'}</>
                            : l.item?.code ? <Mono>{l.item.code}</Mono> : null}
                          {l.standard && (
                            <> · <Box component="span" data-testid="line-standard">From standard <Mono>{standardLabel({ number: l.standard.number, versionNo: l.standard.versionNo })}</Mono>{l.standard.versionNo == null ? ' (BOM not saved to it yet)' : ''}</Box></>
                          )}
                          {l.description ? ` · “${l.description}”` : ''}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        {words.map((w) => <Badge key={w.label} family={w.family} label={w.label} title={w.title} noIcon={w.family === 'neutral'} />)}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {editable && lines.length > 1 && (
                          <>
                            <Tooltip title={upBlocked && i > 0 ? why(lines[i - 1]) ?? 'Move up' : 'Move up'}><span><IconButton size="small" aria-label={`Move line ${l.lineNo} up`} disabled={upBlocked || moving} onClick={() => move(i, -1)}><ArrowUpwardRounded fontSize="small" /></IconButton></span></Tooltip>
                            <Tooltip title={downBlocked && i < lines.length - 1 ? why(lines[i + 1]) ?? 'Move down' : 'Move down'}><span><IconButton size="small" aria-label={`Move line ${l.lineNo} down`} disabled={downBlocked || moving} onClick={() => move(i, 1)}><ArrowDownwardRounded fontSize="small" /></IconButton></span></Tooltip>
                          </>
                        )}
                        {l.lineType === 'custom' && (l.standard || editable) && (
                          <Tooltip title={l.standard ? 'Its standard drawing' : 'Save as a standard drawing'}>
                            <IconButton size="small" aria-label={`Standard drawing of line ${l.lineNo}`} onClick={() => setStandardOf(l)}><ArchitectureRounded fontSize="small" /></IconButton>
                          </Tooltip>
                        )}
                        {editable && <Tooltip title={l.release ? 'Change the price' : 'Change quantity, date or price'}><IconButton size="small" aria-label={`Change line ${l.lineNo}`} onClick={() => setEditing(l)}><EditRounded fontSize="small" /></IconButton></Tooltip>}
                        {editable && !l.release && !lineLock(l) && <Tooltip title="Remove the line"><IconButton size="small" aria-label={`Remove line ${l.lineNo}`} onClick={() => setRemoving(l)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>}
                      </Box>
                    </Box>
                    {isOpen && (
                      <Box sx={{ p: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
                        {l.lineType === 'custom' && l.item
                          ? (
                            <>
                              <StandardLineBanner lineId={l.id} hasStandard={!!l.standard} refreshKey={order} onChanged={onChanged} />
                              <BomPanel key={l.id} source={{ kind: 'orderLine', lineId: l.id }} onChanged={onChanged} onGoCutPieces={onGoCutPieces} />
                            </>
                          )
                          : (
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
                              Sold as it is — nothing to draw. <LineStructureText line={l} />
                            </Box>
                          )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
          {order.total && lines.length > 0 && <OrderTotalBar total={order.total} lineCount={lines.length} />}
        </SectionCard>
      </Box>

      <AddLineDialog order={order} open={!!adding} initialMode={adding ?? 'catalog'} onClose={() => setAdding(null)}
        onDone={(saved, message) => { onOrderSaved(saved); toast.success(message ?? 'Line added.'); }} />
      <StandardLineDialog line={standardOf} order={order} onClose={() => setStandardOf(null)}
        onChanged={() => { void cfApi.get<SalesOrder>(`/orders/${order.id}`).then(onOrderSaved).catch(() => {}); }} />
      <EditOrderLineDialog line={editing} onClose={() => setEditing(null)} onDone={(saved) => { onOrderSaved(saved); toast.success('Line saved.'); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove line" title="Remove this line?"
        entityName={removing ? `${order.code} · line ${removing.lineNo} · ${removing.item?.code ?? removing.item?.name ?? ''}` : undefined}
        body={removing?.lineType === 'custom'
          ? `${removing.item?.code ?? removing.item?.name ?? 'Its structure'} and every row below it exist only for this order, so they are deleted with the line.`
          : 'The line goes; the catalog item stays.'}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { onOrderSaved(await cfApi.del<SalesOrder>(`/order-lines/${removing?.id}`)); toast.success('Line removed.'); }} />
    </FullScreenFrame>
  );
}
