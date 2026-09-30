import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import ContentCutRounded from '@mui/icons-material/ContentCutRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { cfApi, CfApiError, LONG_WRITE_MS } from '../../api/client';
import { plateText } from '../../lib/cutPieces';
import { Badge, EmptyState, ErrorNotice, Mono, SectionCard } from '../ui';
import { useToast } from '../toastContext';

/**
 * The Cut pieces stage: the rectangles a line's plate parts are cut from.
 *
 * MADE AUTOMATICALLY (user, 2026-09-26): "Once the values screen is completed,
 * then cut pieces should get created." The server makes them as soon as the
 * line's required values are complete, and again whenever a value or the
 * structure changes — until the line is locked (cutPlateService
 * .refreshCutPieces). So this screen mostly REPORTS: what is there, whether it
 * still matches the parts, when it was made, and — while values are missing —
 * how many, with the way to the Values stage. "Make them now" stays as a small
 * fallback, for when the automatic run could not (a setup gap it said out loud)
 * or somebody wants them before the last optional value is in.
 *
 * WHY THIS IS A SCREEN OF ITS OWN AND NOT A CORNER OF NESTING. Making them
 * WRITES — a temporary item per rectangle, an area-fraction quantity on each —
 * and the nesting screen's contract is that opening it changes nothing.
 */

/**
 * One cut piece as `GET /order-lines/:id/cut-plates` returns it — the shape of
 * cutPlateService.describe(). The sizes are NESTED under `size`; an earlier
 * version of this panel read them flat and every column came out as a dash.
 */
type Blank = {
  id: number;
  code: string | null;
  name: string | null;
  size: { thickness: number | null; length: number | null; width: number | null; grade: string | null };
  partCount: number;
  /** The cut piece's raw-plate line. `isSelection` (when the API says so) means it only holds the plate CHOICE — nesting picks the plate. */
  plate: { id: number; code: string | null; name: string | null; isSelection?: boolean } | null;
  /** Once nested: the nest lot (the sheet this piece is cut from), e.g. "N-012". */
  nest?: { nestNo?: string | null; code?: string | null } | null;
  plateQuantity: number | null;
  /** 'nesting' once an accepted layout owns the quantity; otherwise how the placeholder was worked out. */
  plateQuantityBasis: string | null;
  note: string | null;
};

/** What the screen is told beside the cut pieces (cutPlateService.getCutPlates). */
type CutPieces = {
  cutPlates: Blank[];
  partsWithoutBlank?: { id: number; code: string | null; name: string | null; missing: string[] }[];
  /** Why they are frozen: the order is closed, the line released, or the line locked. */
  lock?: { reason: 'closed' | 'released' | 'locked'; message: string } | null;
  /** Required values still empty on the line's own rows (not the cut pieces'); null when it does not apply. */
  values?: { missing: number; items: number; complete: boolean } | null;
  /** Whether making them again would change nothing; null when that cannot be worked out. */
  upToDate?: boolean | null;
  lastMadeAt?: string | null;
  parts?: number;
};

type Derived = { cutPlates?: Blank[]; created?: number; updated?: number; removed?: unknown[]; changed?: boolean };

const mm = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(Number(v))));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "4 minutes ago" — a person reads when, not a timestamp; the timestamp is on hover. */
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${plural(m, 'minute')} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${plural(h, 'hour')} ago`;
  return `${plural(Math.round(h / 24), 'day')} ago`;
}

/** A tinted note — the stage screens' way of explaining without taking anything away. */
function Note({ tone, children, action }: { tone: 'info' | 'warning'; children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{
      display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap', p: 1.25, mb: 2, minWidth: 0, fontSize: 13,
      borderRadius: 'var(--r-md)', background: `var(--c-${tone}-50)`, border: `1px solid var(--c-${tone}-200)`, color: `var(--c-${tone}-800)`,
    }}>
      <InfoOutlined sx={{ fontSize: 17, mt: '1px', flexShrink: 0 }} aria-hidden />
      <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>{children}</Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  );
}

export function BlanksPanel({ lineId, canManage, onChanged, onGoValues }: {
  lineId: number;
  canManage: boolean;
  onChanged?: () => void;
  /** Opens the Values stage. Without it the panel moves the order page's own `tab` to values. */
  onGoValues?: () => void;
}) {
  const [view, setView] = useState<CutPieces | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [, setParams] = useSearchParams();

  const load = useCallback(async () => {
    try {
      const out = await cfApi.get<CutPieces>(`/order-lines/${lineId}/cut-plates`);
      setView({ ...out, cutPlates: out.cutPlates ?? [] });
      setError(null);
    } catch (e) {
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
      setView({ cutPlates: [] });
    }
  }, [lineId]);

  useEffect(() => { void load(); }, [load]);

  // The order page keeps the open stage in its address (?tab=…), so without a
  // handler from the page this is the same move its own tabs make.
  const goValues = () => {
    if (onGoValues) { onGoValues(); return; }
    setParams((prev) => { const p = new URLSearchParams(prev); p.set('tab', 'values'); return p; }, { replace: true });
  };

  const makeNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await cfApi.post<Derived>(`/order-lines/${lineId}/cut-plates`, {}, { timeoutMs: LONG_WRITE_MS });
      const bits = [
        out.created ? `${out.created} new` : null,
        out.updated ? `${out.updated} re-quantified` : null,
        out.removed?.length ? `${out.removed.length} removed` : null,
      ].filter(Boolean);
      toast.success(out.changed === false
        ? 'The cut pieces already match the parts — nothing to change.'
        : `${plural((out.cutPlates ?? []).length, 'cut piece')} made from this line's parts${bits.length ? ` (${bits.join(', ')})` : ''}.`);
      await load();
      onChanged?.();
    } catch (e) {
      // CfApiError carries the backend's whole problems list, which is how every
      // other screen here shows all of them at once instead of one per attempt.
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    } finally {
      setBusy(false);
    }
  };

  const blanks = view?.cutPlates ?? null;
  const lock = view?.lock ?? null;
  const values = view?.values ?? null;
  const waiting = !!values && !values.complete;
  const unsized = (view?.partsWithoutBlank ?? []).filter((p) => p.missing.length > 0);
  const noParts = view?.parts === 0;
  const parts = (blanks ?? []).reduce((a, b) => a + (Number(b.partCount) || 0), 0);
  const nested = (blanks ?? []).length > 0 && (blanks ?? []).every((b) => b.plateQuantityBasis === 'nesting');
  const qty = (v: number | null) => (v == null ? '—' : Number(v).toFixed(4));
  const toValues = <Button size="small" variant="outlined" color="inherit" onClick={goValues}>Go to Values</Button>;

  return (
    <SectionCard
      title="Cut pieces"
      subtitle="Made automatically as soon as the line's values are complete, and again whenever a value or the structure changes — until the design is frozen."
      action={canManage && !lock && !noParts ? (
        <Button size="small" variant="outlined" startIcon={<ContentCutRounded />} disabled={busy} onClick={() => void makeNow()}>
          {busy ? 'Making…' : 'Make them now'}
        </Button>
      ) : undefined}
    >
      {error ? <ErrorNotice error={error} sx={{ mb: 2 }} /> : null}

      {/* What happens next — one note, the most important first. */}
      {lock ? (
        <Note tone="info">{lock.message} The cut pieces below are fixed with it.</Note>
      ) : waiting ? (
        <Note tone="warning" action={toValues}>
          <strong>{plural(values.missing, 'required value')} {values.missing === 1 ? 'is' : 'are'} still empty</strong>
          {values.items ? ` on ${plural(values.items, 'item')} of this line` : ''}. The cut pieces are made as soon as {values.missing === 1 ? 'it is' : 'they are'} filled.
        </Note>
      ) : view?.upToDate === false ? (
        <Note tone="warning">
          <strong>The cut pieces are behind the parts.</strong> They are made again the next time a value or the structure is saved — or make them now.
        </Note>
      ) : unsized.length > 0 ? (
        <Note tone="warning">
          <strong>{plural(unsized.length, 'part')} {unsized.length === 1 ? 'has' : 'have'} no size yet</strong>, so {unsized.length === 1 ? 'it' : 'they'} cannot be pooled:{' '}
          {unsized.slice(0, 4).map((p) => `${p.code ?? p.name ?? `#${p.id}`} (no ${p.missing.join(', ').toLowerCase()})`).join('; ')}{unsized.length > 4 ? ', …' : ''}.
        </Note>
      ) : null}

      {noParts && !error ? (
        <EmptyState icon={<ContentCutRounded />} title="Nothing to cut" hint="This line has no plate parts, so it has no cut pieces." />
      ) : null}

      {blanks && blanks.length === 0 && !noParts && !error ? (
        <EmptyState
          icon={<ContentCutRounded />}
          title="No cut pieces yet"
          hint={waiting
            ? 'Parts of the same thickness, length, width and grade are cut as one batch off one plate. Those rectangles appear here by themselves once the line\'s values are complete.'
            : 'Parts of the same thickness, length, width and grade are cut as one batch off one plate. They are made from the line\'s values by themselves; if they have not appeared, make them now.'}
        />
      ) : null}

      {blanks && blanks.length > 0 ? (
        <>
          <Stack direction="row" spacing={3} useFlexGap sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              <Mono>{blanks.length}</Mono> rectangles pooled from <Mono>{parts}</Mono> parts
            </Typography>
            {view?.lastMadeAt && (
              <Typography variant="body2" color="text.secondary" title={new Date(view.lastMadeAt).toLocaleString()}>
                Last made {ago(view.lastMadeAt)}
              </Typography>
            )}
            {!lock && view?.upToDate === true && <Badge family="success" label="Up to date with the parts" />}
            {nested
              ? <Badge family="success" label="Plate quantities come from the accepted nesting" />
              : <Badge family="info" label="Plate quantities are an area fraction until nesting replaces them" />}
          </Stack>
          {/* The table scrolls inside its card, never the page: CF screens are held to no
              sideways overflow at 1024 and 390 px, and eight columns do not fit a phone. */}
          <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
          <Box component="table" sx={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14, whiteSpace: 'nowrap' }}>
            <Box component="thead">
              <Box component="tr" sx={{ textAlign: 'left', color: 'text.secondary' }}>
                <Box component="th" sx={{ py: 0.5 }}>Code</Box>
                <Box component="th">Thk</Box>
                <Box component="th">Length</Box>
                <Box component="th">Width</Box>
                <Box component="th">Grade</Box>
                <Box component="th" sx={{ textAlign: 'right' }} title="How many different parts are cut to this rectangle">Parts</Box>
                <Box component="th" sx={{ pl: 2 }}>Cut from</Box>
                <Box component="th" sx={{ textAlign: 'right' }} title="Plates per rectangle">Plate qty</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {blanks.map((b) => (
                <Box component="tr" key={b.id} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box component="td" sx={{ py: 0.5 }}><Mono>{b.code ?? '—'}</Mono></Box>
                  <Box component="td"><Mono>{mm(b.size?.thickness)}</Mono></Box>
                  <Box component="td"><Mono>{mm(b.size?.length)}</Mono></Box>
                  <Box component="td"><Mono>{mm(b.size?.width)}</Mono></Box>
                  <Box component="td">{b.size?.grade ?? '—'}</Box>
                  <Box component="td" sx={{ textAlign: 'right' }}><Mono>{b.partCount}</Mono></Box>
                  <Box component="td" sx={{ pl: 2 }}><Mono>{plateText(b)}</Mono></Box>
                  <Box component="td" sx={{ textAlign: 'right' }} title={b.note ?? undefined}><Mono>{qty(b.plateQuantity)}</Mono></Box>
                </Box>
              ))}
            </Box>
          </Box>
          </Box>
        </>
      ) : null}
    </SectionCard>
  );
}
