/**
 * The small pieces every leave screen draws the same way (CF_HRMS_HIRING_SPEC.md
 * §22.6): a balance card, the day list, the checks, "before → after", a status.
 * My leave, Approvals and HR's Leave requests all import from here, so a day
 * that "does not count" reads the same to the person asking and to the manager
 * deciding.
 */
import { useState, type ReactNode } from 'react';
import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import BlockRounded from '@mui/icons-material/BlockRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Surface, ToneBadge, type StatusTone } from '@shared/ui';
import {
  LEAVE_STATUS_LABEL, numberWord, rangeWord,
  type Balance, type Check, type DayLine, type LeaveStatus,
} from '../../api/leaveRequests';

const STATUS_TONE: Record<LeaveStatus, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export function LeaveStatusBadge({ status }: { status: string }) {
  const s = status as LeaveStatus;
  return <ToneBadge tone={STATUS_TONE[s] ?? 'neutral'} label={LEAVE_STATUS_LABEL[s] ?? status} />;
}

/** One leave type: the number that matters, the why, and the rule on expand. */
export function BalanceCard({ b }: { b: Balance }) {
  const [open, setOpen] = useState(false);
  const dim = !b.canAsk;
  return (
    <Surface
      e={1}
      data-balance-card={b.code}
      sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.75, opacity: dim ? 0.6 : 1, minWidth: 0 }}
    >
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>{b.name}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
        <Typography
          sx={{ fontSize: b.limited ? 30 : 20, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: 'var(--c-text)' }}
        >
          {numberWord(b.available, b.limited)}
        </Typography>
        {b.limited && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>available</Typography>}
      </Box>
      {dim && b.cannotWhy ? (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{b.cannotWhy}</Typography>
      ) : (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.45 }}>{b.why}</Typography>
      )}
      {b.rule && (
        <>
          <Button
            size="small"
            onClick={() => setOpen((v) => !v)}
            sx={{ alignSelf: 'flex-start', px: 0.5, minWidth: 0, fontSize: 12, color: 'var(--c-text-2)' }}
          >
            {open ? 'Hide the rule' : 'The rule'}
          </Button>
          <Collapse in={open} unmountOnExit>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.45 }}>{b.rule}</Typography>
          </Collapse>
        </>
      )}
    </Surface>
  );
}

export function BalanceCards({ balances }: { balances: Balance[] }) {
  // Usable types first, each group in the policy's own order.
  const sorted = [...balances.filter((b) => b.canAsk), ...balances.filter((b) => !b.canAsk)];
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))',
        gap: 1.5,
      }}
    >
      {sorted.map((b) => <BalanceCard key={b.leaveTypeId} b={b} />)}
    </Box>
  );
}

/** Every date in the range: counts or not, and why. */
export function DayList({ days, dense = false }: { days: DayLine[]; dense?: boolean }) {
  if (!days.length) return null;
  return (
    <Box component="ul" data-day-list="" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: dense ? 220 : 280, overflowY: 'auto' }}>
      {days.map((d) => (
        <Box
          component="li"
          key={d.date}
          sx={{
            display: 'flex', alignItems: 'baseline', gap: 1, py: 0.5,
            borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
            color: d.counts ? 'var(--c-text)' : 'var(--c-text-3)',
          }}
        >
          <Typography sx={{ fontSize: 13, minWidth: 96, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {d.weekday.slice(0, 3)} {rangeWord(d.date, d.date)}
          </Typography>
          <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0, color: 'inherit' }}>
            {d.counts ? (d.amount === 0.5 ? 'Counts as half a day' : 'Counts') : 'Does not count'}
            {d.why ? `: ${d.why}` : ''}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** BLOCK lines in red, NOTE lines in amber. */
export function ChecksList({ checks }: { checks: Check[] }) {
  if (!checks.length) return null;
  const blocks = checks.filter((c) => c.level === 'BLOCK');
  const notes = checks.filter((c) => c.level !== 'BLOCK');
  return (
    <Stack spacing={0.75} data-checks="">
      {[...blocks, ...notes].map((c, i) => {
        const block = c.level === 'BLOCK';
        return (
          <Box
            key={`${c.code}-${i}`}
            data-check={c.level}
            sx={{
              display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, borderRadius: 'var(--r-sm)',
              background: block ? 'var(--c-danger-50)' : 'var(--c-warning-50)',
              color: block ? 'var(--c-danger-800)' : 'var(--c-warning-800)',
            }}
          >
            {block ? <BlockRounded sx={{ fontSize: 18, mt: '1px' }} aria-label="Stops this" /> : <InfoOutlined sx={{ fontSize: 18, mt: '1px' }} aria-label="Note" />}
            <Typography sx={{ fontSize: 13, color: 'inherit', lineHeight: 1.45 }}>{c.text}</Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

/** "4 → 1" with the why under it. */
export function BalanceChange({ before, after, why, limited = true }: { before: number | null; after: number | null; why?: string; limited?: boolean }) {
  return (
    <Box data-balance-change="">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Available</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{numberWord(before, limited)}</Typography>
        <ArrowForwardRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} aria-label="after this" />
        <Typography
          sx={{
            fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            color: after != null && after < 0 ? 'var(--c-danger-700)' : 'var(--c-text)',
          }}
        >
          {numberWord(after, limited && after != null)}
        </Typography>
      </Box>
      {why && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>{why}</Typography>}
    </Box>
  );
}

/** A labelled block inside a sheet or a form. */
export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.75 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
