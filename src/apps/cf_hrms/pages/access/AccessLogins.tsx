import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, MenuItem, TextField } from '@mui/material';
import KeyRounded from '@mui/icons-material/KeyRounded';
import {
  ConfirmDialog, EmptyState, ErrorNotice, FacetChip, FilterBar, ListSkeleton, Mono, SectionCard, Surface, ToneBadge,
  errorMessage, useToast,
} from '@shared/ui';
import { refreshAccess } from '../../access/can';
import { accessApi, type AccessRole, type Login, type LoginsAnswer, type PersonWithoutLogin } from '../../api/access';
import { ScreenHeader } from '../../components/TabbedScreen';
import { LoginPasswordDialog, type PasswordJob } from '../../components/access/LoginPasswordDialog';

/**
 * Logins (CF_HRMS_HIRING_SPEC.md §12.7) — every login of the company with the
 * person it belongs to, its access role (changed in place) and whether it can
 * sign in; and, below, the people who have no login yet.
 *
 * THE ROLE SELECT SHOWS WHAT THE SERVER SAYS. It is never changed ahead of the
 * answer: a refusal (the last Owner cannot be moved) leaves it where it was and
 * puts the server's sentence under the row.
 *
 * PASSWORDS are not handled here at all. Creating a login and resetting a
 * password both happen inside `LoginPasswordDialog`, which tells this screen
 * only that it is done.
 *
 * The role filter lives in the address (`?tab=logins&roleId=7`), so "show me
 * who holds this role" can be a link from the Access roles tab.
 */

type StateFilter = 'all' | 'ACTIVE' | 'DISABLED';

/** How many people without a login are listed before "Show all". */
const FIRST_PEOPLE = 50;

const lettersOnly = (s: string) =>
  s
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** firstname.lastname@<the domain most logins already use>; '' when there is nothing to go on. */
function suggestEmail(name: string, logins: Login[]): string {
  const counts = new Map<string, number>();
  for (const l of logins) {
    const domain = l.email.split('@')[1]?.trim().toLowerCase();
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [domain, n] of counts) {
    if (n > bestCount) {
      best = domain;
      bestCount = n;
    }
  }
  if (!best) return '';
  const parts = name.split(/\s+/).map(lettersOnly).filter(Boolean);
  if (!parts.length) return '';
  const local = parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`;
  return `${local}@${best}`;
}

const matches = (needle: string, ...hay: (string | null | undefined)[]) =>
  hay.some((h) => !!h && h.toLowerCase().includes(needle));

export default function AccessLogins() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const roleFilter = Number(params.get('roleId')) || null;

  const [data, setData] = useState<LoginsAnswer | null>(null);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [toggling, setToggling] = useState<Login | null>(null);
  const [job, setJob] = useState<PasswordJob | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [peopleQ, setPeopleQ] = useState('');
  const [allPeople, setAllPeople] = useState(false);

  const loadLogins = useCallback(() => {
    return accessApi
      .logins()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => {
        setError(e);
        setData((cur) => cur ?? { logins: [], withoutLogin: [] });
      });
  }, []);

  const load = useCallback(() => {
    setError(null);
    void loadLogins();
    accessApi.roles().then(setRoles).catch(setError);
  }, [loadLogins]);

  useEffect(() => {
    load();
  }, [load]);

  const setRoleFilter = (roleId: number | null) =>
    setParams(roleId ? { tab: 'logins', roleId: String(roleId) } : { tab: 'logins' }, { replace: true });

  const logins = useMemo(() => data?.logins ?? [], [data]);
  const people = useMemo(() => data?.withoutLogin ?? [], [data]);

  const needle = q.trim().toLowerCase();
  const searched = useMemo(
    () =>
      needle
        ? logins.filter((l) =>
            matches(needle, l.name, l.email, l.role.label, l.employee?.employeeCode, l.employee?.fullName, l.employee?.positionCode, l.employee?.departmentName),
          )
        : logins,
    [logins, needle],
  );
  const shown = useMemo(
    () => searched.filter((l) => (stateFilter === 'all' || l.state === stateFilter) && (!roleFilter || l.role.id === roleFilter)),
    [searched, stateFilter, roleFilter],
  );

  /** Role chips: every role a login holds, plus the one the address asks for. */
  const roleChips = useMemo(() => {
    const byId = new Map<number, { id: number; label: string; count: number }>();
    for (const l of logins) {
      const cur = byId.get(l.role.id);
      if (cur) cur.count += 1;
      else byId.set(l.role.id, { id: l.role.id, label: l.role.label, count: 1 });
    }
    if (roleFilter && !byId.has(roleFilter)) {
      byId.set(roleFilter, { id: roleFilter, label: roles.find((r) => r.roleId === roleFilter)?.label ?? 'This role', count: 0 });
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [logins, roles, roleFilter]);

  const replaceLogin = (updated: Login) =>
    setData((cur) => (cur ? { ...cur, logins: cur.logins.map((l) => (l.userId === updated.userId ? { ...l, ...updated } : l)) } : cur));

  const changeRole = async (login: Login, roleId: number) => {
    if (roleId === login.role.id) return;
    setRowBusy(login.userId);
    setRowError((cur) => {
      const rest = { ...cur };
      delete rest[login.userId];
      return rest;
    });
    try {
      const updated = await accessApi.updateLogin(login.userId, { roleId });
      replaceLogin(updated);
      toast.success(`${login.name} now holds ${updated.role?.label ?? 'the new access role'}. It applies from their next click.`);
      // If it was their own role, their own menu follows.
      void refreshAccess();
    } catch (e) {
      // The select is still the server's value, so it is already back where it was.
      setRowError((cur) => ({ ...cur, [login.userId]: errorMessage(e, 'The access role could not be changed.') }));
    } finally {
      setRowBusy(null);
    }
  };

  const toggleState = async () => {
    if (!toggling) return;
    const disabling = toggling.state === 'ACTIVE';
    const updated = disabling ? await accessApi.disableLogin(toggling.userId) : await accessApi.enableLogin(toggling.userId);
    replaceLogin(updated);
    toast.success(disabling ? `${toggling.name} can no longer sign in to HRMS.` : `${toggling.name} can sign in to HRMS again.`);
    void refreshAccess();
    void loadLogins();
  };

  const peopleNeedle = peopleQ.trim().toLowerCase();
  const peopleFound = useMemo(
    () => (peopleNeedle ? people.filter((p) => matches(peopleNeedle, p.employeeCode, p.name, p.positionCode, p.roleTitle)) : people),
    [people, peopleNeedle],
  );
  const peopleShown = allPeople ? peopleFound : peopleFound.slice(0, FIRST_PEOPLE);

  const startCreate = (person: PersonWithoutLogin) =>
    setJob({ kind: 'create', person, roles, suggestedEmail: suggestEmail(person.name, logins) });

  const filtered = !!needle || stateFilter !== 'all' || !!roleFilter;
  const clearFilters = () => {
    setQ('');
    setStateFilter('all');
    if (roleFilter) setRoleFilter(null);
  };

  return (
    <>
      <ScreenHeader
        title="Logins"
        subtitle="Everyone who can sign in to HRMS. Change an access role here and it applies from the person's next click."
      />

      {!!error && <ErrorNotice error={error} onRetry={load} />}

      {data == null ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <FilterBar search={q} onSearch={setQ} placeholder="Search name, email, employee code…">
            <FacetChip label="All" count={searched.length} active={stateFilter === 'all'} onClick={() => setStateFilter('all')} />
            <FacetChip
              label="Active"
              count={searched.filter((l) => l.state === 'ACTIVE').length}
              active={stateFilter === 'ACTIVE'}
              onClick={() => setStateFilter(stateFilter === 'ACTIVE' ? 'all' : 'ACTIVE')}
            />
            <FacetChip
              label="Disabled"
              count={searched.filter((l) => l.state === 'DISABLED').length}
              active={stateFilter === 'DISABLED'}
              onClick={() => setStateFilter(stateFilter === 'DISABLED' ? 'all' : 'DISABLED')}
            />
            {roleChips.length > 0 && <Box aria-hidden sx={{ width: '1px', alignSelf: 'stretch', background: 'var(--c-divider)', mx: 0.5 }} />}
            {roleChips.map((r) => (
              <FacetChip
                key={r.id}
                label={r.label}
                count={r.count}
                active={roleFilter === r.id}
                onClick={() => setRoleFilter(roleFilter === r.id ? null : r.id)}
              />
            ))}
          </FilterBar>

          {logins.length === 0 && !error ? (
            <EmptyState
              icon={<KeyRounded />}
              title="No login yet"
              hint="Nobody can sign in to HRMS yet. Create a login for a person from the list below."
            />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<KeyRounded />}
              title="No login matches"
              hint="Nothing fits the search and the filters you chose."
              action={
                filtered ? (
                  <Button size="small" variant="outlined" onClick={clearFilters}>
                    Clear search and filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Surface e={1} component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}>
              {shown.map((l) => {
                const busy = rowBusy === l.userId;
                const roleKnown = roles.some((r) => r.roleId === l.role.id);
                const place = [l.employee?.positionCode, l.employee?.departmentName].filter(Boolean).join(' · ');
                return (
                  <Box
                    component="li"
                    key={l.userId}
                    sx={{
                      display: 'grid',
                      columnGap: 2,
                      rowGap: 1,
                      alignItems: 'center',
                      px: 2,
                      py: 1.5,
                      borderBottom: '1px solid var(--c-divider)',
                      '&:last-of-type': { borderBottom: 'none' },
                      gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: 'minmax(0, 1.15fr) minmax(0, 1.15fr) minmax(170px, 220px) 96px auto' },
                      gridTemplateAreas: {
                        xs: '"who state" "person person" "role role" "actions actions" "note note"',
                        md: '"who person role state actions" "note note note note note"',
                      },
                    }}
                  >
                    <Box sx={{ gridArea: 'who', minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Box sx={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{l.name}</Box>
                        {l.isYou && <ToneBadge tone="info" noIcon label="You" />}
                      </Box>
                      <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{l.email}</Box>
                    </Box>

                    <Box sx={{ gridArea: 'person', minWidth: 0 }}>
                      {l.employee ? (
                        <>
                          <Box sx={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>
                            <Mono chip sx={{ mr: 0.75 }}>{l.employee.employeeCode}</Mono>
                            {l.employee.fullName}
                          </Box>
                          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25, overflowWrap: 'anywhere' }}>
                            {place || 'Holds no position'}
                          </Box>
                        </>
                      ) : (
                        <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Not linked to an employee</Box>
                      )}
                    </Box>

                    <TextField
                      select
                      size="small"
                      value={l.role.id}
                      disabled={busy}
                      onChange={(e) => void changeRole(l, Number(e.target.value))}
                      slotProps={{ htmlInput: { 'aria-label': `Access role of ${l.name}` } }}
                      sx={{ gridArea: 'role', minWidth: 0 }}
                    >
                      {roles.map((r) => (
                        <MenuItem key={r.roleId} value={r.roleId}>
                          {r.label}
                        </MenuItem>
                      ))}
                      {/* A role this screen's list does not carry is still shown as what the login holds. */}
                      {!roleKnown && <MenuItem value={l.role.id}>{l.role.label}</MenuItem>}
                    </TextField>

                    <Box sx={{ gridArea: 'state', justifySelf: { xs: 'end', md: 'start' } }}>
                      {l.state === 'ACTIVE' ? (
                        <ToneBadge tone="success" label="Active" title="Can sign in to HRMS" />
                      ) : (
                        <ToneBadge tone="neutral" label="Disabled" title="Cannot sign in to HRMS. Nothing was deleted." />
                      )}
                    </Box>

                    <Box sx={{ gridArea: 'actions', display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', md: 'flex-end' }, ml: { xs: -0.75, md: 0 } }}>
                      <Button size="small" onClick={() => setJob({ kind: 'reset', login: l })} disabled={busy}>
                        Reset password
                      </Button>
                      {/* Nobody disables their own login: they would lock themselves out. */}
                      {!l.isYou &&
                        (l.state === 'ACTIVE' ? (
                          <Button size="small" color="error" onClick={() => setToggling(l)} disabled={busy}>
                            Disable
                          </Button>
                        ) : (
                          <Button size="small" onClick={() => setToggling(l)} disabled={busy}>
                            Enable
                          </Button>
                        ))}
                    </Box>

                    {rowError[l.userId] && (
                      <Box role="alert" sx={{ gridArea: 'note', fontSize: 13, color: 'var(--c-danger-600)' }}>
                        {rowError[l.userId]}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Surface>
          )}

          <SectionCard
            sx={{ mt: 3 }}
            flush
            title={`People without a login · ${people.length}`}
            subtitle={people.length ? 'Employees who cannot sign in yet.' : 'Every employee has a login.'}
            action={
              people.length > 0 ? (
                <Button size="small" onClick={() => setShowPeople((v) => !v)} aria-expanded={showPeople}>
                  {showPeople ? 'Hide' : 'Show'}
                </Button>
              ) : undefined
            }
          >
            {showPeople && people.length > 0 && (
              <>
                <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid var(--c-divider)' }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search employee code, name, position…"
                    value={peopleQ}
                    onChange={(e) => setPeopleQ(e.target.value)}
                    slotProps={{ htmlInput: { 'aria-label': 'Search people without a login' } }}
                    sx={{ maxWidth: 420 }}
                  />
                </Box>
                {peopleFound.length === 0 ? (
                  <Box sx={{ px: 2, py: 3, fontSize: 13.5, color: 'var(--c-text-2)' }}>
                    Nobody without a login matches that search.{' '}
                    <Button size="small" onClick={() => setPeopleQ('')}>
                      Clear search
                    </Button>
                  </Box>
                ) : (
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {peopleShown.map((p) => (
                      <Box
                        component="li"
                        key={p.employeeId}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          flexWrap: 'wrap',
                          px: 2,
                          py: 1.25,
                          borderBottom: '1px solid var(--c-divider)',
                          '&:last-of-type': { borderBottom: 'none' },
                        }}
                      >
                        <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                          <Box sx={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>
                            <Mono chip sx={{ mr: 0.75 }}>{p.employeeCode}</Mono>
                            {p.name}
                          </Box>
                          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25, overflowWrap: 'anywhere' }}>
                            {[p.positionCode, p.roleTitle].filter(Boolean).join(' · ') || 'Holds no position'}
                          </Box>
                        </Box>
                        <Button size="small" variant="outlined" onClick={() => startCreate(p)}>
                          Create login
                        </Button>
                      </Box>
                    ))}
                  </Box>
                )}
                {peopleFound.length > peopleShown.length && (
                  <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid var(--c-divider)' }}>
                    <Button size="small" onClick={() => setAllPeople(true)}>
                      Show all {peopleFound.length}
                    </Button>
                  </Box>
                )}
              </>
            )}
          </SectionCard>
        </>
      )}

      {toggling && (
        <ConfirmDialog
          open
          title={toggling.state === 'ACTIVE' ? `Disable the login of ${toggling.name}?` : `Enable the login of ${toggling.name}?`}
          entityName={toggling.email}
          body={
            toggling.state === 'ACTIVE'
              ? 'They can no longer sign in to HRMS. Nothing is deleted.'
              : 'They can sign in to HRMS again, with the access role they hold.'
          }
          confirmLabel={toggling.state === 'ACTIVE' ? 'Disable login' : 'Enable login'}
          onConfirm={toggleState}
          onClose={() => setToggling(null)}
        />
      )}

      {job && (
        <LoginPasswordDialog
          key={job.kind === 'create' ? `c${job.person.employeeId}` : `r${job.login.userId}`}
          job={job}
          onDone={() => {
            void loadLogins();
            void refreshAccess();
          }}
          onClose={() => setJob(null)}
        />
      )}
    </>
  );
}
