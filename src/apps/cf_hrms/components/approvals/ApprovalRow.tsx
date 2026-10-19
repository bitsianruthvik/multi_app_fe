/**
 * One row of the Approvals list, for every kind of approval
 * (CF_HRMS_HIRING_SPEC.md §22.6): kind icon, person, title, when, how long it
 * has waited, and its flags.
 *
 * A new kind joins by adding its icon to KIND_META (and its sheet to the page's
 * switch). The row itself never branches on what the item is.
 */
import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import FingerprintRounded from '@mui/icons-material/FingerprintRounded';
import type { ApprovalItem, ApprovalKind } from '../../api/approvals';
import { LeaveStatusBadge } from '../leave/LeaveParts';

const KIND_META: Record<ApprovalKind, { icon: ReactNode; label: string }> = {
  LEAVE: { icon: <EventBusyRounded />, label: 'Leave' },
  ATTENDANCE: { icon: <FingerprintRounded />, label: 'Attendance' },
};

function waitingWord(n: number): string {
  if (n <= 0) return 'Asked today';
  return `Waiting ${n} ${n === 1 ? 'day' : 'days'}`;
}

export function ApprovalRow({ item, onOpen }: { item: ApprovalItem; onOpen: (item: ApprovalItem) => void }) {
  const meta = KIND_META[item.kind] ?? { icon: null, label: item.kind };
  const pending = item.status === 'PENDING';
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(item)}
      data-approval-row={`${item.kind}-${item.id}`}
      sx={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
        display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5,
        borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
        '&:hover, &:focus-visible': { background: 'var(--c-surface-2)' },
      }}
    >
      <Box
        aria-label={meta.label}
        sx={{
          width: 36, height: 36, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', flexShrink: 0,
          background: 'var(--c-primary-50)', color: 'var(--c-primary-700)', '& svg': { fontSize: 20 },
        }}
      >
        {meta.icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{item.person.name}</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {[item.person.positionTitle, item.person.departmentName].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text)' }}>
          {item.title} · {item.when}
        </Typography>
        {item.flags.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
            {item.flags.map((f, i) => (
              // Not a ToneBadge: a flag is a sentence and must wrap on a phone.
              <Box
                key={i}
                component="span"
                sx={{
                  background: 'var(--c-warning-50)', color: 'var(--c-warning-800)', borderRadius: 'var(--r-sm)',
                  px: 1, py: '2px', fontSize: 12, lineHeight: 1.5, maxWidth: '100%',
                }}
              >
                {f}
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
        {pending ? (
          <Typography sx={{ fontSize: 12.5, color: item.waitingDays >= 3 ? 'var(--c-warning-800)' : 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
            {waitingWord(item.waitingDays)}
          </Typography>
        ) : (
          <LeaveStatusBadge status={item.status} />
        )}
      </Box>
    </Box>
  );
}
