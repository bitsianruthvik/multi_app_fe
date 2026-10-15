/**
 * "Create plans for this period" (CF_HRMS_HIRING_SPEC.md §18.2): preview first —
 * who gets a plan, who joined during the period (no plan unless chosen), who is
 * skipped and why, in the server's words — then Create. Creating is
 * idempotent: running it again later only adds the people who have none.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';
import { ErrorNotice, FormDialog, ListSkeleton, Mono, ToneBadge } from '@shared/ui';
import { performanceApi, type CreateResult, type Frequency, type Preview, type PreviewPerson } from '../../api/performance';
import { longDay } from '../jobDates';
import { countWords, periodDates } from './planWords';

const SKIP_HEADING: Record<string, string> = {
  HAS_PLAN: 'Already have a plan for this period',
  NO_POSITION: 'Held no position on the start day',
  OTHER_FREQUENCY: 'Their role is on plans of another frequency',
};

function positionWords(p: PreviewPerson): string {
  return [p.positionCode, p.positionTitle ?? p.roleTitle].filter(Boolean).join(' · ') || 'No position';
}

function PersonLine({ p, right, below }: { p: PreviewPerson; right?: ReactNode; below?: ReactNode }) {
  return (
    <Box sx={{ py: 0.75, borderBottom: '1px solid var(--c-border)', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</Typography>
        {p.employeeCode && <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{p.employeeCode}</Mono>}
        <Box sx={{ flex: 1 }} />
        {right}
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {[positionWords(p), p.departmentName].filter(Boolean).join(' — ')}
      </Typography>
      {below}
    </Box>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
        {title} <Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}>· {count}</Box>
      </Typography>
      <Box sx={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 1.25 }}>
        {children}
      </Box>
    </Box>
  );
}

export function CreatePlansDialog({
  open,
  frequency,
  start,
  onClose,
  onDone,
}: {
  open: boolean;
  frequency: Frequency;
  /** The period's start day. */
  start: string;
  onClose: () => void;
  onDone: (result: CreateResult) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setPreview(null);
    setError(null);
    setChosen(new Set());
    performanceApi.preview(frequency, start)
      .then((p) => { if (live) setPreview(p); })
      .catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [open, frequency, start]);

  const skippedGroups = useMemo(() => {
    const out = new Map<string, PreviewPerson[]>();
    for (const s of preview?.skipped ?? []) {
      const k = s.reason ?? 'OTHER';
      out.set(k, [...(out.get(k) ?? []), s]);
    }
    return [...out.entries()];
  }, [preview]);

  const willGet = preview?.willGet ?? [];
  const joiners = preview?.joiners ?? [];
  const total = willGet.length + chosen.size;

  const toggle = (id: number, on: boolean) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const submit = async () => {
    // Only when a joiner is chosen does the list need spelling out; otherwise the server makes the preview's list.
    const ids = chosen.size ? [...willGet.map((p) => p.employeeId), ...chosen] : undefined;
    const result = await performanceApi.create(frequency, start, ids);
    onDone(result);
  };

  return (
    <FormDialog
      open={open}
      title="Create plans for this period"
      subtitle={preview ? `${preview.period.name} · ${periodDates(preview.period.start, preview.period.end)}` : undefined}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={total ? `Create ${total} plan${total === 1 ? '' : 's'}` : 'Create'}
      busyLabel="Creating…"
      submitDisabled={!preview || total === 0}
      maxWidth="md"
    >
      {error != null && <ErrorNotice error={error} />}
      {!preview && error == null && <ListSkeleton rows={4} />}
      {preview && (
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
            Each plan copies the KRA headings and KPIs of the person's job as it stood on {longDay(preview.period.start)}. The job itself is not changed.
          </Typography>

          {willGet.length > 0 ? (
            <Group title="Will get a plan" count={willGet.length}>
              {willGet.map((p) => (
                <PersonLine
                  key={p.employeeId}
                  p={p}
                  right={(
                    <Stack direction="row" spacing={1} alignItems="center">
                      {p.noKpis && <ToneBadge tone="neutral" noIcon label="No KPIs — KRAs only" title="Their job has no KPIs yet. They still get a plan with the KRA headings." />}
                      <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
                        {countWords(p.kraCount ?? 0, p.kpiCount ?? 0)}
                      </Typography>
                    </Stack>
                  )}
                />
              ))}
            </Group>
          ) : (
            <Typography sx={{ fontSize: 13.5 }}>Nobody new gets a plan for this period.</Typography>
          )}

          {joiners.length > 0 && (
            <Group title="Joined during the period — no plan unless you tick them" count={joiners.length}>
              {joiners.map((p) => (
                <PersonLine
                  key={p.employeeId}
                  p={p}
                  right={(
                    <FormControlLabel
                      sx={{ mr: 0 }}
                      control={<Checkbox size="small" checked={chosen.has(p.employeeId)} onChange={(e) => toggle(p.employeeId, e.target.checked)} />}
                      label={<Typography sx={{ fontSize: 12.5 }}>Give a plan</Typography>}
                    />
                  )}
                  below={(
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                      {[p.joinedOn ? `Joined ${longDay(p.joinedOn)}` : null, p.copyOn ? `job copied as on ${longDay(p.copyOn)}` : null, p.noKpis ? 'no KPIs — KRAs only' : null].filter(Boolean).join(' · ')}
                    </Typography>
                  )}
                />
              ))}
            </Group>
          )}

          {skippedGroups.map(([reason, people]) => (
            <Group key={reason} title={`Skipped — ${SKIP_HEADING[reason] ?? 'other reasons'}`} count={people.length}>
              {people.map((p) => (
                <PersonLine
                  key={p.employeeId}
                  p={p}
                  below={p.line ? <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{p.line}</Typography> : undefined}
                />
              ))}
            </Group>
          ))}
        </Stack>
      )}
    </FormDialog>
  );
}
