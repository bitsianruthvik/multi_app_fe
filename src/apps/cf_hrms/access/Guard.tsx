import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { EmptyState, ListSkeleton } from '@shared/ui';
import { scopeWords, useCan } from './can';

/**
 * A screen reached by its address without the right to see it (spec §12.7):
 * one plain sentence and the person's access role, never a blank page or a
 * screen full of failed requests.
 */
export function NoAccess() {
  const can = useCan();
  return (
    <EmptyState
      icon={<LockOutlined />}
      title="You do not have access to this screen"
      hint={
        can.role
          ? `Your access role is ${can.role.label}. Ask the person who manages logins if you need this screen.`
          : 'Ask the person who manages logins if you need this screen.'
      }
    />
  );
}

/**
 * Wraps a screen in `routes.tsx`. `tag` is the area's `view` (or a named right).
 * Until the server has answered once, a "no" from the login payload shows a
 * skeleton rather than the refusal, so nobody is told "no access" for a right
 * they were given a minute ago.
 */
export function Guard({ tag, children }: { tag: string; children: ReactNode }) {
  const can = useCan();
  if (can.has(tag)) return <>{children}</>;
  if (!can.settled) return <ListSkeleton rows={6} />;
  return <NoAccess />;
}

/** Like Guard, for a screen any ONE of several rights opens (the dashboard: spec §42.1). */
export function AnyOf({ tags, children }: { tags: string[]; children: ReactNode }) {
  const can = useCan();
  if (tags.some((t) => can.has(t))) return <>{children}</>;
  if (!can.settled) return <ListSkeleton rows={6} />;
  return <NoAccess />;
}

/** One quiet line where a whole section is missing because of a right (spec §12.7: say why). */
export function NoAccessNote({ children }: { children: ReactNode }) {
  return (
    <Typography data-noaccess-note="" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', lineHeight: 1.5 }}>
      {children}
    </Typography>
  );
}

/** "My access" — the person's access role and scope, for the account menu. */
export function MyAccessLine() {
  const can = useCan();
  if (!can.role) return null;
  return (
    <Box data-my-access="" sx={{ px: 2, py: 1, maxWidth: 280 }}>
      <Typography sx={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
        My access
      </Typography>
      <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)' }}>{can.role.label}</Typography>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{scopeWords(can.scope)}</Typography>
    </Box>
  );
}
