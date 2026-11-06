import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import {
  ConfirmDialog, DataTable, EmptyState, ErrorNotice, FormDialog, ListSkeleton, PageHeader, SectionCard,
  SideSheet, ToneBadge, errorMessage, useToast, type DataColumn,
} from '@shared/ui';
import { connApi, type Connection, type Provider, type RemoteFile } from '../api';

const STATUS: Record<Connection['status'], { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  ok: { label: 'Connected', tone: 'success' },
  error: { label: 'Problem', tone: 'danger' },
  untested: { label: 'Not tested', tone: 'neutral' },
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

const when = (d: string | null) => (d ? new Date(d).toLocaleString() : '—');

/** The form is built from the provider's fields, so a new kind of connection needs no screen work. */
function ConnectionForm({ providers, editing, onClose, onSaved }: {
  providers: Provider[];
  editing: Connection | null;
  onClose: () => void;
  onSaved: (c: Connection) => void;
}) {
  const [providerKey, setProviderKey] = useState(editing?.provider ?? providers[0]?.key ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [values, setValues] = useState<Record<string, string>>(editing?.config ?? {});
  const provider = providers.find((p) => p.key === providerKey);

  const save = async () => {
    onSaved(editing
      ? await connApi.update(editing.id, { name, values })
      : await connApi.create({ provider: providerKey, name, values }));
  };

  return (
    <FormDialog open onClose={onClose} onSubmit={save} title={editing ? 'Edit connection' : 'Add connection'}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        {!editing && providers.length > 1 && (
          <TextField select label="Kind" size="small" value={providerKey} onChange={(e) => setProviderKey(e.target.value)}>
            {providers.map((p) => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
          </TextField>
        )}
        {provider?.setupHelp && <Typography variant="body2" color="text.secondary">{provider.setupHelp}</Typography>}
        <TextField label="Name" size="small" required value={name} onChange={(e) => setName(e.target.value)}
          placeholder="ERP data folder" />
        {provider?.fields.map((f) => {
          const stored = f.secret && editing?.secretsSet.includes(f.key);
          return (
            <TextField key={f.key} label={f.label} size="small" required={f.required && !stored}
              type={f.secret ? 'password' : 'text'} autoComplete={f.secret ? 'new-password' : 'off'}
              value={values[f.key] ?? ''} placeholder={stored ? 'Stored. Leave blank to keep it.' : f.placeholder}
              helperText={f.help} slotProps={stored ? { inputLabel: { shrink: true } } : undefined}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
          );
        })}
      </Stack>
    </FormDialog>
  );
}

/** What the connection can see, folder by folder. Reads only. */
function FilesSheet({ connection, onClose }: { connection: Connection; onClose: () => void }) {
  const [trail, setTrail] = useState<{ id?: string; name: string }[]>([{ name: connection.folderName ?? 'Folder' }]);
  const [files, setFiles] = useState<RemoteFile[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const folderId = trail[trail.length - 1].id;

  const load = useCallback(async () => {
    setFiles(null);
    setError(null);
    try {
      setFiles((await connApi.files(connection.id, folderId)).files);
    } catch (e) {
      setError(e);
    }
  }, [connection.id, folderId]);
  useEffect(() => { load(); }, [load]);

  const cols: DataColumn<RemoteFile>[] = [
    { key: 'name', header: 'Name', sortValue: (r) => r.name, render: (r) => (r.kind === 'folder'
      ? <Link component="button" variant="body2" onClick={() => setTrail((t) => [...t, { id: r.id, name: r.name }])}>{r.name}/</Link>
      : r.name) },
    { key: 'size', header: 'Size', numeric: true, align: 'right', sortValue: (r) => r.size ?? 0, render: (r) => (r.kind === 'folder' ? '—' : formatSize(r.size)) },
    { key: 'modifiedAt', header: 'Changed', sortValue: (r) => r.modifiedAt ?? '', render: (r) => when(r.modifiedAt) },
  ];

  return (
    <SideSheet open onClose={onClose} title={connection.name} width={640}>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 1.5 }}>
        {trail.map((t, i) => (
          <Typography key={t.id ?? 'root'} variant="body2" component="span">
            {i > 0 && ' / '}
            {i < trail.length - 1
              ? <Link component="button" variant="body2" onClick={() => setTrail((x) => x.slice(0, i + 1))}>{t.name}</Link>
              : <strong>{t.name}</strong>}
          </Typography>
        ))}
      </Stack>
      {error ? <ErrorNotice error={error} onRetry={load} /> : !files ? <ListSkeleton rows={4} /> : (
        <DataTable rows={files} columns={cols} getRowId={(r) => r.id} bare empty="This folder is empty." />
      )}
    </SideSheet>
  );
}

/** A company's links to outside data. Only admins reach this; the server checks it too. */
export default function Connections() {
  const toast = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rows, setRows] = useState<Connection[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<{ editing: Connection | null } | null>(null);
  const [browsing, setBrowsing] = useState<Connection | null>(null);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [testing, setTesting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, c] = await Promise.all([connApi.providers(), connApi.list()]);
      setProviders(p.providers);
      setRows(c.connections);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const test = async (c: Connection) => {
    setTesting(c.id);
    try {
      const out = await connApi.test(c.id);
      if (out.connection.status === 'ok') toast.success(out.summary ?? 'Connected');
      else toast.error(`${c.name} could not connect`);
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await connApi.remove(removing.id);
      toast.success(`${removing.name} removed`);
      setRemoving(null);
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const cols: DataColumn<Connection>[] = [
    { key: 'name', header: 'Name', sortValue: (r) => r.name, render: (r) => (
      <Box>
        <Typography variant="body2" fontWeight={600}>{r.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {r.providerLabel}{r.folderName ? ` · ${r.folderName}` : ''}
        </Typography>
      </Box>
    ) },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => (
      <Box>
        <ToneBadge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
        {r.lastError && <Typography variant="body2" color="error" sx={{ mt: 0.5, maxWidth: 480 }}>{r.lastError}</Typography>}
      </Box>
    ) },
    { key: 'lastCheckedAt', header: 'Last tested', sortValue: (r) => r.lastCheckedAt ?? '', render: (r) => when(r.lastCheckedAt) },
    { key: 'actions', header: '', render: (r) => (
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button size="small" variant="outlined" disabled={testing === r.id} onClick={() => test(r)}>
          {testing === r.id ? 'Testing…' : 'Test'}
        </Button>
        <Button size="small" disabled={r.status !== 'ok'} onClick={() => setBrowsing(r)}>Files</Button>
        <Button size="small" onClick={() => setForm({ editing: r })}>Edit</Button>
        <Button size="small" color="error" onClick={() => setRemoving(r)}>Remove</Button>
      </Stack>
    ) },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <PageHeader title="Connections" subtitle="Links to outside data. They only read, and never change anything there."
        actions={<Button size="small" variant="contained" onClick={() => setForm({ editing: null })}>Add connection</Button>} />
      {error ? <ErrorNotice error={error} onRetry={load} /> : !rows ? <ListSkeleton rows={3} /> : rows.length === 0 ? (
        <EmptyState title="No connections yet" hint="Add one to read files from a folder such as OneDrive." />
      ) : (
        <SectionCard flush>
          <DataTable rows={rows} columns={cols} getRowId={(r) => r.id} bare />
        </SectionCard>
      )}
      {form && (
        <ConnectionForm providers={providers} editing={form.editing} onClose={() => setForm(null)}
          onSaved={(c) => { toast.success(`${c.name} saved. Test it to connect.`); load(); }} />
      )}
      {browsing && <FilesSheet connection={browsing} onClose={() => setBrowsing(null)} />}
      {removing && (
        <ConfirmDialog open title={`Remove ${removing.name}?`} confirmLabel="Remove" danger
          body="The stored secret is deleted. Nothing changes in the outside system."
          onConfirm={remove} onClose={() => setRemoving(null)} />
      )}
    </Box>
  );
}
