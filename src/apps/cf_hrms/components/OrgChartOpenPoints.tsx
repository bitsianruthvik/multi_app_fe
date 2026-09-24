import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  Stack,
  Typography,
} from '@mui/material';
import {
  Callout,
  DialogHeader,
  EmptyState,
  ErrorNotice,
  ListSkeleton,
  StatusBadge,
  Surface,
  useToast,
} from '@shared/ui';
import type { OpenPoint, OpenPointGroup } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';

/**
 * Every unanswered question the import raised, grouped by what it is about
 * (spec §5).
 *
 * These are not defects. Karni's chart arrived with 111 of them — "does this
 * supervisor really report to two people?", "is this title one job or two?" —
 * and they are the honest residue of turning one company's drawing into a
 * model. Resolving one records an answer; dismissing one says the question was
 * wrong. Both are better than the alternative the old tool offered, which was
 * to guess and never say so.
 */

export function OrgChartOpenPoints({
  open,
  onClose,
  onPick,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (positionId: number) => void;
  canManage: boolean;
}) {
  const [groups, setGroups] = useState<OpenPointGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    orgChartApi
      .openPoints()
      .then((r) => {
        setGroups(Array.isArray(r) ? r : []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const total = groups.reduce((a, g) => a + (g.points?.length ?? 0), 0);

  const update = async (p: OpenPoint, status: 'RESOLVED' | 'DISMISSED') => {
    setBusyId(p.id);
    try {
      await orgChartApi.updateOpenPoint(p.id, { status });
      toast.success(status === 'RESOLVED' ? 'Marked resolved.' : 'Dismissed.');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogHeader
        title={<Typography sx={{ fontSize: 20, fontWeight: 600 }}>Open points</Typography>}
        subtitle={`${total} question${total === 1 ? '' : 's'} the chart cannot answer by itself.`}
        onClose={onClose}
      />
      <DialogContent dividers>
        {!!error && <ErrorNotice error={error} onRetry={load} />}
        {loading && <ListSkeleton rows={5} />}
        {!loading && !error && total === 0 && (
          <EmptyState
            title="Nothing outstanding"
            hint="Every question raised against this chart has been answered or dismissed."
          />
        )}
        {!loading && total > 0 && (
          <Callout title="These are questions, not errors" sx={{ mb: 2 }}>
            Each one was raised where the source chart was ambiguous. Answering one changes what the
            chart says; dismissing one records that the question did not apply.
          </Callout>
        )}
        <Stack spacing={2}>
          {groups.map((g) => (
            <Box key={`${g.entityType}-${g.entityId ?? g.entityLabel}`}>
              <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.75 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 500 }}>
                  {g.positionId ? (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => {
                        onPick(g.positionId!);
                        onClose();
                      }}
                      sx={{
                        border: 0,
                        background: 'none',
                        p: 0,
                        font: 'inherit',
                        color: 'var(--c-primary-600)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {g.entityLabel}
                    </Box>
                  ) : (
                    g.entityLabel
                  )}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  {g.entityType?.toLowerCase()}
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {(g.points ?? []).map((p) => (
                  <Surface key={p.id} e={1} sx={{ p: 1.5 }}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ sm: 'flex-start' }}
                      justifyContent="space-between"
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, lineHeight: 1.5 }}>{p.question}</Typography>
                        {p.answer && (
                          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }}>
                            Answer: {p.answer}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                        <StatusBadge status={p.status} />
                        {canManage && p.status === 'OPEN' && (
                          <>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={busyId === p.id}
                              onClick={() => update(p, 'RESOLVED')}
                            >
                              Resolve
                            </Button>
                            <Button
                              size="small"
                              disabled={busyId === p.id}
                              onClick={() => update(p, 'DISMISSED')}
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                      </Stack>
                    </Stack>
                  </Surface>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
