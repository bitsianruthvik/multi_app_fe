/**
 * The three pieces every job-content screen shares (CF_HRMS_HIRING_SPEC.md §16):
 *
 *   TakesEffectField  "Takes effect" on every change: today by default, a later
 *                     day if chosen; a past day only for the Owner, who then
 *                     has to say why.
 *   AsOnBar           "As on" above a job: today by default; any other day shows
 *                     that day's job, read-only, under a banner that says so.
 *   JobHistoryList    the dated list of changes, newest first.
 *
 * Nothing on screen says "layer", "override" or "assignment": it says "for this
 * role", "for this position", "for this person", "changed", "switched off".
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Skeleton, Stack, TextField, Typography } from '@mui/material';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import { ErrorNotice, ToneBadge } from '@shared/ui';
import { useCan } from '../access/can';
import { jobContentApi, type HistoryItem, type JobHistory } from '../api/jobContent';
import { longDay, todayIso } from './jobDates';


/* ── Takes effect ─────────────────────────────────────────────────────────── */

export function TakesEffectField({
  day,
  onDay,
  reason,
  onReason,
  reasonLabel,
}: {
  day: string;
  onDay: (d: string) => void;
  reason: string;
  onReason: (r: string) => void;
  /** The dialog's own reason box already shows `reason`: only the requirement is added here. */
  reasonLabel?: string | null;
}) {
  const can = useCan();
  const today = todayIso();
  const past = Boolean(day) && day < today;
  return (
    <Stack spacing={1}>
      <TextField
        label="Takes effect"
        type="date"
        size="small"
        value={day}
        onChange={(e) => onDay(e.target.value || today)}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: can.owner ? {} : { min: today } }}
        helperText={
          past
            ? `A day that has passed. What was expected from ${longDay(day)} is rewritten — say why below.`
            : day > today
              ? `From ${longDay(day)}. Until then the job reads as it does now.`
              : 'Today. What was expected before stays readable in the history.'
        }
        sx={{ maxWidth: 260 }}
      />
      {past && reasonLabel !== null && (
        <TextField
          label={reasonLabel ?? 'Why it is dated in the past'}
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          required
          fullWidth
          size="small"
          helperText="Kept with the change."
        />
      )}
    </Stack>
  );
}


/* ── As on ────────────────────────────────────────────────────────────────── */

export function AsOnBar({ on, onChange, note }: { on: string; onChange: (d: string) => void; note?: string }) {
  const today = todayIso();
  const other = on !== today;
  return (
    <Stack spacing={1} data-ason="" sx={{ mb: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          label="As on"
          type="date"
          size="small"
          value={on}
          onChange={(e) => onChange(e.target.value || today)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 170 }}
        />
        {other && (
          <Button size="small" onClick={() => onChange(today)}>
            Back to today
          </Button>
        )}
        {note && !other && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{note}</Typography>}
      </Stack>
      {other && (
        <Box
          role="status"
          data-asonbanner=""
          sx={{ fontSize: 13, lineHeight: 1.5, color: 'var(--c-info-800)', background: 'var(--c-info-50)', borderRadius: 'var(--r-sm)', px: 1.25, py: 0.75 }}
        >
          <strong>{on < today ? `As it stood on ${longDay(on)}.` : `As it will stand on ${longDay(on)}.`}</strong>{' '}
          Read only — changes are made on today’s view.
        </Box>
      )}
    </Stack>
  );
}

/* ── History ──────────────────────────────────────────────────────────────── */

const LAYER_WORD: Record<string, string> = { ROLE: 'For the role', POSITION: 'For this position', PERSON: 'For this person' };
const KIND_WORD: Record<string, string> = { KRA: 'KRA', RESPONSIBILITY: 'Responsibility', KPI: 'KPI', POSITION: 'Position' };

function sentence(it: HistoryItem): string {
  const q = (s: string | null) => (s ? `“${s}”` : '');
  switch (it.what) {
    case 'ADDED': return `${KIND_WORD[it.kind]} added: ${q(it.line)}${it.to ? ` — target ${it.to}` : ''}`;
    case 'REWORDED': return `${KIND_WORD[it.kind]} reworded: ${q(it.from)} → ${q(it.to)}`;
    case 'TARGET_CHANGED': return `Target changed on ${q(it.line)}: ${it.from ?? 'the one above'} → ${it.to ?? 'none'}`;
    case 'CHANGED': return `${KIND_WORD[it.kind]} changed: ${q(it.line)} — ${it.from ?? ''} → ${it.to ?? ''}`;
    case 'SWITCHED_OFF': return `Switched off: ${q(it.line)}`;
    case 'RESTORED': return `Back to what the one above says: ${q(it.line)}`;
    case 'REMOVED': return `${KIND_WORD[it.kind]} removed: ${q(it.line ?? it.from)}`;
    case 'CREATED': return `Position created${it.line ? ` (${it.line})` : ''}`;
    case 'ROLE_CHANGED': return `Role changed: ${it.from ?? '—'} → ${it.to ?? '—'}`;
    case 'DEPARTMENT_CHANGED': return `Department changed: ${it.from ?? '—'} → ${it.to ?? '—'}`;
    case 'SHIFT_CHANGED': return `Shift changed: ${it.from ?? '—'} → ${it.to ?? '—'}`;
    case 'PLACE_CHANGED': return `Place changed: ${it.from ?? '—'} → ${it.to ?? '—'}`;
    case 'TITLE_CHANGED': return `Title changed: ${it.from ?? '—'} → ${it.to ?? '—'}`;
    case 'CODE_CHANGED': return `Code changed: ${it.from ?? '—'} → ${it.to ?? '—'}`;
    case 'REPORTS_TO': return `Reports to ${it.to ?? it.line ?? ''}`;
    case 'STOPPED_REPORTING_TO': return `No longer reports to ${it.from ?? it.line ?? ''}`;
    case 'STARTED_IN': return `Started in ${it.to ?? it.line ?? ''}`;
    case 'LEFT_POSITION': return `Left ${it.from ?? it.line ?? ''}`;
    default: return it.line ?? '';
  }
}

/** A day with more than this many entries opens folded ("30 lines added on 30 Sep 2026"). */
const FOLD = 6;

export function JobHistoryList({ subject }: { subject: { type: 'role' | 'position' | 'person'; id: number } }) {
  const [data, setData] = useState<JobHistory | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let live = true;
    setError(null);
    const read = subject.type === 'role'
      ? jobContentApi.roleHistory(subject.id)
      : subject.type === 'position' ? jobContentApi.positionHistory(subject.id) : jobContentApi.personHistory(subject.id);
    read.then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [subject.type, subject.id, tick]);

  const days = useMemo(() => {
    const out: { on: string | null; items: HistoryItem[] }[] = [];
    for (const it of data?.items ?? []) {
      const last = out[out.length - 1];
      if (last && last.on === it.on) last.items.push(it);
      else out.push({ on: it.on, items: [it] });
    }
    return out;
  }, [data]);

  if (error) return <ErrorNotice error={error} fallback="The history could not be loaded." onRetry={() => setTick((t) => t + 1)} />;
  if (!data) {
    return (
      <Stack spacing={1} aria-busy="true">
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </Stack>
    );
  }
  if (!data.items.length) {
    return <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing has changed yet.</Typography>;
  }
  return (
    <Stack spacing={1.5} data-jobhistory="">
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <HistoryRounded sx={{ fontSize: 16 }} /> Every change, newest first. Nothing is overwritten: pick a day in “As on” to read the job as it stood then.
      </Typography>
      {days.map((d) => {
        const key = d.on ?? 'start';
        const folded = d.items.length > FOLD && !open[key];
        const shown = folded ? d.items.slice(0, 3) : d.items;
        return (
          <Box key={key} sx={{ borderLeft: '2px solid var(--c-border)', pl: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{d.on ? longDay(d.on) : 'From the start'}</Typography>
              {d.items.some((i) => i.coming) && <ToneBadge tone="info" label="Coming" noIcon />}
            </Stack>
            <Stack spacing={0.5}>
              {shown.map((it, i) => (
                <Box key={`${key}-${i}`} sx={{ fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  {sentence(it)}
                  <Box component="span" sx={{ ml: 0.75, fontSize: 12, color: 'var(--c-text-2)' }}>
                    {[it.kind !== 'POSITION' ? LAYER_WORD[it.layer] : null, it.by ? `by ${it.by}` : null, it.reason ? `why: ${it.reason}` : null].filter(Boolean).join(' · ')}
                  </Box>
                </Box>
              ))}
            </Stack>
            {d.items.length > FOLD && (
              <Button size="small" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} sx={{ textTransform: 'none', fontSize: 12.5, mt: 0.25 }}>
                {folded ? `Show all ${d.items.length} changes of this day` : 'Show fewer'}
              </Button>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
