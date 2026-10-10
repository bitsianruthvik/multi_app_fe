import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Skeleton, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';
import { ErrorNotice, Mono, useIsPermitted, useToast } from '@shared/ui';
import type { OrgChartNode } from '../api/orgchart';
import { positionsApi, type PositionOccupant } from '../api/positions';
import { peopleApi, type EmployeeRow } from '../api/people';
import { assignmentsApi } from '../api/assignments';
import { SectionTitle } from './OrgChartSeatView';
import { OrgChartJobSection } from './OrgChartJobSection';
import { SHIFT_WORD, inPanelLink, smallLabel, type PanelNav, type PanelView } from './orgChartPanelNav';

/**
 * An OPEN seat, in the org chart's floating panel (spec §17): what the vacancy
 * is, and — for someone allowed to — putting a person in it.
 *
 * NOTHING NEW ON THE SERVER. Assigning writes one work assignment through
 * `POST /assignments` (role, position and shift taken from the seat), and "a
 * new employee" first writes the person through `POST /people/employees`. Both
 * services keep their own rules — a code already in use, a person who has
 * exited, one MAIN job per person — and their sentences are shown as they come.
 *
 * THE ONE-MAIN-JOB RULE, made visible instead of tripped over: someone with no
 * job gets this one as their main job; someone who already has a main job gets
 * this as an ADDITIONAL job, and the form says which before it is saved.
 *
 * "HOW LONG OPEN" IS ONLY SAID WHEN THE RECORDS SAY IT: the last person to hold
 * the seat and the day they left. Where nobody is recorded, that is the
 * sentence — a date is never made up.
 *
 * Two writes, not one transaction, when adding a new employee: if the person
 * saves and the assignment is refused, the form says the person now exists and
 * switches to assigning them, rather than leaving a half-done state unexplained.
 */

type OpenView = Extract<PanelView, { kind: 'open' }>;

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** The next code in the series the company already uses ("KP0071" → "KP0072"). Empty when there is no series. */
function suggestCode(codes: string[]): string {
  // The series most codes belong to (same letters in front), then one past its highest number.
  const series = new Map<string, { n: number; width: number; count: number }>();
  for (const c of codes) {
    const m = /^(.*?)(\d+)$/.exec(c.trim());
    if (!m) continue;
    const at = series.get(m[1]) ?? { n: 0, width: m[2].length, count: 0 };
    at.count += 1;
    if (Number(m[2]) >= at.n) {
      at.n = Number(m[2]);
      at.width = m[2].length;
    }
    series.set(m[1], at);
  }
  let best: [string, { n: number; width: number; count: number }] | null = null;
  for (const entry of series) if (!best || entry[1].count > best[1].count) best = entry;
  return best ? `${best[0]}${String(best[1].n + 1).padStart(best[1].width, '0')}` : '';
}

export function OrgChartOpenSeatView({
  view,
  node,
  asOf,
  company,
  nav,
  onChanged,
}: {
  company: string;
  view: OpenView;
  node: OrgChartNode | null;
  asOf: string;
  nav: PanelNav;
  /** After a person is assigned: the page reloads the chart. */
  onChanged?: () => void;
}) {
  const can = useIsPermitted();
  const toast = useToast();
  const canAssign = can('cf_hrms_assignments_manage') && can('cf_hrms_people_view');
  const canAddPerson = canAssign && can('cf_hrms_people_manage');

  const [past, setPast] = useState<PositionOccupant[] | null>(null);
  const [people, setPeople] = useState<EmployeeRow[] | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [picked, setPicked] = useState<EmployeeRow | null>(null);
  const [from, setFrom] = useState(todayIso());
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [joined, setJoined] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Who held it before — for "open since". Read-only, org_view.
  useEffect(() => {
    let live = true;
    positionsApi
      .occupants(view.positionId)
      .then((r) => {
        if (live) setPast(r.items);
      })
      .catch(() => {
        if (live) setPast([]);
      });
    return () => {
      live = false;
    };
  }, [view.positionId]);

  useEffect(() => {
    if (!canAssign) return;
    let live = true;
    peopleApi
      .list()
      .then((r) => {
        if (live) setPeople(r.items);
      })
      .catch((e) => {
        if (live) setError(e);
      });
    return () => {
      live = false;
    };
  }, [canAssign]);

  const suggested = useMemo(() => suggestCode((people ?? []).map((p) => p.employeeCode)), [people]);
  useEffect(() => {
    if (!codeTouched) setCode(suggested);
  }, [suggested, codeTouched]);

  // The shift this seat is for. A day-and-night position has a requirement row
  // per shift, which carries the shift's id; a single-shift seat uses its own.
  const shiftId =
    view.shift === 'G'
      ? node?.defaultShift?.id ?? null
      : node?.requirements?.find((r) => r.shiftCode === view.shift)?.shiftId ?? null;
  const shiftWord = SHIFT_WORD[view.shift] ?? view.shift;
  const title = node?.displayTitle || node?.title || 'this position';

  const lastHolder = useMemo(() => {
    const ended = (past ?? []).filter((o) => !o.liveOnDate && o.effectiveTo && o.effectiveTo < asOf);
    ended.sort((a, b) => (a.effectiveTo! < b.effectiveTo! ? 1 : -1));
    return ended[0] ?? null;
  }, [past, asOf]);

  const candidates = useMemo(
    () =>
      (people ?? [])
        .filter((p) => p.employmentStatus !== 'EXITED' && !(node?.occupants ?? []).some((o) => o.employeeId === p.id))
        // People with no job first: they are who an open seat is usually for.
        .sort(
          (a, b) =>
            Number(a.primaryAssignmentId != null) - Number(b.primaryAssignmentId != null) ||
            a.fullName.localeCompare(b.fullName),
        ),
    [people, node],
  );

  const assign = async (employee: { id: number; fullName: string; hasMainJob: boolean }, start: string) => {
    if (node?.roleId == null) throw new Error('This position has no role, so work cannot be assigned to it yet.');
    await assignmentsApi.create({
      employeeId: employee.id,
      roleId: node.roleId,
      positionId: view.positionId,
      defaultShiftId: shiftId,
      isPrimary: !employee.hasMainJob,
      status: 'ACTIVE',
      effectiveFrom: start,
    });
    toast.success(`${employee.fullName} is now in ${title}.`);
    onChanged?.();
    nav.back();
  };

  const submitExisting = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await assign({ id: picked.id, fullName: picked.fullName, hasMainJob: picked.primaryAssignmentId != null }, from);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const submitNew = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    let created: { id: number; fullName: string } | null = null;
    try {
      const d = await peopleApi.create({ fullName: name.trim(), employeeCode: code.trim(), dateOfJoining: joined });
      created = { id: d.employee.id, fullName: d.employee.fullName };
      await assign({ ...created, hasMainJob: false }, joined);
    } catch (e) {
      setError(e);
      if (created) {
        // The person saved; the assignment did not. Say so, and carry on from there.
        setNotice(`${created.fullName} has been added as an employee, but could not be put in this seat. Assign them below once the problem is fixed.`);
        const list = await peopleApi.list().catch(() => null);
        if (list) {
          setPeople(list.items);
          setPicked(list.items.find((p) => p.id === created!.id) ?? null);
        }
        setMode('existing');
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const facts: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Position',
      value: (
        <Box component="button" type="button" onClick={() => nav.back()} sx={inPanelLink}>
          {title}
        </Box>
      ),
    },
    { label: 'Role', value: node?.roleTitle ?? '—' },
    { label: 'Department', value: node?.departmentName ?? '—' },
    { label: 'Shift', value: shiftWord },
  ];

  return (
    <Box data-openview="">
      <Box
        component="dl"
        data-facts=""
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto minmax(0, 1fr)',
          columnGap: 1,
          rowGap: 0.25,
          alignItems: 'baseline',
          m: 0,
          fontSize: 13,
          lineHeight: 1.5,
          '@media (max-width: 420px)': { gridTemplateColumns: 'auto minmax(0, 1fr)' },
        }}
      >
        {facts.map((f) => (
          <Box key={f.label} sx={{ display: 'contents' }}>
            <Box component="dt" sx={smallLabel}>
              {f.label}
            </Box>
            <Box component="dd" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
              {f.value}
            </Box>
          </Box>
        ))}
      </Box>

      <Typography data-opensince="" sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.55, mt: 1 }}>
        {past == null
          ? '…'
          : lastHolder
            ? `This position was last held by ${lastHolder.employeeName}, until ${lastHolder.effectiveTo}.`
            : 'Nobody is recorded as having held this position before, so there is no date it became open.'}
      </Typography>

      <Box sx={{ mt: 2 }} data-assign="">
        <SectionTitle>Assign a person</SectionTitle>
        {!canAssign ? (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            Putting a person in a seat needs the permission to manage work assignments.
          </Typography>
        ) : people == null && !error ? (
          <Skeleton variant="rounded" height={40} />
        ) : (
          <Stack spacing={1.5}>
            {canAddPerson && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={mode}
                onChange={(_, v) => {
                  if (v) {
                    setMode(v);
                    setError(null);
                  }
                }}
                aria-label="Who to assign"
              >
                <ToggleButton value="existing">Someone already employed</ToggleButton>
                <ToggleButton value="new">A new employee</ToggleButton>
              </ToggleButtonGroup>
            )}

            {notice && (
              <Typography role="status" sx={{ fontSize: 13, color: 'var(--c-warning-800)', background: 'var(--c-warning-50)', borderRadius: 'var(--r-sm)', px: 1.25, py: 0.75 }}>
                {notice}
              </Typography>
            )}
            {!!error && <ErrorNotice error={error} fallback="That could not be saved." />}

            {mode === 'existing' ? (
              <>
                <Autocomplete
                  size="small"
                  options={candidates}
                  value={picked}
                  onChange={(_, v) => setPicked(v)}
                  getOptionLabel={(p) => `${p.fullName} (${p.employeeCode})`}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderOption={(props, p) => {
                    const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                    return (
                      <li key={key} {...rest}>
                        <Box sx={{ minWidth: 0 }}>
                          <Box sx={{ fontSize: 13.5 }}>
                            {p.fullName} <Mono sx={{ fontSize: 11.5 }}>{p.employeeCode}</Mono>
                          </Box>
                          <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                            {p.primaryRoleTitle ? `Now: ${p.primaryRoleTitle}` : 'No job assigned'}
                          </Box>
                        </Box>
                      </li>
                    );
                  }}
                  renderInput={(p) => <TextField {...p} label="Person" placeholder="Search by name or employee code" />}
                />
                {picked && (
                  <Typography data-mainjob="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                    {picked.primaryAssignmentId != null
                      ? `${picked.fullName} already has a main job${picked.primaryRoleTitle ? ` (${picked.primaryRoleTitle})` : ''}. This seat is added as an additional job; the main job stays as it is.`
                      : `${picked.fullName} has no job assigned, so this becomes their main job.`}
                  </Typography>
                )}
                <TextField
                  label="Starts on"
                  type="date"
                  size="small"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ maxWidth: 200 }}
                />
                <Box>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PersonAddAltRounded />}
                    disabled={!picked || !from || busy}
                    onClick={() => void submitExisting()}
                  >
                    {busy ? 'Assigning…' : `Assign to this seat`}
                  </Button>
                </Box>
              </>
            ) : (
              <>
                <TextField label="Full name" size="small" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    label="Employee code"
                    size="small"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setCodeTouched(true);
                    }}
                    required
                    helperText={suggested && !codeTouched ? 'The next code in your series — change it if needed.' : undefined}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Date of joining"
                    type="date"
                    size="small"
                    value={joined}
                    onChange={(e) => setJoined(e.target.value)}
                    required
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                  They are added as an employee and put in this seat on the {shiftWord.toLowerCase()} from their joining
                  date, as their main job. The rest of their record is filled in on their employee page.
                </Typography>
                <Box>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PersonAddAltRounded />}
                    disabled={!name.trim() || !code.trim() || !joined || busy}
                    onClick={() => void submitNew()}
                  >
                    {busy ? 'Adding…' : 'Add and assign'}
                  </Button>
                </Box>
              </>
            )}
          </Stack>
        )}
      </Box>

      {/* What whoever fills this seat will be doing. The POSITION's content —
          the role's KRAs, fixed, with the position's responsibilities and KPIs —
          and the same position-level editing the position view has. */}
      <Box sx={{ mt: 2 }} data-card-jobcontent="">
        <SectionTitle>KRAs, responsibilities and KPIs</SectionTitle>
        <Typography data-belongs="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5, mb: 0.75 }}>
          These belong to the position: whoever is put in this seat takes them on as they stand.
        </Typography>
        <OrgChartJobSection
          target={{ type: 'position', id: view.positionId }}
          roleId={node?.roleId ?? null}
          asOf={asOf}
          company={company}
          onChanged={onChanged}
          onOpenRole={(id, t) => nav.push({ kind: 'role', roleId: id, title: t })}
        />
      </Box>
    </Box>
  );
}

export default OrgChartOpenSeatView;
