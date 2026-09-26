import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import ContentCutRounded from '@mui/icons-material/ContentCutRounded';
import { cfApi, CfApiError } from '../../api/client';
import { Badge, EmptyState, ErrorNotice, Mono, SectionCard } from '../ui';
import { useToast } from '../toastContext';

/**
 * The Cut pieces stage: pooling a line's plate parts into the rectangles they
 * are cut from.
 *
 * WHY THIS IS A SCREEN OF ITS OWN AND NOT A CORNER OF NESTING.
 *
 * Deriving WRITES — it mints a temporary item per rectangle and puts an
 * area-fraction quantity on each one. The nesting screen's contract is that
 * opening it changes nothing, so the write cannot hide behind it. It is also a
 * step people re-run: parts pool by (thickness, length, width, grade), so an
 * edit upstream changes which rectangles exist and that should be visible.
 *
 * Until this shipped the derivation had exactly one caller — a POST route — and
 * nothing in the app called it at all. An order could reach Nesting with no
 * blanks and the packer would find nothing to lay out.
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
  plate: { id: number; code: string | null; name: string | null } | null;
  plateQuantity: number | null;
  /** 'nesting' once an accepted layout owns the quantity; otherwise how the placeholder was worked out. */
  plateQuantityBasis: string | null;
  note: string | null;
};

const mm = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(Number(v))));

export function BlanksPanel({ lineId, canManage, onChanged }: {
  lineId: number;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const [blanks, setBlanks] = useState<Blank[] | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const out = await cfApi.get<{ cutPlates: Blank[] }>(`/order-lines/${lineId}/cut-plates`);
      setBlanks(out.cutPlates ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
      setBlanks([]);
    }
  }, [lineId]);

  useEffect(() => { void load(); }, [load]);

  const derive = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await cfApi.post<{ cutPlates?: Blank[]; created?: number }>(`/order-lines/${lineId}/cut-plates`, {});
      setBlanks(out.cutPlates ?? []);
      toast.success(`${(out.cutPlates ?? []).length} cut pieces pooled from this line's parts.`);
      onChanged?.();
    } catch (e) {
      // CfApiError carries the backend's whole problems list, which is how every
      // other screen here shows all of them at once instead of one per attempt.
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    } finally {
      setBusy(false);
    }
  };

  const parts = (blanks ?? []).reduce((a, b) => a + (Number(b.partCount) || 0), 0);
  const nested = (blanks ?? []).length > 0 && (blanks ?? []).every((b) => b.plateQuantityBasis === 'nesting');
  const qty = (v: number | null) => (v == null ? '—' : Number(v).toFixed(4));

  return (
    <SectionCard
      title="Cut pieces"
      action={canManage ? (
        <Button variant="contained" startIcon={<ContentCutRounded />} disabled={busy} onClick={() => void derive()}>
          {blanks && blanks.length ? 'Derive again' : 'Derive cut pieces'}
        </Button>
      ) : undefined}
    >
      {error ? <ErrorNotice error={error} sx={{ mb: 2 }} /> : null}

      {blanks && blanks.length === 0 && !error ? (
        <EmptyState
          icon={<ContentCutRounded />}
          title="No cut pieces yet"
          hint="Parts of the same thickness, length, width and grade are cut as one batch off one plate. Deriving pools them into those rectangles, which is what nesting lays out."
        />
      ) : null}

      {blanks && blanks.length > 0 ? (
        <>
          <Stack direction="row" spacing={3} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              <Mono>{blanks.length}</Mono> rectangles pooled from <Mono>{parts}</Mono> parts
            </Typography>
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
                  <Box component="td" sx={{ pl: 2 }}><Mono>{b.plate?.code ?? '—'}</Mono></Box>
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
