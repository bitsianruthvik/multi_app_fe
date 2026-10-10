import { Box, Button, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import { getLineMaterialReady, type ReqLine, type Requisition } from '../../api/requisitions';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { coverChips, lineCanBuy, lineIsOpen, reqTone, type CoverChip } from '../../lib/requisition';
import { qtyText } from '../../lib/inventory';
import { Badge, Mono } from '../ui';
import { MaterialReadyChip } from './MaterialReadyChip';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const tableSx = { width: '100%', borderCollapse: 'collapse', fontSize: 13, '& td, & th': { py: 0.75, px: 0.75, borderBottom: '1px solid var(--c-divider)', textAlign: 'left', verticalAlign: 'top' }, '& th': { color: 'var(--c-text-3)', fontWeight: 500 } } as const;

const CHIP_COLOUR: Record<CoverChip['tone'], { bg: string; fg: string }> = {
  success: { bg: 'var(--c-success-50)', fg: 'var(--c-success-800)' },
  info: { bg: 'var(--c-info-50)', fg: 'var(--c-info-800)' },
  warning: { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
  danger: { bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)' },
  neutral: { bg: 'var(--c-surface-2)', fg: 'var(--c-text-2)' },
};

/** One way the material is covered. A PO chip opens its purchase order; the words carry the meaning, the colour only helps. */
export function CoverChipView({ chip }: { chip: CoverChip }) {
  const company = useCompanySlug();
  const c = CHIP_COLOUR[chip.tone];
  const sx = { display: 'inline-flex', alignItems: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', px: 0.75, py: '2px', borderRadius: 'var(--r-sm)', background: c.bg, color: c.fg, whiteSpace: 'nowrap', border: '1px solid transparent' } as const;
  return (
    <Tooltip title={chip.title ?? ''}>
      {chip.poId
        ? <Box component={Link} to={appPath(company, `purchase-orders/${chip.poId}`)} data-testid="cover-chip" data-kind={chip.kind} sx={{ ...sx, textDecoration: 'none', '&:hover': { borderColor: c.fg } }}>{chip.label}</Box>
        : <Box component="span" data-testid="cover-chip" data-kind={chip.kind} sx={sx}>{chip.label}</Box>}
    </Tooltip>
  );
}

export interface RowActions {
  onCheck: (line: ReqLine) => void;
  onSkip: (line: ReqLine) => void;
  onUnskip: (line: ReqLine) => void;
  onBuy: (line: ReqLine) => void;
  onExcess: (line: ReqLine) => void;
}

/**
 * The requisition of one sales-order line as a table: a row per material — what it needs, and how that is covered,
 * one chip per source (stock held, each purchase order with its quantity and date, skipped, what is still open).
 * Every state and sentence is the server's.
 */
export function RequisitionBlock({ req, canManage, busy, actions, onRefresh }: {
  req: Requisition;
  canManage: boolean;
  busy: boolean;
  actions: RowActions;
  onRefresh: () => void;
}) {
  const company = useCompanySlug();
  const tone = reqTone(req.status);
  const mr = req.materialReady;
  const refresh = canManage && (req.stale || req.missing.length > 0);
  return (
    <Box data-testid="requisition" data-id={req.id} data-status={req.status} sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mono sx={{ fontWeight: 600 }}>{req.code}</Mono>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          <Box component={Link} to={appPath(company, `orders/${req.order.id}`)} sx={linkSx}>Line {req.line.lineNo}</Box>{req.line.name ? ` · ${req.line.name}` : ''}
        </Typography>
        <Badge family={tone} label={req.statusLabel} />
        {mr && (
          <MaterialReadyChip state={mr.state} date={mr.readyDate} text={mr.text} testId="req-ready"
            load={() => getLineMaterialReady(req.line.id).then((r) => r.materials)} />
        )}
        {refresh && (
          <Tooltip title={req.missing.length ? 'The line needs a material that has no row here yet.' : 'The line’s material has changed since this was raised.'}>
            <span><Button size="small" startIcon={<SyncRounded />} disabled={busy} onClick={onRefresh}>Bring up to date</Button></span>
          </Tooltip>
        )}
      </Box>
      <Typography data-testid="req-sentence" sx={{ fontSize: 13.5 }}>{req.sentence}</Typography>
      {!req.needKnown && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>The design is not frozen again yet, so the need below is the last one raised.</Typography>}
      {req.needKnown && !req.needComplete && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>A cut plate has no plate yet. Nest the line to see all its material.</Typography>}
      {req.lines.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>This line needs no material.</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" data-testid="req-table" sx={tableSx}>
            <thead><tr><th>Material</th><th style={{ textAlign: 'right' }}>Needed</th><th>How it is covered</th>{canManage && <th />}</tr></thead>
            <tbody>
              {req.lines.map((l) => {
                const chips = coverChips(l);
                return (
                  <tr key={l.id} data-testid="req-row" data-line={l.id} data-status={l.status}>
                    <td>
                      <Mono><Box component={Link} to={appPath(company, `items/${l.item.id}`)} sx={linkSx}>{l.item.code ?? l.item.name}</Box></Mono>
                      {l.item.code && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{l.item.name}</Box>}
                    </td>
                    <td style={{ textAlign: 'right' }}><Mono>{qtyText(l.need)}</Mono> <Mono muted>{l.item.uom}</Mono></td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {chips.map((c) => <CoverChipView key={c.key} chip={c} />)}
                        {chips.length === 0 && <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Nothing yet</Typography>}
                      </Box>
                      <Typography data-testid="row-sentence" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>{l.sentence}</Typography>
                    </td>
                    {canManage && (
                      <td>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {(l.cover.open > 0 || l.skipped) && l.status !== 'not_needed' && (
                            <Button size="small" variant="outlined" startIcon={<Inventory2Rounded />} disabled={busy} onClick={() => actions.onCheck(l)}>Check stock</Button>
                          )}
                          {lineCanBuy(l) && <Button size="small" variant="outlined" startIcon={<ShoppingCartRounded />} disabled={busy} onClick={() => actions.onBuy(l)}>Buy…</Button>}
                          {lineIsOpen(l) && <Button size="small" startIcon={<SkipNextRounded />} disabled={busy} onClick={() => actions.onSkip(l)}>Skip</Button>}
                          {l.skipped && <Button size="small" startIcon={<UndoRounded />} disabled={busy} onClick={() => actions.onUnskip(l)}>Undo skip</Button>}
                          {l.cover.over > 0 && <Button size="small" color="warning" disabled={busy} onClick={() => actions.onExcess(l)}>Release excess</Button>}
                        </Box>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Box>
        </Box>
      )}
    </Box>
  );
}
