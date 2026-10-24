import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, ListSubheader, MenuItem, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import { CardGridSkeleton, EmptyState, ErrorNotice, FormDialog, ToneBadge, useToast } from '@shared/ui';
import { SCOPE_LABEL, accessApi, type AccessCatalog, type AccessRole, type AccessScope } from '../../api/access';
import { ScreenHeader } from '../../components/TabbedScreen';
import { RoleEditor } from '../../components/access/RoleEditor';

/**
 * Access roles (CF_HRMS_HIRING_SPEC.md §12.7) — one card per access role, with
 * the server's own sentence about what it may do. A card opens the role's
 * tick-box table.
 *
 * THE SENTENCE IS THE SERVER'S. `summary` is shown as it comes: the same words
 * the server would use anywhere else, never a second version worked out here
 * from the list of rights.
 *
 * A NEW ROLE STARTS FROM SOMETHING — a ready-made role or one the company
 * already has — and then opens straight away so its boxes can be checked.
 */

interface NewRole {
  label: string;
  description: string;
  /** `t:<key>` a ready-made role · `r:<id>` a copy of an existing one · '' nothing. */
  from: string;
  scope: AccessScope;
}

export default function AccessRoles() {
  const toast = useToast();
  const [catalog, setCatalog] = useState<AccessCatalog | null>(null);
  const [roles, setRoles] = useState<AccessRole[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState<NewRole | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadRoles = useCallback(() => {
    return accessApi
      .roles()
      .then((list) => {
        setRoles(list);
        setError(null);
      })
      .catch((e) => {
        setError(e);
        setRoles((cur) => cur ?? []);
      });
  }, []);

  const load = useCallback(() => {
    setError(null);
    accessApi.catalog().then(setCatalog).catch(setError);
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    load();
  }, [load]);

  const editing = useMemo(
    () => (editingId == null ? null : (roles ?? []).find((r) => r.roleId === editingId) ?? null),
    [editingId, roles],
  );

  /** Existing roles a new one can copy — minus the ready-made ones already offered above them. */
  const copyable = useMemo(() => {
    const offered = new Set((catalog?.templates ?? []).map((t) => t.key));
    return (roles ?? []).filter((r) => !r.templateKey || !offered.has(r.templateKey));
  }, [catalog, roles]);

  const openCreate = (copyOf?: AccessRole) => {
    setEditingId(null);
    setCreating({
      label: copyOf ? `Copy of ${copyOf.label}` : '',
      description: '',
      from: copyOf ? `r:${copyOf.roleId}` : '',
      scope: copyOf?.scope ?? 'COMPANY',
    });
  };

  /** Picking what to start from also brings its scope, which can still be changed below. */
  const pickFrom = (from: string) => {
    setCreating((cur) => {
      if (!cur) return cur;
      let scope = cur.scope;
      if (from.startsWith('t:')) scope = catalog?.templates.find((t) => t.key === from.slice(2))?.scope ?? scope;
      if (from.startsWith('r:')) scope = (roles ?? []).find((r) => r.roleId === Number(from.slice(2)))?.scope ?? scope;
      return { ...cur, from, scope };
    });
  };

  const create = async () => {
    if (!creating) return;
    const body: Parameters<typeof accessApi.createRole>[0] = { label: creating.label.trim(), scope: creating.scope };
    if (creating.description.trim()) body.description = creating.description.trim();
    if (creating.from.startsWith('t:')) body.copyFrom = creating.from.slice(2);
    if (creating.from.startsWith('r:')) body.copyFrom = Number(creating.from.slice(2));
    const role = await accessApi.createRole(body);
    setRoles((cur) => [...(cur ?? []).filter((r) => r.roleId !== role.roleId), role]);
    setEditingId(role.roleId);
    toast.success('Access role created. Check its boxes, then save.');
    void loadRoles();
  };

  const newButton = (
    <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => openCreate()}>
      New role
    </Button>
  );

  return (
    <>
      <ScreenHeader
        title="Access roles"
        subtitle="A change of rights takes effect on the person's next click — they do not need to sign in again."
        actions={newButton}
      />

      {!!error && <ErrorNotice error={error} onRetry={load} />}

      {roles == null ? (
        <CardGridSkeleton count={5} height={150} />
      ) : roles.length === 0 && !error ? (
        <EmptyState
          icon={<AdminPanelSettingsRounded />}
          title="No access role yet"
          hint="An access role says what a login may see and change. Start from a ready-made one and adjust it."
          action={newButton}
        />
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))', gap: 1.5 }}>
          {roles.map((r) => (
            <Box component="li" key={r.roleId} sx={{ minWidth: 0 }}>
              <Box
                component="button"
                type="button"
                onClick={() => setEditingId(r.roleId)}
                disabled={!catalog}
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'inherit',
                  cursor: catalog ? 'pointer' : 'progress',
                  p: 2,
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--c-border)',
                  background: 'var(--c-surface)',
                  '&:hover': { borderColor: 'var(--c-primary-500)' },
                  '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.75 }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{r.label}</Typography>
                  {r.templateKey && <ToneBadge tone="info" noIcon label="Ready-made" />}
                  {r.locked && <ToneBadge tone="neutral" icon={<LockRounded aria-hidden />} label="Locked" />}
                </Box>
                {/* The server's own sentence, as it comes. */}
                <Typography sx={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{r.summary}</Typography>
                {r.description && (
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5, overflowWrap: 'anywhere' }}>{r.description}</Typography>
                )}
                <Box sx={{ flex: 1, minHeight: 12 }} />
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {SCOPE_LABEL[r.scope] ?? r.scope} · {r.loginCount === 1 ? '1 login' : `${r.loginCount} logins`}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {editing && catalog && (
        <RoleEditor
          key={editing.roleId}
          role={editing}
          catalog={catalog}
          onClose={() => setEditingId(null)}
          onChanged={() => void loadRoles()}
          onCopy={openCreate}
        />
      )}

      <FormDialog
        open={!!creating}
        title="New access role"
        subtitle="Start from a role that is close to what you need. You can change every box before anyone holds it."
        submitLabel="Create role"
        busyLabel="Creating…"
        submitDisabled={!creating?.label.trim()}
        onClose={() => setCreating(null)}
        onSubmit={create}
      >
        {creating && (
          <>
            <TextField
              label="Name"
              size="small"
              required
              autoFocus
              value={creating.label}
              onChange={(e) => setCreating({ ...creating, label: e.target.value })}
              helperText="Needed. For example: Payroll clerk."
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            <TextField
              label="Description (optional)"
              size="small"
              value={creating.description}
              onChange={(e) => setCreating({ ...creating, description: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 250 } }}
            />
            <TextField
              select
              label="Start from"
              size="small"
              value={creating.from}
              onChange={(e) => pickFrom(e.target.value)}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">Nothing — every box empty</MenuItem>
              {(catalog?.templates.length ?? 0) > 0 && <ListSubheader>Ready-made</ListSubheader>}
              {(catalog?.templates ?? []).map((t) => (
                <MenuItem key={`t:${t.key}`} value={`t:${t.key}`} sx={{ whiteSpace: 'normal' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box>{t.label}</Box>
                    {t.description && <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{t.description}</Box>}
                  </Box>
                </MenuItem>
              ))}
              {copyable.length > 0 && <ListSubheader>Your roles</ListSubheader>}
              {copyable.map((r) => (
                <MenuItem key={`r:${r.roleId}`} value={`r:${r.roleId}`} sx={{ whiteSpace: 'normal' }}>
                  Copy of {r.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Scope"
              size="small"
              value={creating.scope}
              onChange={(e) => setCreating({ ...creating, scope: e.target.value as AccessScope })}
              helperText={
                creating.scope === 'DEPARTMENT'
                  ? 'They see the whole structure, but can only change — and only see people in — their org unit and everything under it.'
                  : 'They can work on every org unit.'
              }
            >
              <MenuItem value="COMPANY">{SCOPE_LABEL.COMPANY}</MenuItem>
              <MenuItem value="DEPARTMENT">{SCOPE_LABEL.DEPARTMENT}</MenuItem>
            </TextField>
          </>
        )}
      </FormDialog>
    </>
  );
}
