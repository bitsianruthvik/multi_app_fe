/**
 * Attendance › Policies, Devices, Imports, Close month (CF_HRMS_HIRING_SPEC.md §28.7) — the
 * set-up tabs of HR's Attendance screen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import {
  Callout, ConfirmDialog, EmptyState, ErrorNotice, FormDialog, ListSkeleton, PromptDialog, SectionCard, ToneBadge, errorMessage, useToast,
} from '@shared/ui';
import { getApiBaseUrl } from '@core/api/client';
import { useCan } from '../../access/can';
import { readFileBase64, saveBase64File } from '../../api/excel';
import { leaveApi, type LeaveType } from '../../api/leave';
import { orgApi } from '../../api/organisation';
import { listRoles } from '../../api/roles';
import { peopleApi } from '../../api/people';
import {
  attendanceApi, dayLabel, hm, minutesWord, monthLabel, todayLocal,
  type Action, type ApiKey, type AssignmentRow, type AttPolicy, type Device, type DeviceEvent, type ImportPreview, type Mapping, type MonthState, type Rules, type Settings, type Unmapped,
} from '../../api/attendance';
import { ScreenHeader } from '../TabbedScreen';
import { PolicySentences } from './AttendanceParts';

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const str = (v: number | null | undefined) => (v == null ? '' : String(v));

/* ══ Policies ═══════════════════════════════════════════════════════════════ */

const EMPTY_RULES: Rules = {
  graceInMinutes: 10, graceOutMinutes: 10, lateMarks: null, shortDay: { halfDayBelowHours: 4.5, absentBelowHours: null },
  missingPunch: { treatAs: 'ASK', askWithinDays: 3 }, absentIsLop: true, sandwich: false, shortPermission: null, overtime: null,
};

function PolicyEditor({ policy, types, onClose, onSaved }: { policy: AttPolicy | null; types: LeaveType[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(policy?.name ?? '');
  const [description, setDescription] = useState(policy?.description ?? '');
  const [r, setR] = useState<Rules>(policy?.rules ?? EMPTY_RULES);
  const [said, setSaid] = useState<{ sentences: string[]; problems: string[] }>({ sentences: policy?.sentences ?? [], problems: [] });
  const set = (patch: Partial<Rules>) => setR((x) => ({ ...x, ...patch }));
  useEffect(() => {
    const t = setTimeout(() => { attendanceApi.sentences(r).then(setSaid).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [r]);
  const lm = r.lateMarks;
  const action = lm?.action;
  return (
    <FormDialog open maxWidth="md" title={policy ? `Change ${policy.name}` : 'New attendance policy'} subtitle="Every rule is optional. The sentences on the right are what people will read."
      onClose={onClose} submitDisabled={!name.trim() || said.problems.length > 0} enterSubmits={false}
      onSubmit={async () => {
        const body = { name: name.trim(), description: description.trim() || null, rules: r };
        if (policy) await attendanceApi.updatePolicy(policy.id, body); else await attendanceApi.createPolicy(body);
        onSaved();
      }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 2.5, mt: 0.5 }}>
        <Stack spacing={1.5}>
          <TextField size="small" label="Name" required value={name} onChange={(e) => setName(e.target.value)} data-field="policy-name" />
          <TextField size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField size="small" label="Grace — arriving late (min)" value={str(r.graceInMinutes)} onChange={(e) => set({ graceInMinutes: num(e.target.value) })} helperText="Blank: the shift’s grace" data-field="grace-in" />
            <TextField size="small" label="Grace — leaving early (min)" value={str(r.graceOutMinutes)} onChange={(e) => set({ graceOutMinutes: num(e.target.value) })} />
          </Box>
          <FormControlLabel control={<Switch checked={Boolean(lm)} onChange={(e) => set({ lateMarks: e.target.checked ? { count: 3, includeEarlyOut: false, action: { type: 'LEAVE', days: 0.5, leaveTypeIds: types.filter((t) => /^CL$/i.test(t.code)).map((t) => t.id), elseLop: true } } : null })} />} label="Late marks lead to a penalty" />
          {lm && action && (
            <Box sx={{ display: 'grid', gap: 1.25, pl: 2, borderLeft: '2px solid var(--c-divider)' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <TextField size="small" label="Every … late marks in a month" value={str(lm.count)} onChange={(e) => set({ lateMarks: { ...lm, count: Number(e.target.value) || 0 } })} data-field="late-count" />
                <TextField select size="small" label="Then" value={action.type} onChange={(e) => set({ lateMarks: { ...lm, action: { ...action, type: e.target.value as Action['type'] } } })}>
                  <MenuItem value="LEAVE">Take leave (else loss of pay)</MenuItem>
                  <MenuItem value="LOP">Loss of pay</MenuItem>
                  <MenuItem value="AMOUNT">A fixed amount</MenuItem>
                  <MenuItem value="WARNING">A warning only</MenuItem>
                </TextField>
              </Box>
              {(action.type === 'LEAVE' || action.type === 'LOP') && (
                <TextField select size="small" label="How much" value={String(action.days ?? 0.5)} onChange={(e) => set({ lateMarks: { ...lm, action: { ...action, days: Number(e.target.value) } } })}>
                  <MenuItem value="0.5">Half a day</MenuItem><MenuItem value="1">A whole day</MenuItem>
                </TextField>
              )}
              {action.type === 'LEAVE' && (
                <>
                  <Autocomplete multiple size="small" options={types} getOptionLabel={(t) => `${t.code} ${t.name}`} value={types.filter((t) => (action.leaveTypeIds ?? []).includes(t.id))}
                    onChange={(_, v) => set({ lateMarks: { ...lm, action: { ...action, leaveTypeIds: v.map((t) => t.id) } } })} renderInput={(p) => <TextField {...p} label="Take from (in this order)" />} />
                  <FormControlLabel control={<Checkbox checked={action.elseLop !== false} onChange={(e) => set({ lateMarks: { ...lm, action: { ...action, elseLop: e.target.checked } } })} />} label="When none is left, without pay (else a warning)" />
                </>
              )}
              {action.type === 'AMOUNT' && <TextField size="small" label="Amount (₹)" value={str(action.amount)} onChange={(e) => set({ lateMarks: { ...lm, action: { ...action, amount: num(e.target.value) ?? 0 } } })} />}
              <FormControlLabel control={<Checkbox checked={lm.includeEarlyOut} onChange={(e) => set({ lateMarks: { ...lm, includeEarlyOut: e.target.checked } })} />} label="Leaving early counts as a mark too" />
            </Box>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField size="small" label="Half day below (hours)" value={str(r.shortDay?.halfDayBelowHours)} onChange={(e) => set({ shortDay: { halfDayBelowHours: num(e.target.value), absentBelowHours: r.shortDay?.absentBelowHours ?? null } })} data-field="half-below" />
            <TextField size="small" label="Absent below (hours)" value={str(r.shortDay?.absentBelowHours)} onChange={(e) => set({ shortDay: { halfDayBelowHours: r.shortDay?.halfDayBelowHours ?? null, absentBelowHours: num(e.target.value) } })} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField select size="small" label="Only one punch in a day" value={r.missingPunch?.treatAs ?? ''} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
              onChange={(e) => set({ missingPunch: e.target.value ? { treatAs: e.target.value as 'ASK', askWithinDays: r.missingPunch?.askWithinDays ?? 3 } : null })}>
              <MenuItem value="">Present, marked for a correction</MenuItem>
              <MenuItem value="ASK">Must be corrected within … days</MenuItem>
              <MenuItem value="HALF_DAY">A half day</MenuItem>
              <MenuItem value="ABSENT">Absent</MenuItem>
            </TextField>
            {r.missingPunch?.treatAs === 'ASK' && <TextField size="small" label="Days to correct it" value={str(r.missingPunch.askWithinDays)} onChange={(e) => set({ missingPunch: { treatAs: 'ASK', askWithinDays: num(e.target.value) } })} />}
          </Box>
          <FormControlLabel control={<Switch checked={r.absentIsLop} onChange={(e) => set({ absentIsLop: e.target.checked })} />} label="An absent day without leave is loss of pay" />
          <FormControlLabel control={<Switch checked={r.sandwich} onChange={(e) => set({ sandwich: e.target.checked })} />} label="Sandwich: days off between two absent days are absent" />
          <FormControlLabel control={<Switch checked={Boolean(r.shortPermission)} onChange={(e) => set({ shortPermission: e.target.checked ? { perMonth: 1, maxMinutes: 120 } : null })} />} label="Short permission" />
          {r.shortPermission && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, pl: 2 }}>
              <TextField size="small" label="Times a month" value={str(r.shortPermission.perMonth)} onChange={(e) => set({ shortPermission: { ...r.shortPermission!, perMonth: Number(e.target.value) || 0 } })} />
              <TextField size="small" label="Up to (minutes)" value={str(r.shortPermission.maxMinutes)} onChange={(e) => set({ shortPermission: { ...r.shortPermission!, maxMinutes: Number(e.target.value) || 0 } })} />
            </Box>
          )}
          <FormControlLabel control={<Switch checked={Boolean(r.overtime)} onChange={(e) => set({ overtime: e.target.checked ? { afterMinutes: 30, rateMultiplier: 2, minMinutes: 30, maxMinutesPerDay: 240 } : null })} />} label="Overtime is paid" />
          {r.overtime && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, pl: 2 }}>
              <TextField size="small" label="Counts after (min beyond the shift)" value={str(r.overtime.afterMinutes)} onChange={(e) => set({ overtime: { ...r.overtime!, afterMinutes: Number(e.target.value) || 0 } })} />
              <TextField size="small" label="Rate (× the hourly pay)" value={str(r.overtime.rateMultiplier)} onChange={(e) => set({ overtime: { ...r.overtime!, rateMultiplier: Number(e.target.value) || 0 } })} />
              <TextField size="small" label="At least (min)" value={str(r.overtime.minMinutes)} onChange={(e) => set({ overtime: { ...r.overtime!, minMinutes: Number(e.target.value) || 0 } })} />
              <TextField size="small" label="At most a day (min)" value={str(r.overtime.maxMinutesPerDay)} onChange={(e) => set({ overtime: { ...r.overtime!, maxMinutesPerDay: num(e.target.value) } })} />
            </Box>
          )}
        </Stack>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75 }}>In words</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13.5, '& li': { mb: 0.5 } }} data-policy-sentences>{said.sentences.map((s, i) => <li key={i}>{s}</li>)}</Box>
          {said.problems.length > 0 && <Callout tone="danger" title="To fix" sx={{ mt: 1.5 }}>{said.problems.join(' ')}</Callout>}
        </Box>
      </Box>
    </FormDialog>
  );
}

function AssignDialog({ policies, onClose, onSaved }: { policies: AttPolicy[]; onClose: () => void; onSaved: () => void }) {
  const [scope, setScope] = useState<AssignmentRow['scope']>('ROLE');
  const [targets, setTargets] = useState<{ id: number; name: string }[]>([]);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [policyId, setPolicyId] = useState<number | ''>(policies[0]?.id ?? '');
  useEffect(() => {
    setTargetId(null);
    if (scope === 'ROLE') listRoles().then((r) => setTargets((r.items ?? []).map((x) => ({ id: x.id, name: x.title })))).catch(() => setTargets([]));
    else if (scope === 'LOCATION') orgApi.lookups().then((l) => setTargets(l.locations.map((x) => ({ id: x.id, name: x.name })))).catch(() => setTargets([]));
    else if (scope === 'LABEL') orgApi.departmentLabels.list().then((l) => setTargets(l.map((x) => ({ id: x.id, name: x.name })))).catch(() => setTargets([]));
    else setTargets([]);
  }, [scope]);
  return (
    <FormDialog open title="Where a policy applies" subtitle="The most specific wins: a role, else the department’s label, else the location, else the company default." onClose={onClose}
      submitDisabled={!policyId || (scope !== 'COMPANY' && !targetId)}
      onSubmit={async () => { await attendanceApi.assign({ scope, targetId: scope === 'COMPANY' ? null : targetId, policyId: Number(policyId) }); onSaved(); }}>
      <Box sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
        <TextField select size="small" label="To" value={scope} onChange={(e) => setScope(e.target.value as AssignmentRow['scope'])}>
          <MenuItem value="COMPANY">The whole company (the default)</MenuItem><MenuItem value="LOCATION">A location</MenuItem><MenuItem value="LABEL">A department label</MenuItem><MenuItem value="ROLE">A role</MenuItem>
        </TextField>
        {scope !== 'COMPANY' && (
          <Autocomplete size="small" options={targets} getOptionLabel={(t) => t.name} value={targets.find((t) => t.id === targetId) ?? null} onChange={(_, v) => setTargetId(v?.id ?? null)} renderInput={(p) => <TextField {...p} label="Which" />} />
        )}
        <TextField select size="small" label="Policy" value={policyId} onChange={(e) => setPolicyId(Number(e.target.value))}>
          {policies.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
      </Box>
    </FormDialog>
  );
}

export function AttPolicies() {
  const can = useCan();
  const toast = useToast();
  const [data, setData] = useState<{ policies: AttPolicy[]; assignments: AssignmentRow[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [editing, setEditing] = useState<AttPolicy | 'new' | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<AssignmentRow | null>(null);
  const load = useCallback(() => { attendanceApi.policies().then((d) => { setData(d); setError(null); }).catch(setError); }, []);
  useEffect(() => { load(); leaveApi.types().then(setTypes).catch(() => {}); }, [load]);
  return (
    <>
      <ScreenHeader title="Policies" subtitle="Rules for late marks, short days, missing punches, absence, overtime — and where each policy applies."
        actions={can.attendance.edit ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => setAssigning(true)} disabled={!data?.policies.length}>Where it applies</Button>
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing('new')} data-action="new-policy">New policy</Button>
          </Box>
        ) : undefined} />
      <ErrorNotice error={error} onRetry={load} />
      {!data ? <ListSkeleton rows={3} /> : data.policies.length === 0 ? <EmptyState title="No attendance policy yet" hint="Without one, each shift’s grace applies and nothing else." /> : (
        <Stack spacing={2}>
          {data.policies.map((p) => (
            <SectionCard key={p.id} title={p.name} subtitle={p.description ?? undefined}
              actions={can.attendance.edit ? <Button size="small" onClick={() => setEditing(p)} data-action="edit-policy">Change</Button> : undefined}>
              <PolicySentences line={p.assignments.length ? `Applies to: ${p.assignments.map((a) => `${a.target}${a.scope === 'ROLE' ? '' : ` (${a.scope.toLowerCase()})`}`).slice(0, 12).join(', ')}${p.assignments.length > 12 ? ` and ${p.assignments.length - 12} more` : ''}` : 'Not assigned anywhere yet.'} sentences={p.sentences} />
              {can.attendance.remove && p.assignments.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                  {p.assignments.slice(0, 20).map((a) => <Button key={a.id} size="small" color="inherit" onClick={() => setRemoving(a)} sx={{ fontSize: 12 }}>✕ {a.target}</Button>)}
                </Box>
              )}
            </SectionCard>
          ))}
        </Stack>
      )}
      {editing && <PolicyEditor policy={editing === 'new' ? null : editing} types={types} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.success('Policy saved.'); load(); }} />}
      {assigning && data && <AssignDialog policies={data.policies} onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); toast.success('Saved.'); load(); }} />}
      {removing && (
        <ConfirmDialog open title="Take this assignment off?" body={`${removing.target} will follow the next rule up (label, location, company).`} confirmLabel="Take it off" danger
          onClose={() => setRemoving(null)} onConfirm={async () => { await attendanceApi.assign({ scope: removing.scope, targetId: removing.locationId ?? removing.roleId ?? removing.labelId, policyId: null }); setRemoving(null); load(); }} />
      )}
    </>
  );
}

/* ══ Devices ════════════════════════════════════════════════════════════════ */

const eventWords = (e: DeviceEvent) => (e.kind === 'IP_CHANGED'
  ? `Now talks from ${e.ip ?? '?'} (was ${e.previousIp ?? '?'})`
  : `Refused a push from ${e.ip ?? '?'} (not an allowed address)`);

function DeviceDialog({ device, onClose, onSaved }: { device: Device | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: device?.name ?? '', serialNumber: device?.serialNumber ?? '', make: device?.make ?? 'ZKTeco', model: device?.model ?? '', timezone: device?.timezone ?? 'Asia/Kolkata', protocol: device?.protocol ?? 'ADMS', status: device?.status ?? 'ACTIVE' });
  const [ips, setIps] = useState((device?.allowedIps ?? []).join('\n'));
  const allowedIps = ips.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return (
    <FormDialog open title={device ? `Change ${device.name}` : 'Register a device'} subtitle="The serial number is on the device: Menu › System info › Device info." onClose={onClose} submitDisabled={!f.name.trim() || !f.serialNumber.trim()}
      onSubmit={async () => { const body = { ...f, allowedIps }; if (device) await attendanceApi.updateDevice(device.id, body); else await attendanceApi.createDevice(body); onSaved(); }}>
      <Box sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
        <TextField size="small" label="Name (where it is)" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-field="device-name" />
        <TextField size="small" label="Serial number" required value={f.serialNumber} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} data-field="device-serial" />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <TextField size="small" label="Make" value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} />
          <TextField size="small" label="Model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <TextField select size="small" label="How it sends" value={f.protocol} onChange={(e) => setF({ ...f, protocol: e.target.value as Device['protocol'] })}>
            <MenuItem value="ADMS">ADMS push (ZKTeco / eSSL)</MenuItem><MenuItem value="API">Through the API</MenuItem><MenuItem value="IMPORT">By file</MenuItem>
          </TextField>
          <TextField size="small" label="Timezone" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} />
        </Box>
        {device && <TextField select size="small" label="State" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Device['status'] })}><MenuItem value="ACTIVE">Active</MenuItem><MenuItem value="DISABLED">Disabled (its pushes are refused)</MenuItem></TextField>}
        <TextField size="small" label="Allowed addresses (optional)" multiline minRows={2} value={ips} onChange={(e) => setIps(e.target.value)} data-field="device-allowed-ips"
          placeholder={'203.0.113.10\n198.51.100.0/24'}
          helperText="The plant's internet addresses, one a line (a range like 198.51.100.0/24 works). When set, a push from any other address is refused and shown below. Empty = any address." />
      </Box>
    </FormDialog>
  );
}

function MapDialog({ start, devices, onClose, onSaved }: { start: { deviceId: number | null; deviceUserId: string }; devices: Device[]; onClose: () => void; onSaved: (attached: number) => void }) {
  const [deviceId, setDeviceId] = useState<number | ''>(start.deviceId ?? '');
  const [uid, setUid] = useState(start.deviceUserId);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<{ id: number; name: string; code: string }[]>([]);
  const [who, setWho] = useState<{ id: number; name: string; code: string } | null>(null);
  useEffect(() => { const t = setTimeout(() => { peopleApi.list({ q }).then((r) => setOptions(r.items.slice(0, 30).map((e) => ({ id: e.id, name: e.fullName, code: e.employeeCode })))).catch(() => {}); }, 250); return () => clearTimeout(t); }, [q]);
  return (
    <FormDialog open title="Who is this number?" subtitle="Punches already waiting for it are attached at once." onClose={onClose} submitDisabled={!uid.trim() || !who}
      onSubmit={async () => { const r = await attendanceApi.map({ deviceId: deviceId === '' ? null : Number(deviceId), deviceUserId: uid.trim(), employeeId: who!.id }); onSaved(r.attached); }}>
      <Box sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
        <TextField select size="small" label="On" value={deviceId} onChange={(e) => setDeviceId(e.target.value === '' ? '' : Number(e.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">Every device</MenuItem>
          {devices.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
        </TextField>
        <TextField size="small" label="User number on the device" value={uid} onChange={(e) => setUid(e.target.value)} />
        <Autocomplete size="small" options={options} filterOptions={(x) => x} getOptionLabel={(o) => `${o.name} · ${o.code}`} value={who} onChange={(_, v) => setWho(v)} onInputChange={(_, v) => setQ(v)}
          renderInput={(p) => <TextField {...p} label="Employee" />} />
      </Box>
    </FormDialog>
  );
}

export function AttDevices() {
  const can = useCan();
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [without, setWithout] = useState(0);
  const [unmapped, setUnmapped] = useState<Unmapped[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Device | 'new' | null>(null);
  const [mapping, setMapping] = useState<{ deviceId: number | null; deviceUserId: string } | null>(null);
  const [newKey, setNewKey] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [mapQ, setMapQ] = useState('');
  const load = useCallback(() => {
    Promise.all([attendanceApi.devices(), attendanceApi.mappings(), attendanceApi.unmapped(), attendanceApi.keys()])
      .then(([d, m, u, k]) => { setDevices(d.devices); setMaps(m.mappings); setWithout(m.employeesWithout.length); setUnmapped(u); setKeys(k); setError(null); })
      .catch(setError);
  }, []);
  useEffect(load, [load]);
  const host = useMemo(() => { try { return new URL(getApiBaseUrl()).host; } catch { return 'the HRMS server'; } }, []);
  const shownMaps = maps.filter((m) => !mapQ || `${m.employee.name} ${m.employee.employeeCode} ${m.deviceUserId}`.toLowerCase().includes(mapQ.toLowerCase()));
  return (
    <>
      <ScreenHeader title="Devices" subtitle="Biometric and face devices, who each enrol number is, punches waiting for a mapping, and keys for other systems."
        actions={can.attendance.edit ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing('new')} data-action="new-device">Register a device</Button> : undefined} />
      <ErrorNotice error={error} onRetry={load} />
      <Callout title="Connecting a ZKTeco / eSSL device (ADMS push)" sx={{ mb: 2 }}>
        On the device: Menu › Comm. › Cloud Server Setting (or ADMS). Server address <b>{host}</b>, path <b>/iclock</b> (the device adds it), port 443 with HTTPS on
        — the server only answers HTTPS; a device that can only send plain HTTP needs a small relay on the plant network, or its own software sending through an API key below.
        Register the device here with its serial number first: an unknown serial is refused. Then map each enrol number to a person (or “Map everyone by code”).
      </Callout>
      {!devices ? <ListSkeleton rows={3} /> : (
        <Stack spacing={2}>
          {devices.some((d) => d.events.length > 0) && (
            <Callout title="A device changed its address, or a push was refused">
              Check each one below. A device that moved to a new internet line is fine; an address you do not know may be someone sending punches with a copied serial number
              — then set the device's allowed addresses (Change).
            </Callout>
          )}
          <SectionCard title="Devices" flush>
            {devices.length === 0 ? <Box sx={{ p: 2 }}><Typography sx={{ color: 'var(--c-text-2)' }}>No device yet.</Typography></Box> : devices.map((d) => (
              <Box key={d.id} data-device={d.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', px: 2, py: 1.25, borderBottom: '1px solid var(--c-divider)' }}>
                <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{d.name}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }} title={d.serialMasked ? 'Only the last 4 characters are shown: the serial is what the device proves itself with.' : undefined}>
                    {[d.serialNumber, d.make, d.model, d.protocol].filter(Boolean).join(' · ')}
                  </Typography>
                  {d.allowedIps && d.allowedIps.length > 0 && (
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Allowed from {d.allowedIps.join(', ')}</Typography>
                  )}
                </Box>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 220px' }}>
                  {d.lastSeenAt ? `Last heard ${new Date(d.lastSeenAt).toLocaleString('en-IN')}` : 'Never heard from'}{d.lastPunchAt ? ` · last punch ${dayLabel(d.lastPunchAt.slice(0, 10))} ${hm(d.lastPunchAt)}` : ''} · {d.punchesToday} today
                </Typography>
                <ToneBadge tone={d.state === 'Online' ? 'success' : d.state === 'Disabled' ? 'neutral' : 'warning'} label={d.state} />
                {can.attendance.edit && <Button size="small" onClick={() => setEditing(d)}>Change</Button>}
                {d.events.length > 0 && (
                  <Box sx={{ flex: '1 1 100%', display: 'grid', gap: 0.25 }} data-device-events={d.id}>
                    {d.events.map((e) => (
                      <Typography key={e.id} sx={{ fontSize: 12.5, color: e.kind === 'IP_REFUSED' ? 'var(--c-danger-700)' : 'var(--c-warning-800)', overflowWrap: 'anywhere' }}>
                        {e.at ? `${new Date(e.at).toLocaleString('en-IN')} — ` : ''}{eventWords(e)}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </SectionCard>

          <SectionCard title="Punches waiting for a mapping" subtitle="Enrol numbers nobody is mapped to. Map one and its punches are attached and processed.">
            {unmapped.length === 0 ? <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>None waiting.</Typography> : unmapped.map((u) => (
              <Box key={`${u.deviceId}-${u.deviceUserId}`} data-unmapped={u.deviceUserId} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, minWidth: 80 }}>#{u.deviceUserId}</Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1 }}>{u.deviceName} · {u.punches} punch{u.punches === 1 ? '' : 'es'} · {dayLabel(u.firstAt.slice(0, 10))}–{dayLabel(u.lastAt.slice(0, 10))}</Typography>
                {can.attendance.edit && <Button size="small" variant="outlined" onClick={() => setMapping({ deviceId: u.deviceId, deviceUserId: u.deviceUserId })}>Map</Button>}
              </Box>
            ))}
          </SectionCard>

          <SectionCard title="Who is which number" subtitle={`${maps.length} mapped · ${without} employee${without === 1 ? '' : 's'} not mapped yet. The default number is the employee code without its letters.`}
            actions={can.attendance.edit ? (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" onClick={() => setMapping({ deviceId: null, deviceUserId: '' })}>Add</Button>
                <Button size="small" variant="outlined" disabled={!without} onClick={async () => { try { const r = await attendanceApi.autoMap(); toast.success(`${r.made} mapped${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}.`); load(); } catch (e) { toast.error(errorMessage(e)); } }} data-action="auto-map">Map everyone by code</Button>
              </Box>
            ) : undefined}>
            <TextField size="small" placeholder="Find a person or number" value={mapQ} onChange={(e) => setMapQ(e.target.value)} sx={{ mb: 1, width: { xs: '100%', sm: 260 } }} />
            <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
              {shownMaps.slice(0, 200).map((m) => (
                <Box key={m.id} sx={{ display: 'flex', gap: 1.5, py: 0.5, fontSize: 13.5, borderBottom: '1px solid var(--c-divider)' }}>
                  <Box sx={{ minWidth: 70, fontWeight: 600 }}>#{m.deviceUserId}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>{m.employee.name} <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{m.employee.employeeCode}</Box></Box>
                  <Box sx={{ color: 'var(--c-text-3)', display: { xs: 'none', sm: 'block' } }}>{m.deviceName}</Box>
                </Box>
              ))}
            </Box>
          </SectionCard>

          <SectionCard title="API keys" subtitle="For other devices and software (Matrix COSEC, Realtime, eTimeTrackLite exports): POST /api/integrations/attendance/punches with the key. Only the Owner makes or revokes one; it is shown once."
            actions={can.owner ? <Button size="small" variant="outlined" onClick={() => setNewKey(true)} data-action="new-key">New key</Button> : undefined}>
            {keys.length === 0 ? <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>No key.</Typography> : keys.map((k) => (
              <Box key={k.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, flex: '1 1 180px' }}>{k.name}</Typography>
                <Typography sx={{ fontSize: 12.5, fontFamily: 'monospace' }}>{k.prefix}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{k.useCount} call{k.useCount === 1 ? '' : 's'}{k.lastUsedAt ? `, last ${new Date(k.lastUsedAt).toLocaleDateString('en-IN')}` : ''}</Typography>
                <ToneBadge tone={k.status === 'ACTIVE' ? 'success' : 'neutral'} label={k.status === 'ACTIVE' ? 'Active' : 'Revoked'} />
                {can.owner && k.status === 'ACTIVE' && <Button size="small" color="error" onClick={async () => { await attendanceApi.revokeKey(k.id); load(); }}>Revoke</Button>}
              </Box>
            ))}
          </SectionCard>
        </Stack>
      )}
      {editing && <DeviceDialog device={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.success('Saved.'); load(); }} />}
      {mapping && devices && <MapDialog start={mapping} devices={devices} onClose={() => setMapping(null)} onSaved={(n) => { setMapping(null); toast.success(n ? `Mapped; ${n} waiting punch${n === 1 ? '' : 'es'} attached.` : 'Mapped.'); load(); }} />}
      {newKey && (
        <PromptDialog open title="New API key" body="Name it after what will use it." label="Name" multiline={false} confirmLabel="Make the key" onClose={() => setNewKey(false)}
          onConfirm={async (name) => { const r = await attendanceApi.createKey(name); setNewKey(false); setSecret(r.secret); load(); }} />
      )}
      {secret && (
        <FormDialog open title="Copy the key now" subtitle="It is not shown again. Only a fingerprint of it is kept." onClose={() => setSecret(null)} submitLabel="I have copied it" onSubmit={() => setSecret(null)}>
          <TextField fullWidth value={secret} InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 13 } }} onFocus={(e) => e.target.select()} data-field="api-secret" />
        </FormDialog>
      )}
    </>
  );
}

/* ══ Imports ════════════════════════════════════════════════════════════════ */

function ImportCard({ kind, title, hint }: { kind: 'punches' | 'days'; title: string; hint: string }) {
  const toast = useToast();
  const [file, setFile] = useState<{ fileName: string; contentBase64: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setPreview(null);
    try { const body = { fileName: f.name, contentBase64: await readFileBase64(f) }; setFile(body); setPreview(await attendanceApi.previewImport(kind, body)); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try { const r = await attendanceApi.applyImport(kind, { ...file, skipProblemRows: true }); toast.success(kind === 'punches' ? `${r.inserted} punches added (${r.duplicates} already there).` : `${r.written} days written${(r.kept as string[]).length ? `, ${(r.kept as string[]).length} kept` : ''}.`); setFile(null); setPreview(null); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <SectionCard title={title} subtitle={hint} actions={<Button size="small" startIcon={<DownloadRounded />} onClick={async () => saveBase64File(await attendanceApi.template(kind))}>Template</Button>}>
      <Button component="label" variant="outlined" startIcon={<UploadFileRounded />} disabled={busy}>
        Choose a file (.xlsx or .csv)
        <input hidden type="file" accept=".xlsx,.csv,.txt" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </Button>
      {preview && (
        <Box sx={{ mt: 1.5 }} data-import-preview={kind}>
          {preview.fileProblems.length > 0 ? <Callout tone="danger" title="The file cannot be read">{preview.fileProblems.join(' ')}</Callout> : (
            <>
              <Typography sx={{ fontSize: 14 }}>{preview.summary.rows} rows · {preview.summary.ok} ready · {preview.summary.problems} with a problem</Typography>
              <Box sx={{ maxHeight: 220, overflow: 'auto', mt: 1, fontSize: 13 }}>
                {preview.rows.filter((r) => r.problems.length).slice(0, 100).map((r) => <Box key={r.row} sx={{ color: 'var(--c-danger-800)' }}>Row {r.row}: {r.problems.join(' ')}</Box>)}
              </Box>
              <Button sx={{ mt: 1 }} variant="contained" disabled={busy || !preview.summary.ok} onClick={apply}>Apply {preview.summary.ok} row{preview.summary.ok === 1 ? '' : 's'}{preview.summary.problems ? ' (skip the rest)' : ''}</Button>
            </>
          )}
        </Box>
      )}
    </SectionCard>
  );
}

export function AttImports() {
  return (
    <>
      <ScreenHeader title="Imports" subtitle="From a device’s own software, or a paper register: preview first, nothing changes until you apply." />
      <Stack spacing={2}>
        <ImportCard kind="punches" title="Punch log" hint="One row a punch: employee code (or device serial + user number), date, time, IN/OUT. A punch already stored is skipped; the days are processed." />
        <ImportCard kind="days" title="Daily attendance" hint="One row a person and day: P, A, HD, L, WO or H, with in / out times if known. A day HR set by hand or an approved correction is kept." />
      </Stack>
    </>
  );
}

/* ══ Close month (and the settings) ═════════════════════════════════════════ */

export function AttClose() {
  const can = useCan();
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [months, setMonths] = useState<MonthState[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [closing, setClosing] = useState<MonthState | null>(null);
  const [reopening, setReopening] = useState<MonthState | null>(null);
  const [liveFrom, setLiveFrom] = useState('');
  const [ips, setIps] = useState('');
  const load = useCallback(() => {
    Promise.all([attendanceApi.months(year), attendanceApi.settings()]).then(([m, s]) => {
      setMonths(m.months); setSettings(s); setLiveFrom(s.liveFrom ?? ''); setIps(s.webPunch.ipAllowList.join(', ')); setError(null);
    }).catch(setError);
  }, [year]);
  useEffect(load, [load]);
  const save = async (patch: Partial<Settings>) => {
    try { setSettings(await attendanceApi.putSettings(patch)); toast.success('Saved.'); } catch (e) { toast.error(errorMessage(e)); }
  };
  const today = todayLocal().slice(0, 7);
  return (
    <>
      <ScreenHeader title="Close month" subtitle="Closing locks a month: it is processed one last time and payroll reads exactly those numbers. Only the Owner re-opens one, with a reason." />
      <ErrorNotice error={error} onRetry={load} />
      {settings && (
        <SectionCard title="Settings" sx={{ mb: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <TextField size="small" type="date" label="Attendance is live from" value={liveFrom} onChange={(e) => setLiveFrom(e.target.value)} InputLabelProps={{ shrink: true }} disabled={!can.attendance.edit} data-field="live-from" />
              {can.attendance.edit && <Button sx={{ ml: 1 }} onClick={() => save({ liveFrom: liveFrom || null })}>Save</Button>}
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>Nothing before it is processed. From it, leave reads attendance: Earned leave needs present days, maternity leave the days worked.</Typography>
            </Box>
            <Box>
              <FormControlLabel control={<Switch checked={settings.webPunch.enabled} disabled={!can.attendance.edit} onChange={(e) => save({ webPunch: { ...settings.webPunch, enabled: e.target.checked } })} />} label="People may punch from the web (My attendance)" />
              <TextField size="small" fullWidth label="Only from these addresses (blank: any)" placeholder="203.0.113.0/24, 198.51.100.7" value={ips} onChange={(e) => setIps(e.target.value)} disabled={!can.attendance.edit} sx={{ mt: 1 }} />
              {can.attendance.edit && <Button size="small" sx={{ mt: 0.5 }} onClick={() => save({ webPunch: { ...settings.webPunch, ipAllowList: ips.split(',').map((x) => x.trim()).filter(Boolean) } })}>Save addresses</Button>}
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>
                {settings.webPunch.geofences.length ? `${settings.webPunch.geofences.length} workplace circle(s) set: the location is checked.` : 'No workplace circle set: the location is not checked.'}
              </Typography>
            </Box>
          </Box>
        </SectionCard>
      )}
      <SectionCard title={`Months of ${year}`} actions={(
        <Box sx={{ display: 'flex', gap: 0.5 }}><Button size="small" onClick={() => setYear(year - 1)}>‹ {year - 1}</Button><Button size="small" onClick={() => setYear(year + 1)}>{year + 1} ›</Button></Box>
      )}>
        {!months ? <ListSkeleton rows={4} /> : months.filter((m) => m.live || m.status === 'CLOSED').length === 0 ? <Typography sx={{ color: 'var(--c-text-2)' }}>Attendance was not live in {year}.</Typography> : months.filter((m) => m.live || m.status === 'CLOSED').map((m) => (
          <Box key={m.month} data-month-row={m.month} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', py: 1, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, minWidth: 140 }}>{monthLabel(m.month)}</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 260px' }}>
              {m.status === 'CLOSED' ? `Closed${m.closedBy ? ` by ${m.closedBy}` : ''}${m.closedAt ? ` on ${new Date(m.closedAt).toLocaleDateString('en-IN')}` : ''}${m.totals ? ` · ${m.totals.people} people, ${m.totals.lopDays} LOP days, overtime ${minutesWord(m.totals.overtimeMinutes)}` : ''}`
                : m.reopenReason ? `Re-opened by ${m.reopenedBy}: “${m.reopenReason}”` : 'Open'}
            </Typography>
            <ToneBadge tone={m.status === 'CLOSED' ? 'success' : 'neutral'} label={m.status === 'CLOSED' ? 'Closed' : 'Open'} />
            {m.status === 'OPEN' && can.attendance.edit && m.month < today && <Button size="small" variant="outlined" onClick={() => setClosing(m)} data-action="close-month">Close</Button>}
            {m.status === 'CLOSED' && can.owner && <Button size="small" color="inherit" onClick={() => setReopening(m)}>Re-open</Button>}
          </Box>
        ))}
      </SectionCard>
      {closing && (
        <ConfirmDialog open title={`Close ${monthLabel(closing.month)}?`} body="It is processed one last time, and its numbers are kept for payroll. Nothing in it changes until the Owner re-opens it." confirmLabel="Close the month"
          onClose={() => setClosing(null)} onConfirm={async () => { const r = await attendanceApi.close(closing.month); toast.success(r.pendingRequests ? `Closed. ${r.pendingRequests} request(s) of that month were still waiting.` : 'Closed.'); setClosing(null); load(); }} />
      )}
      {reopening && (
        <PromptDialog open title={`Re-open ${monthLabel(reopening.month)}?`} body="Payroll may already have read it." label="Why" confirmLabel="Re-open" danger
          onClose={() => setReopening(null)} onConfirm={async (reason) => { await attendanceApi.reopen(reopening.month, reason); setReopening(null); load(); }} />
      )}
    </>
  );
}
