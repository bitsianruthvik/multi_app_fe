import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, MenuItem, TextField } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import {
  Callout,
  EmptyState,
  ErrorNotice,
  ListSkeleton,
  Mono,
  PageHeader,
  SectionCard,
  StickyActionBar,
  ToneBadge,
  useToast,
} from '@shared/ui';
import {
  APP_LABEL,
  APP_ORDER,
  accessApi,
  capabilityApp,
  useIsPlatformAdmin,
  type CapabilityApp,
  type PlatformCapability,
  type PlatformFeature,
  type PlatformRole,
  type RoleGrant,
} from '../../api/access';

/**
 * Roles and access — pick a role, see and set what it may do (§4.10).
 *
 * Settings, not a collection: 880px, grouped `SectionCard`s, helper text that
 * states the consequence, and a `StickyActionBar` whose Save is dead until
 * something is dirty. Deliberately NOT auto-saved. A permission change is the
 * one kind of change somebody should be able to make, look at, and then decide
 * to commit — an auto-save turns a mis-click into a live grant.
 *
 * WHAT WAS WRONG WITH THE SCREEN THIS REPLACES, since the fixes are the design:
 *
 *  - It listed every capability on the platform — Record Audio, Sales Basic,
 *    forty-odd `fab_erp_*` — as one undifferentiated wall of chips. An HRMS
 *    administrator hunting `cf_hrms_leave_manage` was doing the product's
 *    filing for it. Here they are grouped by the app that owns them, with
 *    cf_hrms's own thirteen open and everything else folded away.
 *  - It could only ever ADD. Unticking a chip changed nothing on the server, so
 *    there was no way to take a permission back.
 *  - It never showed what a role already held, so every visit started from
 *    blank and re-granted what was already there.
 *
 * ONE HONEST LIMITATION, stated on screen rather than hidden: `role_capability`
 * has an `app_id` column that the core resourceDef does not expose, so a grant
 * made here is written with app_id NULL — the wildcard — and applies wherever
 * the role can reach. In practice a feature tag only means something inside its
 * own app, so the effect is the same; but it is not the same row, and somebody
 * comparing the table to this screen deserves to know that.
 */

interface Grouped {
  app: CapabilityApp;
  capabilities: PlatformCapability[];
}

export default function AccessRoles() {
  const toast = useToast();
  const canManage = useIsPlatformAdmin();

  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [capabilities, setCapabilities] = useState<PlatformCapability[]>([]);
  const [features, setFeatures] = useState<PlatformFeature[]>([]);
  const [grants, setGrants] = useState<RoleGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const [roleId, setRoleId] = useState<number | ''>('');
  /** The working set. Null until a role is chosen, so "dirty" is never ambiguous. */
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<CapabilityApp>>(new Set(['cf_hrms']));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, c, f, g] = await Promise.all([
        accessApi.roles(),
        accessApi.capabilities(),
        accessApi.features(),
        accessApi.grants(),
      ]);
      setRoles(r);
      setCapabilities(c);
      setFeatures(f);
      setGrants(g);
      setRoleId((prev) => (prev === '' ? (r[0]?.id ?? '') : prev));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const featureById = useMemo(() => new Map(features.map((f) => [f.id, f])), [features]);

  /** What this role holds right now, per the server. The baseline for "dirty". */
  const held = useMemo(() => {
    if (roleId === '') return new Set<number>();
    return new Set(
      grants.filter((g) => g.role_id === roleId && g.capability_id != null).map((g) => g.capability_id as number),
    );
  }, [grants, roleId]);

  // Re-baseline whenever the chosen role changes or the server data is reloaded.
  useEffect(() => {
    setSelected(new Set(held));
  }, [held]);

  /**
   * Capabilities worth showing.
   *
   * The platform's `features_capability` table carries a long tail of rows with
   * a null `features_json` — same names, repeated, left by an old write path
   * that invented a primary key. A capability that grants no features grants
   * nothing, so it is noise on a permissions screen. It is hidden UNLESS this
   * role actually holds it, in which case hiding it would be the worse lie:
   * somebody would see a grant in the database that the screen denies exists.
   */
  const visible = useMemo(
    () =>
      capabilities.filter(
        (c) => (c.features_json?.length ?? 0) > 0 || held.has(c.capability_id),
      ),
    [capabilities, held],
  );

  const groups: Grouped[] = useMemo(() => {
    const by = new Map<CapabilityApp, PlatformCapability[]>();
    for (const c of visible) {
      const app = capabilityApp(c, featureById);
      const list = by.get(app);
      if (list) list.push(c);
      else by.set(app, [c]);
    }
    return APP_ORDER.filter((a) => by.has(a)).map((app) => ({
      app,
      capabilities: (by.get(app) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [visible, featureById]);

  const changes = useMemo(() => {
    if (!selected) return { added: [] as number[], removed: [] as number[] };
    return {
      added: [...selected].filter((id) => !held.has(id)),
      removed: [...held].filter((id) => !selected.has(id)),
    };
  }, [selected, held]);

  const dirty = changes.added.length + changes.removed.length > 0;

  const toggle = (capabilityId: number) => {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(capabilityId)) next.delete(capabilityId);
      else next.add(capabilityId);
      return next;
    });
  };

  const toggleGroup = (app: CapabilityApp) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(app)) next.delete(app);
      else next.add(app);
      return next;
    });
  };

  /**
   * Applied one at a time, on purpose. The generic write API takes one row per
   * call, and a Promise.all that half-fails leaves nobody able to say which
   * half. Sequential means the error names the capability it stopped on, and
   * the reload afterwards makes the screen agree with the database either way.
   */
  const save = async () => {
    if (roleId === '' || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      for (const capabilityId of changes.added) {
        await accessApi.grant(Number(roleId), capabilityId);
      }
      for (const capabilityId of changes.removed) {
        const rows = grants.filter((g) => g.role_id === roleId && g.capability_id === capabilityId);
        for (const row of rows) await accessApi.revoke(row.id);
      }
      const n = changes.added.length + changes.removed.length;
      toast.success(
        `${n} change${n === 1 ? '' : 's'} saved. Anyone holding this role must sign out and back in.`,
      );
      await load();
    } catch (err) {
      setError(err);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const role = roles.find((r) => r.id === roleId) ?? null;

  return (
    <Box sx={{ maxWidth: 880 }}>
      <PageHeader
        title="Roles and access"
        subtitle="What a role is allowed to do, across every app this company uses"
      />

      <Callout title="A capability is a bundle of permissions" icon={<ShieldRounded />}>
        A role holds capabilities; a capability grants features; a feature is what a screen checks
        before it lets someone act. Nothing here changes until you save, and a change only reaches
        somebody the next time they sign in.
      </Callout>

      {error ? <ErrorNotice error={error} onRetry={load} /> : null}

      {loading ? (
        <ListSkeleton rows={6} />
      ) : roles.length === 0 ? (
        <EmptyState
          title="This company has no roles"
          body="A role is what a login is given, and what capabilities are granted to. Until one exists there is nothing to configure here."
        />
      ) : (
        <>
          <SectionCard
            title="Role"
            subtitle="Everyone who holds this role is affected by what you change below."
          >
            <TextField
              select
              label="Role"
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
              sx={{ minWidth: 260 }}
              helperText={
                role?.role_tag
                  ? `Tag: ${role.role_tag}`
                  : 'Roles are per company. Renaming one does not change what it may do.'
              }
            >
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
          </SectionCard>

          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {groups.map(({ app, capabilities: caps }) => {
              const open = openGroups.has(app);
              const heldHere = caps.filter((c) => selected?.has(c.capability_id)).length;
              return (
                <SectionCard
                  key={app}
                  title={
                    <Box
                      component="button"
                      type="button"
                      onClick={() => toggleGroup(app)}
                      aria-expanded={open}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        background: 'none',
                        border: 0,
                        p: 0,
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      {open ? (
                        <ExpandMoreRounded sx={{ fontSize: 18 }} aria-hidden />
                      ) : (
                        <ChevronRightRounded sx={{ fontSize: 18 }} aria-hidden />
                      )}
                      {APP_LABEL[app]}
                    </Box>
                  }
                  subtitle={
                    app === 'cf_hrms'
                      ? `${caps.length} capabilities · ${heldHere} held by this role`
                      : `${caps.length} capabilities from another app · ${heldHere} held by this role`
                  }
                  actions={
                    heldHere > 0 ? <ToneBadge tone="info" label={`${heldHere} held`} /> : null
                  }
                >
                  {open ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      {caps.map((c) => {
                        const ids = c.features_json ?? [];
                        const names = ids
                          .map((id) => featureById.get(id)?.feature_name)
                          .filter(Boolean) as string[];
                        const checked = selected?.has(c.capability_id) ?? false;
                        const changed =
                          changes.added.includes(c.capability_id) ||
                          changes.removed.includes(c.capability_id);
                        return (
                          <Box
                            key={c.capability_id}
                            component="label"
                            sx={{
                              display: 'flex',
                              gap: 1,
                              alignItems: 'flex-start',
                              py: 1,
                              px: 1,
                              mx: -1,
                              borderRadius: 'var(--r-sm)',
                              cursor: canManage ? 'pointer' : 'default',
                              background: changed ? 'var(--c-primary-50)' : undefined,
                              '&:hover': canManage ? { background: 'var(--c-surface-2)' } : undefined,
                              '&:focus-within': { outline: '2px solid var(--c-focus)', outlineOffset: 2 },
                            }}
                          >
                            <Checkbox
                              size="small"
                              checked={checked}
                              disabled={!canManage || saving}
                              onChange={() => toggle(c.capability_id)}
                              sx={{ p: 0.25, mt: '1px' }}
                              inputProps={{ 'aria-label': c.name }}
                            />
                            <Box sx={{ minWidth: 0 }}>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  flexWrap: 'wrap',
                                  fontSize: 14,
                                  fontWeight: 500,
                                }}
                              >
                                <Mono sx={{ fontSize: 13 }}>{c.name}</Mono>
                                {changed ? (
                                  <ToneBadge
                                    tone={checked ? 'success' : 'danger'}
                                    label={checked ? 'Will be granted' : 'Will be revoked'}
                                  />
                                ) : null}
                                {ids.length === 0 ? (
                                  <ToneBadge
                                    tone="warning"
                                    label="Grants nothing"
                                    title="This capability has no features attached, so holding it permits nothing."
                                  />
                                ) : null}
                              </Box>
                              <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>
                                {names.length > 0
                                  ? names.join(' · ')
                                  : 'No features attached — this row grants nothing.'}
                              </Box>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  ) : null}
                </SectionCard>
              );
            })}
          </Box>

          {canManage ? (
            <StickyActionBar
              message={
                dirty
                  ? `${changes.added.length} to grant · ${changes.removed.length} to revoke. A grant made here applies in every app this role can reach.`
                  : 'No changes. Nothing is saved until you press Save.'
              }
            >
              <Button onClick={() => setSelected(new Set(held))} disabled={!dirty || saving}>
                Discard
              </Button>
              <Button variant="contained" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </StickyActionBar>
          ) : (
            <Box sx={{ mt: 3, fontSize: 13, color: 'var(--c-text-2)' }}>
              You can see what each role holds, but only an administrator can change it.
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
