import { useEffect, useMemo, useState } from 'react';
import { Box, Button, MenuItem, Switch, TextField, Typography } from '@mui/material';
import type { CfApiError } from '../api/client';
import { getSettingsPage, putSettings, type SettingItem, type SettingValue, type SettingsPage } from '../api/md';
import { useLoad } from '../hooks/useLoad';
import { ErrorNotice, PageHeader, SkeletonRows } from '../components/ui';
import { useToast } from '../components/toastContext';

const same = (a: SettingValue, b: SettingValue) => (a ?? '') === (b ?? '') || String(a ?? '') === String(b ?? '');
const shown = (i: SettingItem, v: SettingValue) => {
  if (v == null || v === '') return 'none';
  if (i.type === 'bool') return v ? 'on' : 'off';
  if (i.type === 'choice') return i.choices?.find((c) => c.value === String(v))?.label ?? String(v);
  return `${v}${i.unit ? ` ${i.unit}` : ''}`;
};

function Field({ item, value, users, onChange }: { item: SettingItem; value: SettingValue; users: SettingsPage['users']; onChange: (v: SettingValue) => void }) {
  const id = `set-${item.key}`;
  if (item.type === 'bool') return <Switch id={id} checked={value === true} onChange={(e) => onChange(e.target.checked)} inputProps={{ 'aria-label': item.label }} />;
  if (item.type === 'choice') return (
    <TextField id={id} select size="small" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} sx={{ width: 190 }}>
      {(item.choices ?? []).map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
    </TextField>
  );
  if (item.type === 'user') return (
    <TextField id={id} select size="small" value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} sx={{ width: 190 }}>
      <MenuItem value="">Nobody</MenuItem>
      {users.map((u) => <MenuItem key={u.id} value={String(u.id)}>{u.name}</MenuItem>)}
    </TextField>
  );
  const type = item.type === 'time' ? 'time' : item.type === 'date' ? 'date' : 'text';
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
      <TextField id={id} size="small" type={type} value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)}
        sx={{ width: item.type === 'date' ? 170 : 110 }} inputProps={{ inputMode: item.type === 'int' || item.type === 'number' ? 'decimal' : undefined, 'aria-label': item.label }} />
      {item.unit && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{item.unit}</Typography>}
    </Box>
  );
}

/**
 * SETUP › SETTINGS (init.sql §113; user 2026-11-19): every limit the app used to carry in code, grouped, each with the
 * value the code had as its default. Only what was changed is sent; "Reset" puts one back to its default.
 */
export default function Settings() {
  const toast = useToast();
  const page = useLoad(() => getSettingsPage(), []);
  const [data, setData] = useState<SettingsPage | null>(null);
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (page.data) { setData(page.data); setDraft({}); } }, [page.data]);
  const dirty = useMemo(() => Object.keys(draft), [draft]);
  const set = (item: SettingItem, v: SettingValue) => setDraft((d) => {
    const next = { ...d };
    if (same(v, item.value)) delete next[item.key]; else next[item.key] = v;
    return next;
  });
  const save = async () => {
    setBusy(true); setError(null);
    try { const r = await putSettings(draft); setData(r); setDraft({}); toast.success(`${dirty.length} setting${dirty.length === 1 ? '' : 's'} saved.`); }
    catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  return (
    <Box sx={{ minWidth: 0, pb: dirty.length ? 9 : 0 }}>
      <PageHeader title="Settings" subtitle="The limits this company works by. Each shows its standard value; change one and it applies from the next screen that reads it (within half a minute)." />
      <ErrorNotice error={page.error ?? error} onRetry={page.error ? page.reload : undefined} />
      {!data && !page.error && <SkeletonRows rows={8} />}
      <Box sx={{ display: 'grid', gap: 2 }} data-testid="settings">
        {(data?.groups ?? []).map((g) => (
          <Box key={g.key} data-testid="settings-group" sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', minWidth: 0, overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid var(--c-divider)' }}>
              <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{g.label}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{g.help}</Typography>
            </Box>
            {g.items.map((item) => {
              const value = item.key in draft ? draft[item.key] : item.value;
              const off = !same(value, item.default);
              return (
                <Box key={item.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', px: 1.5, py: 1, borderBottom: '1px solid var(--c-divider)', '&:last-child': { borderBottom: 0 },
                  background: item.key in draft ? 'var(--c-primary-50, rgba(99, 102, 241, 0.06))' : undefined }}>
                  <Box component="label" htmlFor={`set-${item.key}`} sx={{ flex: '3 1 280px', minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14 }}>{item.label}</Typography>
                    {item.help && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{item.help}</Typography>}
                  </Box>
                  <Field item={item} value={value} users={data!.users} onChange={(v) => set(item, v)} />
                  <Box sx={{ flex: '0 0 170px', minWidth: 0, textAlign: 'right' }}>
                    {off
                      ? <Button size="small" onClick={() => set(item, item.default)} title={`Standard: ${shown(item, item.default)}`}>Reset to {shown(item, item.default)}</Button>
                      : <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>standard</Typography>}
                  </Box>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      {dirty.length > 0 && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)', px: 2, py: 1.25, display: 'flex', gap: 1.5, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{dirty.length} change{dirty.length === 1 ? '' : 's'} not saved</Typography>
          <Button onClick={() => setDraft({})} disabled={busy}>Discard</Button>
          <Button variant="contained" onClick={() => void save()} disabled={busy} data-testid="settings-save">{busy ? 'Saving…' : 'Save'}</Button>
        </Box>
      )}
    </Box>
  );
}
