/**
 * Setup › Performance settings (CF_HRMS_HIRING_SPEC.md §18.1, §18.3).
 *
 *   - the month the performance year starts (India: April)
 *   - the default plan frequency, for a role that has none of its own
 *   - the rating scale, lowest first (used when plans are reviewed; stored now)
 *   - each role's frequency, one select per role, and "Set for selected"
 *
 * Saving needs the setup edit right; everyone else reads. The server's refusal
 * (e.g. moving the year start once periods exist) is shown in its words.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import TuneRounded from '@mui/icons-material/TuneRounded';
import {
  DataTable, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, SectionCard, useToast, type DataColumn,
} from '@shared/ui';
import { performanceApi, type Frequency, type PerformanceSettings as Settings, type RoleFrequency } from '../api/performance';
import { useCan } from '../access/can';
import { EditableList, type EditableListItem } from '../components/EditableList';
import { ListToolbar } from '../components/list/ListToolbar';
import { matchesQuery, useListFilters } from '../components/list/useListFilters';
import { FREQUENCY_LABEL } from '../components/performance/planWords';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FREQS = Object.keys(FREQUENCY_LABEL) as Frequency[];
/** The select's value for "the company default" (null on the server). */
const DEFAULT = '';
/** The bulk select's "company default" (its own empty value is the prompt). */
const BULK_DEFAULT = '__default';

function FrequencySelect({
  value, companyDefault, onChange, disabled, ariaLabel,
}: {
  value: Frequency | null;
  companyDefault: Frequency;
  onChange: (f: Frequency | null) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <TextField
      select
      size="small"
      value={value ?? DEFAULT}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === DEFAULT ? null : (e.target.value as Frequency))}
      onClick={(e) => e.stopPropagation()}
      sx={{ minWidth: 200 }}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true }, htmlInput: { 'aria-label': ariaLabel } }}
    >
      <MenuItem value={DEFAULT}>Company default ({FREQUENCY_LABEL[companyDefault]})</MenuItem>
      {FREQS.map((f) => <MenuItem key={f} value={f}>{FREQUENCY_LABEL[f]}</MenuItem>)}
    </TextField>
  );
}

export default function PerformanceSettings() {
  const can = useCan();
  const toast = useToast();
  const mayEdit = can.setup.edit;

  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [roleError, setRoleError] = useState<unknown>(null);
  const [busyRoles, setBusyRoles] = useState<Set<number>>(new Set());

  // The form, edited locally until Save.
  const [month, setMonth] = useState(4);
  const [freq, setFreq] = useState<Frequency>('QUARTERLY');
  const [scale, setScale] = useState<EditableListItem[]>([]);
  const [onTrack, setOnTrack] = useState('90');
  const [atRisk, setAtRisk] = useState('70');
  const [grace, setGrace] = useState('7');
  const nextId = useRef(1);

  const filters = useListFilters([]);

  const fill = useCallback((s: Settings) => {
    setData(s);
    setMonth(s.yearStartMonth);
    setFreq(s.defaultFrequency);
    setScale(s.ratingScale.map((r) => ({ id: nextId.current++, name: r.label })));
    setOnTrack(String(s.bands?.onTrack ?? 90));
    setAtRisk(String(s.bands?.atRisk ?? 70));
    setGrace(String(s.reviewGraceDays ?? 7));
  }, []);

  const load = useCallback(() => {
    performanceApi.settings().then((s) => { fill(s); setError(null); }).catch(setError);
  }, [fill]);

  useEffect(() => { load(); }, [load]);

  const dirty = !!data && (
    month !== data.yearStartMonth
    || freq !== data.defaultFrequency
    || Number(onTrack) !== data.bands?.onTrack || Number(atRisk) !== data.bands?.atRisk
    || Number(grace) !== (data.reviewGraceDays ?? 7)
    || scale.map((s) => s.name).join('\u0000') !== data.ratingScale.map((r) => r.label).join('\u0000')
  );

  const badGrace = !(/^\d+$/.test(grace.trim()) && Number(grace) <= 90);
  const badBands = !(Number(onTrack) > 0 && Number(onTrack) <= 120 && Number(atRisk) > 0 && Number(atRisk) < Number(onTrack));

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const s = await performanceApi.saveSettings({ yearStartMonth: month, defaultFrequency: freq, ratingScale: scale.map((x) => x.name), bands: { onTrack: Number(onTrack), atRisk: Number(atRisk) }, reviewGraceDays: Number(grace) });
      fill(s);
      toast.success('Performance settings saved.');
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const setRoles = useCallback(async (ids: number[], f: Frequency | null) => {
    setRoleError(null);
    setBusyRoles((prev) => new Set([...prev, ...ids]));
    try {
      const r = await performanceApi.setRoleFrequencies(ids, f);
      setData((d) => (d ? { ...d, roles: r.roles } : d));
      toast.success(r.changed ? `${r.changed} role${r.changed === 1 ? '' : 's'} changed.` : 'Nothing needed changing.');
    } catch (e) {
      setRoleError(e);
    } finally {
      setBusyRoles((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }, [toast]);

  const roles = useMemo(() => (data?.roles ?? []).filter((r) => matchesQuery([r.title, r.roleCode], filters.params.q ?? '')), [data, filters.params.q]);
  const companyDefault = data?.defaultFrequency ?? 'QUARTERLY';

  const columns: DataColumn<RoleFrequency>[] = useMemo(() => [
    {
      key: 'title', header: 'Role', alwaysVisible: true,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.title}</Typography>
          {r.roleCode && <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.roleCode}</Mono>}
        </Stack>
      ),
      sortValue: (r) => r.title,
      exportValue: (r) => r.title,
    },
    { key: 'positions', header: 'Positions', width: 100, numeric: true, align: 'right', render: (r) => r.positionCount, sortValue: (r) => r.positionCount },
    {
      key: 'frequency', header: 'Plan frequency', width: 240,
      render: (r) => (mayEdit
        ? (
          <FrequencySelect
            value={r.frequency}
            companyDefault={companyDefault}
            disabled={busyRoles.has(r.id)}
            ariaLabel={`Plan frequency of ${r.title}`}
            onChange={(f) => void setRoles([r.id], f)}
          />
        )
        : (
          <Typography sx={{ fontSize: 13.5 }}>
            {r.frequency ? FREQUENCY_LABEL[r.frequency] : `Company default (${FREQUENCY_LABEL[companyDefault]})`}
          </Typography>
        )),
      sortValue: (r) => r.effectiveFrequency,
      exportValue: (r) => (r.frequency ? FREQUENCY_LABEL[r.frequency] : `Company default (${FREQUENCY_LABEL[companyDefault]})`),
    },
  ], [mayEdit, companyDefault, busyRoles, setRoles]);

  if (error && !data) {
    return (
      <>
        <PageHeader title="Performance settings" />
        <ErrorNotice error={error} onRetry={load} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Performance settings" />
        <ListSkeleton rows={6} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Performance settings"
        subtitle="when the performance year starts, how often plans are made, and the rating scale"
      />

      <Stack spacing={2}>
        <SectionCard
          title="The performance year and plans"
          subtitle={data.saved ? undefined : 'Nothing saved yet — these are the starting values.'}
        >
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, maxWidth: 640 }}>
            <TextField
              select size="small" label="The year starts in"
              value={month}
              disabled={!mayEdit}
              onChange={(e) => setMonth(Number(e.target.value))}
              helperText="Periods are counted from this month."
            >
              {MONTHS.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
            </TextField>
            <TextField
              select size="small" label="Default frequency"
              value={freq}
              disabled={!mayEdit}
              onChange={(e) => setFreq(e.target.value as Frequency)}
              helperText="For a role that has no frequency of its own."
            >
              {(data.frequencies.length ? data.frequencies : FREQS.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))).map((f) => (
                <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
              ))}
            </TextField>
          </Box>

          <Box sx={{ mt: 3, maxWidth: 640 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Rating scale</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>
              Lowest first. Used when plans are reviewed at the end of a period.
            </Typography>
            <EditableList
              items={scale}
              canEdit={mayEdit}
              noun="rating"
              minItems={2}
              maxLength={60}
              onAdd={async (name) => { setScale((s) => [...s, { id: nextId.current++, name }]); }}
              onRename={async (id, name) => { setScale((s) => s.map((x) => (x.id === id ? { ...x, name } : x))); }}
              onReorder={async (ids) => { setScale((s) => ids.map((id) => s.find((x) => x.id === id)!).filter(Boolean)); }}
              onRemove={async (id) => { setScale((s) => s.filter((x) => x.id !== id)); }}
            />
          </Box>

          <Box sx={{ mt: 3, maxWidth: 640 }} data-bands="">
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>On track, at risk, behind</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.5 }}>
              The achievement a KPI or a plan needs. Below &ldquo;at risk&rdquo; it is behind. Used by Actuals, the plan page, the Plans list and the org chart.
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField
                size="small" label="On track from" value={onTrack} disabled={!mayEdit}
                onChange={(e) => setOnTrack(e.target.value)}
                error={badBands}
                slotProps={{ htmlInput: { inputMode: 'decimal' }, input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
              />
              <TextField
                size="small" label="At risk from" value={atRisk} disabled={!mayEdit}
                onChange={(e) => setAtRisk(e.target.value)}
                error={badBands}
                helperText={badBands ? '“At risk” starts below “on track”; both above 0 and up to 120.' : undefined}
                slotProps={{ htmlInput: { inputMode: 'decimal' }, input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
              />
            </Box>
          </Box>

          <Box sx={{ mt: 3, maxWidth: 640 }} data-grace="">
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Final reviews</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.5 }}>
              Each active plan gets a final review when its last slot opens: the period&rsquo;s last month, or later if a KPI&rsquo;s last slot starts later. It is due this many days after the period ends.
            </Typography>
            <TextField
              size="small" label="Due after the period ends" value={grace} disabled={!mayEdit}
              onChange={(e) => setGrace(e.target.value)}
              error={badGrace}
              helperText={badGrace ? 'A whole number of days, 0 to 90.' : undefined}
              sx={{ width: 240 }}
              slotProps={{ htmlInput: { inputMode: 'numeric' }, input: { endAdornment: <InputAdornment position="end">days</InputAdornment> } }}
            />
          </Box>

          {saveError != null && <ErrorNotice error={saveError} sx={{ mt: 2 }} />}

          {mayEdit && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center" useFlexGap flexWrap="wrap">
              <Button variant="contained" size="small" disabled={!dirty || saving || badBands || badGrace} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              {dirty && (
                <Button size="small" color="inherit" disabled={saving} onClick={() => { fill(data); setSaveError(null); }}>
                  Undo changes
                </Button>
              )}
            </Stack>
          )}
        </SectionCard>

        <SectionCard
          title="Plan frequency by role"
          subtitle={`A role with no frequency of its own uses the company default (${FREQUENCY_LABEL[companyDefault]}). Plans already made keep their frequency.`}
        >
          <ListToolbar
            filters={filters}
            shown={roles.length}
            total={data.roles.length}
            noun={['role', 'roles']}
            searchPlaceholder="Search roles by title"
          />
          {roleError != null && <ErrorNotice error={roleError} sx={{ mb: 2 }} />}
          <DataTable
            rows={roles}
            columns={columns}
            getRowId={(r) => r.id}
            selectable={mayEdit}
            bulkActions={(selected, clear) => (
              <TextField
                select
                size="small"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  void setRoles(selected.map((r) => r.id), v === BULK_DEFAULT ? null : (v as Frequency)).then(clear);
                }}
                sx={{ minWidth: 220 }}
                slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': 'Set the plan frequency of the selected roles' } }}
              >
                <MenuItem value="" disabled>Set for selected…</MenuItem>
                <MenuItem value={BULK_DEFAULT}>Company default ({FREQUENCY_LABEL[companyDefault]})</MenuItem>
                {FREQS.map((f) => <MenuItem key={f} value={f}>{FREQUENCY_LABEL[f]}</MenuItem>)}
              </TextField>
            )}
            storageKey="cf_hrms.performance-roles"
            defaultSortKey="title"
            bare
            empty={
              <EmptyState
                icon={<TuneRounded />}
                title={data.roles.length ? 'No roles match this search' : 'No roles yet'}
                hint={data.roles.length ? 'Clear the search to see every role.' : 'Roles are made under Organisation › Roles.'}
              />
            }
          />
        </SectionCard>
      </Stack>
    </>
  );
}
