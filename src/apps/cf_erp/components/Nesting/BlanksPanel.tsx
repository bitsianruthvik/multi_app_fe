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

type Blank = {
  id: number;
  code: string | null;
  name: string | null;
  thickness: number | null;
  length: number | null;
  width: number | null;
  grade: string | null;
  pieces: number | null;
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

  const total = (blanks ?? []).reduce((a, b) => a + (Number(b.pieces) || 0), 0);

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
              <Mono>{blanks.length}</Mono> rectangles · <Mono>{total}</Mono> pieces
            </Typography>
            <Badge family="info" label="Quantities are an area fraction until nesting replaces them" />
          </Stack>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <Box component="thead">
              <Box component="tr" sx={{ textAlign: 'left', color: 'text.secondary' }}>
                <Box component="th" sx={{ py: 0.5 }}>Code</Box>
                <Box component="th">Thk</Box>
                <Box component="th">Length</Box>
                <Box component="th">Width</Box>
                <Box component="th">Grade</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>Pieces</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {blanks.map((b) => (
                <Box component="tr" key={b.id} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box component="td" sx={{ py: 0.5 }}><Mono>{b.code ?? '—'}</Mono></Box>
                  <Box component="td"><Mono>{mm(b.thickness)}</Mono></Box>
                  <Box component="td"><Mono>{mm(b.length)}</Mono></Box>
                  <Box component="td"><Mono>{mm(b.width)}</Mono></Box>
                  <Box component="td">{b.grade ?? '—'}</Box>
                  <Box component="td" sx={{ textAlign: 'right' }}><Mono>{b.pieces ?? '—'}</Mono></Box>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      ) : null}
    </SectionCard>
  );
}
