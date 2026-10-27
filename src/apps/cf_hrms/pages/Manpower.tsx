import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import {
  Callout, EmptyState, ErrorNotice, ListSkeleton, PageHeader, SectionCard, StatStrip, ToneBadge, errorMessage, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import { OrgUnitMultiSelect } from '../components/list/OrgUnitFilter';
import { useOrgUnitOptions } from '../components/orgUnits';
import { saveBase64File } from '../api/excel';
import { todayLocal, dayLabel } from '../api/attendance';
import { dashboardApi, CHAIR_WORDS, type ChairState, type Counts, type Manpower as MP } from '../api/dashboard';

/**
 * Manpower (CF_HRMS_HIRING_SPEC.md §42.2): for any day, how many chairs each org unit needs (its positions),
 * how many are filled, vacant, present and short — by org unit with "and below", by role, by shift, and each
 * chair. Excel download. Short = required − present − off; without attendance for the day, short = vacant.
 */

type View = 'units' | 'roles' | 'shifts' | 'positions';
const COLS: { key: keyof Counts; label: string }[] = [
  { key: 'required', label: 'Required' }, { key: 'filled', label: 'Filled' }, { key: 'vacant', label: 'Vacant' }, { key: 'present', label: 'Present' },
  { key: 'leave', label: 'Leave' }, { key: 'absent', label: 'Absent' }, { key: 'notPunched', label: 'Not punched' }, { key: 'off', label: 'Off' }, { key: 'short', label: 'Short' },
];
const TONE: Record<ChairState, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  VACANT: 'danger', PRESENT: 'success', LEAVE: 'info', ABSENT: 'danger', OFF: 'neutral', NOT_PUNCHED: 'warning', FILLED: 'neutral',
};

function CountsTable({ rows, known }: { rows: { key: string; label: ReactNode; sub?: string | null; depth?: number; counts: Counts }[]; known: boolean }) {
  const cols = known ? COLS : COLS.filter((c) => ['required', 'filled', 'vacant', 'short'].includes(c.key));
  return (
    <Box sx={{ overflowX: 'auto' }} data-manpower-table>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, '& th, & td': { py: 0.75, px: 1, borderBottom: '1px solid var(--c-divider)', textAlign: 'right', whiteSpace: 'nowrap' }, '& th:first-of-type, & td:first-of-type': { textAlign: 'left', whiteSpace: 'normal', minWidth: 180 }, '& th': { fontWeight: 600, color: 'var(--c-text-2)', fontSize: 12 } }}>
        <thead><tr><th>Name</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-row={r.key}>
              <td style={{ paddingLeft: 8 + (r.depth ?? 0) * 16 }}>
                <Typography component="span" sx={{ fontSize: 13.5, fontWeight: r.depth ? 400 : 600 }}>{r.label}</Typography>
                {r.sub && <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', ml: 0.75 }}>{r.sub}</Typography>}
              </td>
              {cols.map((c) => (
                <td key={c.key} style={c.key === 'short' && Number(r.counts.short) > 0 ? { color: 'var(--c-danger-700)', fontWeight: 600 } : undefined}>{r.counts[c.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

export default function Manpower() {
  const can = useCan();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || todayLocal();
  const units = params.get('department') || '';
  const shift = params.get('shift') || '';
  const [view, setView] = useState<View>('units');
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };
  const unitOptions = useOrgUnitOptions(can.org.view || can.positions.view);
  const [data, setData] = useState<MP | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setData(null);
    dashboardApi.manpower({ date, department: units || undefined, shift: shift || undefined }).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [date, units, shift]);
  useEffect(load, [load]);
  const download = async () => {
    try { saveBase64File(await dashboardApi.manpowerWorkbook({ date, department: units || undefined, shift: shift || undefined })); } catch (e) { toast.error(errorMessage(e)); }
  };
  const t = data?.totals;
  return (
    <Box data-page="manpower">
      <PageHeader
        title="Manpower"
        subtitle="Required, filled, vacant, present and short — by org unit (with everything under it), role and shift, for any day."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField size="small" type="date" label="Day" value={date} onChange={(e) => set({ date: e.target.value })} InputLabelProps={{ shrink: true }} data-field="manpower-date" />
            {unitOptions.length > 0 && <OrgUnitMultiSelect value={units} onChange={(v) => set({ department: v })} options={unitOptions} />}
            <TextField select size="small" label="Shift" value={shift} onChange={(e) => set({ shift: e.target.value })} sx={{ minWidth: 140 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
              <MenuItem value="">Every shift</MenuItem>
              {(data?.shiftsAll ?? []).map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </TextField>
            <Button startIcon={<DownloadRounded />} onClick={download} data-action="manpower-excel">Excel</Button>
          </Box>
        )}
      />
      <ErrorNotice error={error} onRetry={load} />
      {!data ? <ListSkeleton rows={6} /> : (
        <Stack spacing={2}>
          {data.note && <Callout title={`Who came in on ${dayLabel(data.date)}`}>{data.note}</Callout>}
          <StatStrip stats={[
            { label: 'Required', value: t!.required },
            { label: 'Filled', value: t!.filled, tone: 'success' },
            { label: 'Vacant', value: t!.vacant, tone: t!.vacant ? 'warning' : undefined },
            ...(data.attendanceKnown ? [{ label: 'Present', value: t!.present ?? 0, tone: 'success' as const }] : []),
            { label: 'Short', value: t!.short, tone: t!.short ? 'danger' : undefined },
          ]} />
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} sx={{ flexWrap: 'wrap' }}>
            <ToggleButton value="units" data-view="units">By org unit</ToggleButton>
            <ToggleButton value="roles" data-view="roles">By role</ToggleButton>
            <ToggleButton value="shifts" data-view="shifts">By shift</ToggleButton>
            <ToggleButton value="positions" data-view="positions">Each chair</ToggleButton>
          </ToggleButtonGroup>
          {data.units.length === 0 ? <EmptyState title="No positions here" hint="No live positions in this selection on this day." /> : (
            <SectionCard flush>
              {view === 'units' && <CountsTable known={data.attendanceKnown} rows={data.units.map((u) => ({ key: `u${u.id}`, label: u.name, sub: u.kind, depth: u.depth, counts: u.total }))} />}
              {view === 'roles' && <CountsTable known={data.attendanceKnown} rows={data.roles.map((r) => ({ key: `r${r.roleId ?? 0}`, label: r.title, sub: r.code, counts: r.counts }))} />}
              {view === 'shifts' && <CountsTable known={data.attendanceKnown} rows={data.shifts.map((s) => ({ key: `s${s.shiftId ?? 0}`, label: s.name, sub: s.code, counts: s.counts }))} />}
              {view === 'positions' && (
                <Box sx={{ p: 1.5 }}>
                  {data.positions.map((p) => (
                    <Box key={p.id} data-chair={p.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{p.title}{p.code ? <Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}> · {p.code}</Box> : null}</Typography>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[p.kind && p.unitName ? `${p.kind} · ${p.unitName}` : p.unitName, p.shiftName].filter(Boolean).join(' · ')}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 160px' }}>{p.employeeName ?? '—'}</Typography>
                      <ToneBadge tone={TONE[p.state]} label={CHAIR_WORDS[p.state]} />
                    </Box>
                  ))}
                </Box>
              )}
            </SectionCard>
          )}
        </Stack>
      )}
    </Box>
  );
}
