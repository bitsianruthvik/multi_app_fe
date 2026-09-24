import { useCallback, useEffect, useState } from 'react';
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import {
  SectionCard, EmptyState, ErrorNotice, ListSkeleton, FormDialog, ToneBadge, Mono, useToast,
} from '@shared/ui';
import {
  peopleApi, EVENT_TYPE_LABEL, EVENT_TYPE_TONE,
  type EmploymentEvent, type PeoplePickers,
} from '../api/people';

/**
 * History — what happened to this person, as a timeline.
 *
 * This is NOT the audit log. The audit log records that a row changed, for
 * governance; this records that something happened to a person, for their file.
 * Joining, an exit, a change of contractor are written by the service that made
 * the change, in the same transaction — TiDB has no triggers, so an event
 * written afterwards is an event that can go missing. What is typed in here is
 * only what a service cannot know: a transfer agreed in a meeting, a change made
 * before this system existed.
 *
 * `details_json` is rendered as readable label/value pairs rather than dumped as
 * JSON. A before/after pair is shown as "was X, now Y", because that is the
 * shape the services write and the sentence a person would say.
 */

const humanKey = (k: string) => k
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/^./, (c) => c.toUpperCase());

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** One line per fact. A {from, to} object becomes one line, not two. */
function Details({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([, v]) => v !== null && v !== undefined);
  if (!entries.length) return null;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 1,
        mt: 1,
        p: 1.25,
        borderRadius: 'var(--r-sm)',
        background: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
      }}
    >
      {entries.map(([k, v]) => {
        const pair = v && typeof v === 'object' && !Array.isArray(v)
          ? (v as Record<string, unknown>) : null;
        const isChange = pair && ('from' in pair || 'to' in pair);
        return (
          <Box key={k}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
              {humanKey(k)}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>
              {isChange
                ? <>was {renderValue(pair.from)}, now {renderValue(pair.to)}</>
                : renderValue(v)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export function EmployeeHistoryTab({
  employeeId,
  employeeName,
  companySlug,
  canManage,
  pickers,
  onCountChange,
}: {
  employeeId: number;
  employeeName: string;
  companySlug: string;
  canManage: boolean;
  /** Passed down rather than fetched — the record screen already has it. */
  pickers: PeoplePickers | null;
  onCountChange?: (n: number) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<EmploymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    eventType: 'OTHER',
    eventDate: new Date().toISOString().slice(0, 10),
    summary: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const evts = await peopleApi.events(employeeId);
      setItems(evts.items);
      onCountChange?.(evts.items.length);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    await peopleApi.addEvent(employeeId, {
      eventType: form.eventType,
      eventDate: form.eventDate,
      summary: form.summary.trim(),
    });
    setForm({ eventType: 'OTHER', eventDate: new Date().toISOString().slice(0, 10), summary: '' });
    await load();
    toast.success('Event recorded.');
  };

  if (loading) return <SectionCard><ListSkeleton rows={5} /></SectionCard>;
  if (error && !items.length) return <ErrorNotice error={error} onRetry={() => void load()} />;

  return (
    <>
      <ErrorNotice error={error} />

      <SectionCard
        title="Employment history"
        subtitle="Joining, transfers, changes and exit — newest first"
        actions={canManage && (
          <Button size="small" startIcon={<AddRounded />} onClick={() => setAddOpen(true)}>
            Record an event
          </Button>
        )}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<HistoryRounded />}
            title="Nothing recorded yet"
            hint="Joining, exits and contractor changes are written automatically when they happen. Anything agreed off-system can be added here."
          />
        ) : (
          <Box sx={{ position: 'relative', pl: 2.5 }}>
            {/* The spine. Depth via one hairline, not a box per row. */}
            <Box
              sx={{
                position: 'absolute',
                left: 5,
                top: 6,
                bottom: 6,
                width: '1px',
                background: 'var(--c-border)',
              }}
              aria-hidden
            />
            {items.map((e) => (
              <Box key={e.id} sx={{ position: 'relative', pb: 2.5 }}>
                <Box
                  sx={{
                    position: 'absolute',
                    left: -20,
                    top: 5,
                    width: 11,
                    height: 11,
                    borderRadius: '50%',
                    border: '2px solid var(--c-surface)',
                    background: `var(--c-${EVENT_TYPE_TONE[e.eventType] === 'neutral' ? 'text-3' : `${EVENT_TYPE_TONE[e.eventType]}-600`})`,
                  }}
                  aria-hidden
                />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Mono sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{e.eventDate}</Mono>
                  <ToneBadge
                    tone={EVENT_TYPE_TONE[e.eventType] ?? 'neutral'}
                    label={EVENT_TYPE_LABEL[e.eventType] ?? e.eventType}
                    noIcon
                  />
                  {e.workAssignmentId && (
                    <Button
                      component={Link}
                      to={`/${companySlug}/cf_hrms/assignments/${e.workAssignmentId}`}
                      size="small"
                      sx={{ minWidth: 0, fontSize: 12 }}
                    >
                      {e.assignmentRoleTitle ?? `Assignment ${e.workAssignmentId}`}
                    </Button>
                  )}
                </Box>
                <Typography sx={{ fontSize: 14, color: 'var(--c-text)', mt: 0.4 }}>
                  {e.summary}
                </Typography>
                {e.detailsJson && <Details details={e.detailsJson} />}
              </Box>
            ))}
          </Box>
        )}
      </SectionCard>

      {canManage && (
        <FormDialog
          open={addOpen}
          title={`Record an event for ${employeeName}`}
          subtitle="For what the system cannot know on its own. There is no delete — a timeline you can edit backwards is not a history."
          onClose={() => setAddOpen(false)}
          onSubmit={submit}
          submitLabel="Record"
          submitDisabled={!form.summary.trim()}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 2 }}>
            <TextField
              label="Event type"
              select
              value={form.eventType}
              onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))}
              size="small"
            >
              {(pickers?.eventTypes ?? Object.keys(EVENT_TYPE_LABEL)).map((t) => (
                <MenuItem key={t} value={t}>{EVENT_TYPE_LABEL[t] ?? t}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Date"
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <TextField
            label="Summary"
            required
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            size="small"
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
            helperText="The sentence this person's file should read"
          />
        </FormDialog>
      )}
    </>
  );
}
