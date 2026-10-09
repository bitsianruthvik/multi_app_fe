import { useState } from 'react';
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
  PromptDialog,
  StatusBadge,
  Surface,
  useToast,
} from '@shared/ui';
import type { OpenPoint, OpenPointGroup } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';
import { useOpenPoints } from './useOpenPoints';

/**
 * Every unanswered question the import raised, grouped by what it is about
 * (spec §5) — the org chart's Doubts tab, and the same list in a dialog for any
 * screen that wants it without a tab.
 *
 * These are not defects. Karni's chart arrived with questions like "does this
 * supervisor really report to two people?" and "who owns the gate pass?", and
 * they are the honest residue of turning one company's drawing into a model.
 * Resolving one records an answer; dismissing one says the question was wrong.
 * Both are better than the alternative the old tool offered, which was to guess
 * and never say so.
 *
 * ONE LIST, TWO FRAMES. The body below is rendered by the Doubts tab and by
 * `OrgChartOpenPoints` (the dialog). It used to live inside the dialog only; a
 * second copy for the tab would have been the second implementation this app
 * keeps paying for.
 */

export function OpenPointsList({
  groups,
  loading,
  error,
  onRetry,
  onChanged,
  canManage,
  onPick,
}: {
  groups: OpenPointGroup[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** After a resolve or dismiss lands. The caller re-fetches, so counts elsewhere move too. */
  onChanged: () => void;
  canManage: boolean;
  /** Open the card of the position a group is about. */
  onPick: (positionId: number) => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resolving, setResolving] = useState<OpenPoint | null>(null);
  const toast = useToast();

  const total = groups.reduce((a, g) => a + (g.points?.length ?? 0), 0);

  const dismiss = async (p: OpenPoint) => {
    setBusyId(p.id);
    try {
      await orgChartApi.updateOpenPoint(p.id, { status: 'DISMISSED' });
      toast.success('Dismissed.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box aria-busy={loading || undefined}>
      {!!error && <ErrorNotice error={error} onRetry={onRetry} />}
      {loading && !groups.length && <ListSkeleton rows={5} />}
      {!loading && !error && total === 0 && (
        <EmptyState
          title="Nothing outstanding"
          hint="Every question raised against this chart has been answered or dismissed."
        />
      )}
      {total > 0 && (
        <Callout title="These are questions, not errors" sx={{ mb: 2 }}>
          Each one was raised where the source chart was ambiguous. Resolving one records what was
          decided; dismissing one records that the question did not apply.
        </Callout>
      )}
      <Stack spacing={2}>
        {groups.map((g) => (
          <Box key={`${g.entityType}-${g.entityId ?? g.entityLabel}`}>
            <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.75 }}>
              <Typography component="h3" sx={{ fontSize: 15, fontWeight: 500 }}>
                {g.positionId ? (
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onPick(g.positionId!)}
                    sx={{
                      border: 0,
                      background: 'none',
                      p: 0,
                      font: 'inherit',
                      // 700, not 600: 600 is the solid-button shade and does not
                      // invert in dark mode, so as text it all but disappears.
                      color: 'var(--c-primary-700)',
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
                {g.points?.length ?? 0} · {(g.entityKind ?? g.entityType ?? '').toLowerCase().replace(/_/g, ' ')}
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
                      <Typography sx={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                        {p.question}
                      </Typography>
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
                            onClick={() => setResolving(p)}
                          >
                            Resolve
                          </Button>
                          <Button size="small" disabled={busyId === p.id} onClick={() => dismiss(p)}>
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

      {/* The server refuses a resolution with no answer ("a resolved point with
          no answer is a point that will be asked again"), so Resolve asks for
          one. It used to send none and fail every time. */}
      <PromptDialog
        open={resolving != null}
        title="Resolve this point"
        body={resolving?.question}
        label="What was decided"
        confirmLabel="Resolve"
        onClose={() => setResolving(null)}
        onConfirm={async (answer) => {
          if (!resolving) return;
          await orgChartApi.updateOpenPoint(resolving.id, { status: 'RESOLVED', answer });
          toast.success('Marked resolved.');
          onChanged();
        }}
      />
    </Box>
  );
}

/** The same list in a dialog, for a screen that has no Doubts tab. */
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
  const points = useOpenPoints({ enabled: open });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogHeader
        title={<Typography sx={{ fontSize: 20, fontWeight: 600 }}>Open points</Typography>}
        subtitle={`${points.total} question${points.total === 1 ? '' : 's'} the chart cannot answer by itself.`}
        onClose={onClose}
      />
      <DialogContent dividers>
        <OpenPointsList
          groups={points.groups}
          loading={points.loading}
          error={points.error}
          onRetry={points.reload}
          onChanged={points.reload}
          canManage={canManage}
          onPick={(id) => {
            onPick(id);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
