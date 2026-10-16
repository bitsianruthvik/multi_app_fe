import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, useMediaQuery, useTheme } from '@mui/material';
import { getUnit, type StockUnit } from '../api/stockView';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { dayText } from '../lib/money';
import { UNIT_STATUS_FAMILY, UNIT_STATUS_LABEL, partyName } from '../lib/stockView';
import { Badge, ErrorNotice, Fact, Mono, SkeletonRows } from './ui';

export function UnitStatusBadge({ status }: { status: StockUnit['status'] }) {
  return <Badge family={UNIT_STATUS_FAMILY[status] ?? 'neutral'} label={UNIT_STATUS_LABEL[status] ?? status} />;
}

const linkSx = { font: 'inherit', color: 'var(--c-primary-700)', background: 'none', border: 0, p: 0, cursor: 'pointer', textDecoration: 'underline dotted' };

/** A piece's code that opens that piece's history. */
function PieceLink({ id, code, onOpen }: { id: number; code: string | null; onOpen: (id: number) => void }) {
  return <Box component="button" type="button" data-testid="piece-link" onClick={() => onOpen(id)} sx={linkSx}><Mono>{code ?? `#${id}`}</Mono></Box>;
}

function PieceBody({ id, onOpen }: { id: number; onOpen: (id: number) => void }) {
  const company = useCompanySlug();
  const d = useLoad(() => getUnit(id), [id]);
  if (d.error) return <ErrorNotice error={d.error} onRetry={d.reload} />;
  if (!d.data) return <SkeletonRows rows={4} />;
  const { unit: u, history, inside, madeAgainAs } = d.data;
  const oldestFirst = [...history].sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id - b.id);
  return (
    <Box sx={{ display: 'grid', gap: 2, minWidth: 0, overflowWrap: 'anywhere' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        <Fact label="Piece"><Mono>{u.code}</Mono></Fact>
        <Fact label="Item"><Mono>{u.item.code}</Mono> {u.item.name}</Fact>
        <Fact label="Status"><UnitStatusBadge status={u.status} /></Fact>
        <Fact label="Where it is">{u.area ? `${u.area.code} · ${u.area.name}` : 'Not in any area'}</Fact>
        <Fact label="Owner">{partyName(u.owner)}</Fact>
        <Fact label="Order">{u.order ? <><Link to={appPath(company, `orders/${u.order.id}`)}><Mono>{u.order.code}</Mono></Link>{u.order.lineNo != null && ` · line ${u.order.lineNo}`}</> : '—'}</Fact>
        {u.batch && <Fact label="Lot"><Link to={appPath(company, `batches/${u.batch.id}`)}><Mono>{u.batch.code}</Mono></Link></Fact>}
        {u.parent && <Fact label="Inside piece"><PieceLink id={u.parent.id} code={u.parent.code} onOpen={onOpen} /></Fact>}
      </Box>
      {u.replaces && (
        <Typography data-testid="piece-replaces" sx={{ fontSize: 13 }}>Made again in place of <PieceLink id={u.replaces.id} code={u.replaces.code} onOpen={onOpen} />.</Typography>
      )}
      {madeAgainAs.length > 0 && (
        <Typography data-testid="piece-replaced-by" sx={{ fontSize: 13 }}>
          Replaced by {madeAgainAs.map((m, i) => <span key={m.id}>{i > 0 && ', '}<PieceLink id={m.id} code={m.code} onOpen={onOpen} /></span>)}.
        </Typography>
      )}
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>History, oldest first</Typography>
        {oldestFirst.length === 0 ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Nothing recorded yet.</Typography> : (
          <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.75 }}>
            {oldestFirst.map((e) => (
              <Box component="li" key={e.id} data-testid="piece-event" sx={{ fontSize: 13 }}>
                <Box component="span" sx={{ color: 'var(--c-text-3)', mr: 1 }}>{dayText(e.at)}</Box>
                <b>{e.words}</b>
                {e.movement && <> · <Link to={appPath(company, `movements/${e.movement.id}`)}><Mono>{e.movement.code}</Mono></Link></>}
                {(e.from || e.to) && <> · {e.from?.code ?? '—'} → {e.to?.code ?? '—'}</>}
                {e.parent && <> · into <PieceLink id={e.parent.id} code={e.parent.code} onOpen={onOpen} /></>}
                {e.note && <Box component="span" sx={{ color: 'var(--c-text-2)' }}> · {e.note}</Box>}
              </Box>
            ))}
          </Box>
        )}
      </Box>
      {inside.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>Pieces inside it</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
            {inside.map((p) => (
              <Box component="li" key={p.id} data-testid="piece-inside" sx={{ fontSize: 13 }}>
                <PieceLink id={p.id} code={p.code} onOpen={onOpen} /> · {p.item.name} · <UnitStatusBadge status={p.status} />
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** One piece and what happened to it (GET /stock/units/:id). A piece named inside opens its own history here. */
export function PieceHistoryDialog({ unitId, onClose }: { unitId: number | null; onClose: () => void }) {
  const theme = useTheme();
  const small = useMediaQuery(theme.breakpoints.down('sm'));
  const [trail, setTrail] = useState<number[]>([]);
  const [openFor, setOpenFor] = useState<number | null>(unitId);
  if (openFor !== unitId) { setOpenFor(unitId); setTrail([]); }
  const current = trail.length ? trail[trail.length - 1] : unitId;
  return (
    <Dialog open={unitId != null} onClose={onClose} fullWidth maxWidth="md" fullScreen={small} PaperProps={{ 'data-testid': 'piece-dialog' } as object}>
      <DialogTitle>Piece history</DialogTitle>
      <DialogContent dividers>
        {current != null && <PieceBody key={current} id={current} onOpen={(id) => setTrail((t) => [...t, id])} />}
      </DialogContent>
      <DialogActions>
        {trail.length > 0 && <Button onClick={() => setTrail((t) => t.slice(0, -1))}>Back</Button>}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
