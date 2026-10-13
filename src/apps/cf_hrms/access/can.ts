/**
 * Rights in cf_hrms — ONE mapping from what a screen wants to do to the tag the
 * backend asks for (CF_HRMS_HIRING_SPEC.md §12.1, §12.7).
 *
 *   const can = useCan();
 *   can.positions.edit        // may change a position, its job content, its shift, move a person
 *   can.employees.view        // may open Employees
 *   can.named.payView         // may see CTC and the letters
 *
 * No other file spells a `cf_hrms_…` tag. A button, a row action, a tab or a
 * menu entry is shown only when the matching flag is true; the server checks
 * the same tag again on every request.
 *
 * WHERE THE LIST COMES FROM. The login payload carries a permission list
 * (`AuthContext`, read once per page load), which would go stale the moment
 * somebody's access role is changed. So cf_hrms asks the server itself:
 * `GET /access/me`, on app load and whenever the tab gets focus again
 * (`useAccessWatch`, mounted once in the shell). Until the first answer arrives
 * the login payload is used, so nothing flickers for the usual case. The
 * shared AuthContext is not touched.
 *
 * THE OWNER. The platform role named `admin` bypasses every check on the server
 * (`requirePerm`), so it holds everything here too.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@core/contexts/AuthContext';
import { useIsPermitted } from '@shared/ui';
import { api } from '../api/client';

/* ── the tags ─────────────────────────────────────────────────────────── */

const AREAS = ['org', 'roles', 'positions', 'employees', 'hiring', 'documents', 'time', 'leave', 'setup'] as const;
export type Area = (typeof AREAS)[number];
export type Right = 'view' | 'edit' | 'remove' | 'upload';

/** The rights that exist per area. A right missing here does not exist on the server either. */
const AREA_RIGHTS: Record<Area, readonly Right[]> = {
  org: ['view', 'edit', 'remove', 'upload'],
  roles: ['view', 'edit', 'remove', 'upload'],
  positions: ['view', 'edit', 'remove', 'upload'],
  employees: ['view', 'edit', 'upload'],
  hiring: ['view', 'edit'],
  documents: ['view', 'edit', 'remove'],
  time: ['view', 'edit', 'remove', 'upload'],
  leave: ['view', 'edit', 'remove'],
  setup: ['view', 'edit', 'remove'],
};

const NAMED = {
  /** The appointment step: the hiring's final "create employee". */
  employeeCreate: 'cf_hrms_employee_create',
  /** Start, edit, cancel and close a leaving. */
  employeeClose: 'cf_hrms_employee_close',
  /** The Excel upload that adds employees without a hiring. */
  employeeBulkAdd: 'cf_hrms_employee_bulk_add',
  /** Phone, email, address; statutory identifiers unmasked. */
  contactView: 'cf_hrms_contact_view',
  /** CTC and everything made from it: hiring terms, letters, signed copies. */
  payView: 'cf_hrms_pay_view',
  /** Logins and access roles. */
  accessManage: 'cf_hrms_access_manage',
  /** A person's own place: their org chart slice and "My place". */
  selfView: 'cf_hrms_self_view',
} as const;
export type NamedRight = keyof typeof NAMED;

const tagOf = (area: Area, right: Right) => `cf_hrms_${area}_${right}`;

type AreaTags = Record<Right, string>;
/**
 * The tags by name, for the few places that need the string itself — the nav
 * (`navMeta.ts`) and a route guard. A right an area does not have maps to a tag
 * nobody holds, so asking for it is simply false.
 */
export const TAG: Record<Area, AreaTags> & { named: Record<NamedRight, string> } = {
  ...(Object.fromEntries(
    AREAS.map((a) => [a, { view: tagOf(a, 'view'), edit: tagOf(a, 'edit'), remove: tagOf(a, 'remove'), upload: tagOf(a, 'upload') }]),
  ) as Record<Area, AreaTags>),
  named: NAMED,
};

/** Every tag that opens an HR screen. Holding none of them = an employee login (self view only). */
export const SCREEN_TAGS: string[] = [...AREAS.map((a) => TAG[a].view), NAMED.accessManage];

/* ── who am I, from the server ────────────────────────────────────────── */

export interface AccessMe {
  role: { id: number; label: string; scope: 'COMPANY' | 'DEPARTMENT' };
  tags: string[];
  scope: { all: boolean; departmentNames: string[] };
}

interface Snapshot {
  me: AccessMe | null;
  /** True once the server has answered at least once (or failed once). */
  settled: boolean;
}

let snapshot: Snapshot = { me: null, settled: false };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let lastAsked = 0;

function publish(next: Snapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

/** Re-reads the person's rights. Safe to call often: one request at a time. */
export function refreshAccess(): Promise<void> {
  if (inFlight) return inFlight;
  lastAsked = Date.now();
  inFlight = api
    .get<AccessMe>('/access/me')
    .then((me) => {
      const same = snapshot.me && JSON.stringify(snapshot.me) === JSON.stringify(me);
      if (!same || !snapshot.settled) publish({ me, settled: true });
    })
    .catch(() => {
      // Keep what we had: a failed refresh must never take rights away or hand new ones out.
      if (!snapshot.settled) publish({ ...snapshot, settled: true });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Forget the cached answer (the company in the address changed, or the person signed out). */
export function resetAccess() {
  publish({ me: null, settled: false });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => snapshot;

/** At most one re-read per this many ms when the tab keeps gaining focus. */
const FOCUS_GAP_MS = 10_000;

/**
 * Mounted ONCE, in the shell: reads the rights on load and again whenever the
 * tab comes back into view, so a change made by an administrator reaches an
 * open tab without the person signing out.
 */
export function useAccessWatch() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId == null) return;
    resetAccess();
    void refreshAccess();
    const again = () => {
      if (Date.now() - lastAsked < FOCUS_GAP_MS) return;
      void refreshAccess();
    };
    // Coming back to the window, or the tab becoming the visible one.
    const shown = () => {
      if (document.visibilityState === 'visible') again();
    };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', shown);
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', shown);
    };
  }, [userId]);
}

/* ── the hook every screen uses ───────────────────────────────────────── */

type AreaFlags = Record<Right, boolean>;
export type Can = Record<Area, AreaFlags> & {
  named: Record<NamedRight, boolean>;
  /** By tag, for the nav and for a tag held in a variable. An empty tag is always allowed. */
  has: (tag?: string) => boolean;
  /** The person's access role, in the company's words — null until the server has answered. */
  role: AccessMe['role'] | null;
  /** "Whole company" or the departments they are limited to. */
  scope: AccessMe['scope'] | null;
  /** The server has answered: a missing right is really missing, not just not loaded yet. */
  settled: boolean;
  /** Holds the self view and no HR screen at all — a shop-floor employee login. */
  selfOnly: boolean;
};

export function useCan(): Can {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const fromLogin = useIsPermitted();
  const { user } = useAuth();
  // The server's bypass is on the platform role NAME `admin` (the Owner).
  const owner = String(user?.role ?? '').toLowerCase() === 'admin';

  return useMemo(() => {
    const held = snap.me ? new Set(snap.me.tags) : null;
    const has = (tag?: string) => {
      if (!tag) return true;
      if (owner) return true;
      return held ? held.has(tag) : fromLogin(tag);
    };
    const areas = Object.fromEntries(
      AREAS.map((a) => [
        a,
        {
          view: has(TAG[a].view),
          // A right an area does not have is never held, whatever the list says.
          edit: AREA_RIGHTS[a].includes('edit') && has(TAG[a].edit),
          remove: AREA_RIGHTS[a].includes('remove') && has(TAG[a].remove),
          upload: AREA_RIGHTS[a].includes('upload') && has(TAG[a].upload),
        },
      ]),
    ) as Record<Area, AreaFlags>;
    const named = Object.fromEntries(
      (Object.keys(NAMED) as NamedRight[]).map((k) => [k, has(NAMED[k])]),
    ) as Record<NamedRight, boolean>;
    return {
      ...areas,
      named,
      has,
      role: snap.me?.role ?? null,
      scope: snap.me?.scope ?? null,
      settled: snap.settled,
      selfOnly: named.selfView && !SCREEN_TAGS.some((t) => has(t)),
    };
  }, [snap, fromLogin, owner]);
}

/** What to say where a pay or contact value is hidden (spec §12.7) — never a blank or a dash. */
export const HIDDEN_PAY = 'Hidden — you do not have access to pay';
export const HIDDEN_CONTACT = 'Hidden — you do not have access to contact details';

/** "Whole company" / "Only Printing and below" — the scope line of "My access". */
export function scopeWords(scope: AccessMe['scope'] | null): string {
  if (!scope) return '';
  if (scope.all) return 'Whole company';
  if (!scope.departmentNames.length) return 'No department yet';
  const [first, ...rest] = scope.departmentNames;
  return rest.length ? `Only ${first} and the ${rest.length} under it` : `Only ${first}`;
}
