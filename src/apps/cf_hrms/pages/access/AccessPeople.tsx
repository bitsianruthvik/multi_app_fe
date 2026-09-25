import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import KeyRounded from '@mui/icons-material/KeyRounded';
import {
  Callout,
  DataTable,
  EmptyState,
  ErrorNotice,
  FilterBar,
  FormDialog,
  Mono,
  PageHeader,
  StatSkeleton,
  StatStrip,
  useCompanySlug,
  useToast,
  type DataColumn,
  type Stat,
} from '@shared/ui';
import {
  accessApi,
  useIsPlatformAdmin,
  type PlatformRole,
  type PlatformTeam,
  type PlatformUser,
} from '../../api/access';
import { peopleApi, type EmployeeRow } from '../../api/people';

/**
 * People with logins — the platform accounts that can sign in (§4.2).
 *
 * THIS IS NOT THE EMPLOYEES SCREEN, and the distinction is the entire reason
 * this page needs teaching on it rather than just a table:
 *
 *   an EMPLOYEE is a person the company employs — they exist in HR whether or
 *   not they ever touch a computer;
 *   a USER is an account that can sign in.
 *
 * For Karni that is 13 employees and one login. A shop-floor operator, a
 * welder, a driver will never have one, and that is not a data gap to be
 * chased. The two are linked only where the same person needs both, through
 * `hrms_employees.user_id`, and this screen renders that link in both
 * directions so nobody has to hold the difference in their head.
 *
 * WHAT IS MISSING AND WHY. There is no Role column. The platform's `users`
 * resource projects id · name · email · company_id and a team join and nothing
 * more (see api/access.ts), so a login's role can be set when it is created but
 * cannot be read back through the generic API. A column of em dashes would be
 * worse than none, so the screen says where the answer lives instead.
 */

interface Draft {
  name: string;
  email: string;
  password: string;
  roleId: number | '';
  teamId: number | '';
}

const emptyDraft: Draft = { name: '', email: '', password: '', roleId: '', teamId: '' };

export default function AccessPeople() {
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPlatformAdmin();

  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  /**
   * Whether the employee list actually arrived. Without this the screen cannot
   * tell "this account belongs to nobody in HR" from "I could not read HR", and
   * it would print the first while meaning the second on every row.
   */
  const [employeesKnown, setEmployeesKnown] = useState(false);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [teams, setTeams] = useState<PlatformTeam[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  /**
   * Employees, roles and teams are all allowed to fail without taking the
   * screen with them: each one only enriches the list or fills a picker, and a
   * reader who cannot see the employee cross-links is still better served than
   * one who sees an error page. Only the users read is load-bearing.
   */
  const load = useCallback(async () => {
    setError(null);
    const [u, e, r, t] = await Promise.allSettled([
      accessApi.users(),
      peopleApi.list(),
      accessApi.roles(),
      accessApi.teams(),
    ]);
    if (u.status === 'fulfilled') setUsers(u.value);
    else {
      setError(u.reason);
      setUsers([]);
    }
    if (e.status === 'fulfilled') {
      setEmployees(e.value.items);
      setEmployeesKnown(true);
    }
    if (r.status === 'fulfilled') setRoles(r.value);
    if (t.status === 'fulfilled') setTeams(t.value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** user id → the employee who is that person. Built once, not per row. */
  const employeeByUser = useMemo(() => {
    const m = new Map<number, EmployeeRow>();
    for (const e of employees) if (e.userId) m.set(e.userId, e);
    return m;
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter((u) =>
      [u.name, u.email, u.teamName, employeeByUser.get(u.id)?.employeeCode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [users, search, employeeByUser]);

  /**
   * The stats are the teaching, in numbers. "Employees with no login" is
   * deliberately neutral: for a packaging plant it is the overwhelming majority
   * and always will be, and a warning tone would ask somebody to fix a number
   * that is not broken (§7.5 — a tone on a permanent fact trains people to
   * ignore tones).
   */
  const stats: Stat[] = useMemo(() => {
    const linked = (users ?? []).filter((u) => employeeByUser.has(u.id)).length;
    const withoutLogin = employees.filter((e) => !e.userId).length;
    const out: Stat[] = [
      { label: 'Logins', value: users?.length ?? 0, hint: 'Accounts that can sign in to this company' },
    ];
    // Both of these are statements about HR. If HR could not be read they would
    // be zeroes that read as facts, so they are simply not shown.
    if (employeesKnown) {
      out.push(
        {
          label: 'Also an employee',
          value: linked,
          hint: 'Logins linked to an employee record through hrms_employees.user_id',
        },
        {
          label: 'Employees with no login',
          value: withoutLogin,
          hint: 'Normal. Most of a workforce never needs an account.',
        },
      );
    }
    return out;
  }, [users, employees, employeeByUser, employeesKnown]);

  const columns: DataColumn<PlatformUser>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        sortValue: (r) => r.name,
        exportValue: (r) => r.name,
        render: (r) => <Box sx={{ fontWeight: 500 }}>{r.name}</Box>,
      },
      {
        key: 'email',
        header: 'Email',
        sortValue: (r) => r.email,
        exportValue: (r) => r.email,
        render: (r) => <Mono sx={{ color: 'var(--c-text-2)' }}>{r.email}</Mono>,
      },
      {
        key: 'team',
        header: 'Team',
        sortValue: (r) => r.teamName ?? null,
        exportValue: (r) => r.teamName ?? '',
        render: (r) =>
          r.teamName ? r.teamName : <Box sx={{ color: 'var(--c-text-3)' }}>No team</Box>,
      },
      {
        key: 'employee',
        header: 'Employee record',
        sortValue: (r) => employeeByUser.get(r.id)?.fullName ?? null,
        exportValue: (r) => employeeByUser.get(r.id)?.employeeCode ?? '',
        render: (r) => {
          const emp = employeeByUser.get(r.id);
          if (!emp) {
            return employeesKnown ? (
              <Box sx={{ color: 'var(--c-text-3)' }} title="This account is not linked to anyone in HR">
                Not linked
              </Box>
            ) : (
              <Box sx={{ color: 'var(--c-text-3)' }} title="The employee list could not be read, so the link is unknown">
                Unknown
              </Box>
            );
          }
          return (
            <Box
              component={Link}
              to={`/${company}/cf_hrms/employees/${emp.id}`}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                textDecoration: 'none',
                color: 'var(--c-primary-700)',
                fontWeight: 500,
                borderRadius: 'var(--r-sm)',
                px: 0.5,
                '&:hover': { background: 'var(--c-primary-50)' },
              }}
            >
              <BadgeRounded sx={{ fontSize: 16 }} aria-hidden />
              {emp.fullName}
              <Mono sx={{ color: 'var(--c-text-3)' }}>{emp.employeeCode}</Mono>
            </Box>
          );
        },
      },
    ],
    [company, employeeByUser, employeesKnown],
  );

  const draftValid =
    !!draft &&
    draft.name.trim().length > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim()) &&
    draft.password.length >= 8 &&
    draft.roleId !== '';

  const save = async () => {
    if (!draft || draft.roleId === '') return;
    await accessApi.createUser({
      name: draft.name.trim(),
      email: draft.email.trim(),
      password: draft.password,
      roleId: Number(draft.roleId),
      teamId: draft.teamId === '' ? null : Number(draft.teamId),
    });
    toast.success(`${draft.name.trim()} can now sign in.`);
    setDraft(null);
    await load();
  };

  return (
    <>
      <PageHeader
        title="People with logins"
        subtitle="Accounts that can sign in to this company's apps"
        actions={
          canManage ? (
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => setDraft(emptyDraft)}
              disabled={roles.length === 0}
              title={roles.length === 0 ? 'No roles exist yet, so a login has nothing to be' : undefined}
            >
              New login
            </Button>
          ) : null
        }
      />

      <Callout title="A login is not an employee" icon={<KeyRounded />}>
        An employee is a person the company employs. A login is an account that can sign in. Most of
        a workforce never has one and never needs one — creating a login here does not create an
        employee, and hiring someone does not create a login. Where the same person is both, the
        Employee record column links the two.
      </Callout>

      {error ? <ErrorNotice error={error} onRetry={load} /> : null}

      {users === null ? <StatSkeleton count={3} /> : <StatStrip stats={stats} />}

      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name, email, team or employee code"
      />

      <DataTable
        rows={filtered}
        columns={columns}
        getRowId={(r) => r.id}
        loading={users === null}
        storageKey="cf_hrms:access-users"
        exportName="logins"
        defaultSortKey="name"
        empty={
          search ? (
            <EmptyState
              title="No login matches that"
              body={`Nothing here contains "${search.trim()}".`}
              action={<Button onClick={() => setSearch('')}>Clear the search</Button>}
            />
          ) : (
            <EmptyState
              icon={<KeyRounded />}
              title="Nobody can sign in yet"
              body="This company has no accounts. Employees can be recorded in HR without one — a login is only needed for somebody who will use the software."
              action={
                canManage ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDraft(emptyDraft)}>
                    New login
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />

      <FormDialog
        open={!!draft}
        title="New login"
        subtitle="The account is created in this company. It can sign in straight away."
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel="Create login"
        busyLabel="Creating…"
        submitDisabled={!draftValid}
      >
        {draft && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            <TextField
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              autoFocus
              fullWidth
            />
            <TextField
              label="Email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              helperText="This is what they sign in with. It must be unique across the whole platform."
              fullWidth
            />
            <TextField
              label="Temporary password"
              type="password"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              helperText="At least 8 characters. It is hashed before it is stored, and they can change it from their profile once they are in."
              fullWidth
            />
            <TextField
              select
              label="Role"
              value={draft.roleId}
              onChange={(e) => setDraft({ ...draft, roleId: Number(e.target.value) })}
              helperText="The role decides what they can do. Change what a role may do on Roles and access."
              fullWidth
            >
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Team"
              value={draft.teamId}
              onChange={(e) =>
                setDraft({ ...draft, teamId: e.target.value === '' ? '' : Number(e.target.value) })
              }
              helperText={
                teams.length === 0
                  ? 'This company has no teams. A login does not need one.'
                  : 'Optional. Teams narrow what some apps show; they are not HR departments.'
              }
              disabled={teams.length === 0}
              fullWidth
            >
              <MenuItem value="">No team</MenuItem>
              {teams.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
            <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
              This creates an account, not an employee. If this person also works here, add them on
              Employees and link the two there.
            </Box>
          </Box>
        )}
      </FormDialog>
    </>
  );
}
