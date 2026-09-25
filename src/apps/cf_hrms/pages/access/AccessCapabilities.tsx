import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, MenuItem, TextField } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import {
  Callout,
  DataTable,
  EmptyState,
  ErrorNotice,
  FilterBar,
  FormDialog,
  ListSkeleton,
  Mono,
  PageHeader,
  SectionCard,
  ToneBadge,
  useToast,
  type DataColumn,
} from '@shared/ui';
import {
  APP_LABEL,
  accessApi,
  capabilityApp,
  useIsPlatformAdmin,
  type PlatformCapability,
  type PlatformFeature,
  type RoleGrant,
} from '../../api/access';

/**
 * Capabilities and features — the platform's permission vocabulary (§4.10).
 *
 * Read-mostly by intention. These two tables are the words the whole platform
 * is written in: a FEATURE is the tag a screen checks (`cf_hrms_leave_manage`),
 * a CAPABILITY is a named bundle of features that a role can be granted. Almost
 * every tenant lives their whole life without adding either — they are created
 * when an app ships a new screen, not when a company hires somebody.
 *
 * So this screen leads with what exists and puts creation behind a secondary
 * action, which is the reverse of the two screens it replaces: both were
 * write-only forms with no way to see what was already there, so the only way
 * to find out whether a tag existed was to try to create it again.
 *
 * THE FACT THAT EARNS A CALLOUT: neither table has a `company_id`. They are
 * global. A row added here is visible to, and grantable by, every tenant on the
 * platform. Nothing on the old screens said so, and it is the single most
 * surprising thing about this corner of the system.
 *
 * (`AddCapability` also never worked: it wrote one row per feature with a
 * `feature_id` column this table does not have and a client-invented
 * `capability_id` over an auto-increment primary key. The long tail of
 * duplicate, feature-less capability rows in the database is its footprint.)
 */

interface FeatureDraft {
  featureName: string;
  featureTag: string;
  type: 'frontend' | 'backend';
}

interface CapabilityDraft {
  name: string;
  featureIds: number[];
  search: string;
}

export default function AccessCapabilities() {
  const toast = useToast();
  const canManage = useIsPlatformAdmin();

  const [capabilities, setCapabilities] = useState<PlatformCapability[] | null>(null);
  const [features, setFeatures] = useState<PlatformFeature[]>([]);
  const [grants, setGrants] = useState<RoleGrant[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [featureDraft, setFeatureDraft] = useState<FeatureDraft | null>(null);
  const [capabilityDraft, setCapabilityDraft] = useState<CapabilityDraft | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, f, g] = await Promise.all([
        accessApi.capabilities(),
        accessApi.features(),
        accessApi.grants(),
      ]);
      setCapabilities(c);
      setFeatures(f);
      setGrants(g);
    } catch (err) {
      setError(err);
      setCapabilities([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const featureById = useMemo(() => new Map(features.map((f) => [f.id, f])), [features]);

  /** capability id → how many of this company's roles hold it. */
  const holdersByCapability = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const g of grants) {
      if (g.capability_id == null || g.role_id == null) continue;
      const set = m.get(g.capability_id) ?? new Set<number>();
      set.add(g.role_id);
      m.set(g.capability_id, set);
    }
    return m;
  }, [grants]);

  const capabilityCountByFeature = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of capabilities ?? []) {
      for (const id of c.features_json ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [capabilities]);

  const q = search.trim().toLowerCase();

  const shownCapabilities = useMemo(() => {
    const list = capabilities ?? [];
    if (!q) return list;
    return list.filter((c) => {
      const names = (c.features_json ?? [])
        .map((id) => featureById.get(id)?.feature_name ?? '')
        .join(' ');
      return `${c.name} ${names}`.toLowerCase().includes(q);
    });
  }, [capabilities, q, featureById]);

  const shownFeatures = useMemo(() => {
    if (!q) return features;
    return features.filter((f) =>
      `${f.feature_name} ${f.feature_tag ?? ''}`.toLowerCase().includes(q),
    );
  }, [features, q]);

  const capabilityColumns: DataColumn<PlatformCapability>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Capability',
        sortValue: (r) => r.name,
        exportValue: (r) => r.name,
        render: (r) => <Mono sx={{ fontSize: 13, color: 'var(--c-text)' }}>{r.name}</Mono>,
      },
      {
        key: 'app',
        header: 'App',
        width: 150,
        sortValue: (r) => APP_LABEL[capabilityApp(r, featureById)],
        exportValue: (r) => APP_LABEL[capabilityApp(r, featureById)],
        render: (r) => APP_LABEL[capabilityApp(r, featureById)],
      },
      {
        key: 'grants',
        header: 'Grants',
        sortValue: (r) => r.features_json?.length ?? 0,
        exportValue: (r) =>
          (r.features_json ?? []).map((id) => featureById.get(id)?.feature_tag ?? id).join(' | '),
        render: (r) => {
          const names = (r.features_json ?? [])
            .map((id) => featureById.get(id)?.feature_name)
            .filter(Boolean) as string[];
          if (names.length === 0) {
            return (
              <ToneBadge
                tone="warning"
                label="Nothing"
                title="No features attached, so holding this capability permits nothing."
              />
            );
          }
          return (
            <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{names.join(' · ')}</Box>
          );
        },
      },
      {
        key: 'held',
        header: 'Held by',
        width: 110,
        numeric: true,
        sortValue: (r) => holdersByCapability.get(r.capability_id)?.size ?? 0,
        exportValue: (r) => holdersByCapability.get(r.capability_id)?.size ?? 0,
        render: (r) => {
          const n = holdersByCapability.get(r.capability_id)?.size ?? 0;
          return (
            <Mono tabular sx={{ color: n ? 'var(--c-text)' : 'var(--c-text-3)' }}>
              {n === 0 ? 'no roles' : `${n} role${n === 1 ? '' : 's'}`}
            </Mono>
          );
        },
      },
    ],
    [featureById, holdersByCapability],
  );

  const featureColumns: DataColumn<PlatformFeature>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Feature',
        sortValue: (r) => r.feature_name,
        exportValue: (r) => r.feature_name,
        render: (r) => <Box sx={{ fontSize: 'var(--row-fs)' }}>{r.feature_name}</Box>,
      },
      {
        key: 'tag',
        header: 'Tag',
        sortValue: (r) => r.feature_tag ?? null,
        exportValue: (r) => r.feature_tag ?? '',
        render: (r) =>
          r.feature_tag ? <Mono sx={{ fontSize: 12 }}>{r.feature_tag}</Mono> : '—',
      },
      {
        key: 'type',
        header: 'Checked by',
        width: 140,
        sortValue: (r) => r.type,
        exportValue: (r) => r.type,
        render: (r) => (
          <ToneBadge
            tone="neutral"
            label={r.type === 'frontend' ? 'The interface' : 'The server'}
            title={
              r.type === 'frontend'
                ? 'A frontend feature gates what a screen shows.'
                : 'A backend feature gates what a request is allowed to do.'
            }
          />
        ),
      },
      {
        key: 'inCapabilities',
        header: 'In capabilities',
        width: 140,
        numeric: true,
        sortValue: (r) => capabilityCountByFeature.get(r.id) ?? 0,
        exportValue: (r) => capabilityCountByFeature.get(r.id) ?? 0,
        render: (r) => {
          const n = capabilityCountByFeature.get(r.id) ?? 0;
          return n === 0 ? (
            <ToneBadge
              tone="warning"
              label="Unreachable"
              title="No capability includes this feature, so no role can ever be granted it."
            />
          ) : (
            <Mono tabular>{n}</Mono>
          );
        },
      },
    ],
    [capabilityCountByFeature],
  );

  const featureDraftValid =
    !!featureDraft &&
    featureDraft.featureName.trim().length > 0 &&
    /^[a-z0-9_]+$/.test(featureDraft.featureTag.trim());

  const capabilityDraftValid =
    !!capabilityDraft && capabilityDraft.name.trim().length > 0 && capabilityDraft.featureIds.length > 0;

  const saveFeature = async () => {
    if (!featureDraft) return;
    await accessApi.createFeature({
      featureName: featureDraft.featureName.trim(),
      featureTag: featureDraft.featureTag.trim(),
      type: featureDraft.type,
    });
    toast.success('Feature added. It does nothing until a capability includes it.');
    setFeatureDraft(null);
    await load();
  };

  const saveCapability = async () => {
    if (!capabilityDraft) return;
    await accessApi.createCapability({
      name: capabilityDraft.name.trim(),
      featureIds: capabilityDraft.featureIds,
    });
    toast.success('Capability added. Grant it to a role on Roles and access.');
    setCapabilityDraft(null);
    await load();
  };

  const draftFeatureList = useMemo(() => {
    if (!capabilityDraft) return [];
    const s = capabilityDraft.search.trim().toLowerCase();
    if (!s) return features;
    return features.filter((f) => `${f.feature_name} ${f.feature_tag ?? ''}`.toLowerCase().includes(s));
  }, [capabilityDraft, features]);

  return (
    <>
      <PageHeader
        title="Capabilities and features"
        subtitle="The vocabulary every permission on the platform is written in"
      />

      <Callout tone="warning" title="These rows belong to the whole platform" icon={<PublicRounded />}>
        Unlike roles, logins and grants, features and capabilities are not scoped to a company.
        Anything added here is visible to every tenant on this installation. Most companies never
        need to touch this screen — it changes when an app ships a new screen, not when somebody is
        hired.
      </Callout>

      {error ? <ErrorNotice error={error} onRetry={load} /> : null}

      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search both tables by name or tag"
      />

      {capabilities === null ? (
        <ListSkeleton rows={8} />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SectionCard
            title="Capabilities"
            subtitle="A named bundle of features. This is what a role is actually granted."
            flush
            actions={
              canManage ? (
                <Button
                  size="small"
                  startIcon={<AddRounded />}
                  onClick={() => setCapabilityDraft({ name: '', featureIds: [], search: '' })}
                >
                  New capability
                </Button>
              ) : null
            }
          >
            <DataTable
              bare
              rows={shownCapabilities}
              columns={capabilityColumns}
              getRowId={(r) => r.capability_id}
              defaultSortKey="name"
              empty={
                <EmptyState
                  title={q ? 'No capability matches that' : 'No capabilities yet'}
                  body={
                    q
                      ? `Nothing here contains "${search.trim()}".`
                      : 'Until a capability exists there is nothing a role can be granted.'
                  }
                />
              }
            />
          </SectionCard>

          <SectionCard
            title="Features"
            subtitle="The tag a screen or a request checks before it lets somebody act."
            flush
            actions={
              canManage ? (
                <Button
                  size="small"
                  startIcon={<AddRounded />}
                  onClick={() =>
                    setFeatureDraft({ featureName: '', featureTag: '', type: 'frontend' })
                  }
                >
                  New feature
                </Button>
              ) : null
            }
          >
            <DataTable
              bare
              rows={shownFeatures}
              columns={featureColumns}
              getRowId={(r) => r.id}
              defaultSortKey="tag"
              empty={
                <EmptyState
                  title={q ? 'No feature matches that' : 'No features yet'}
                  body={
                    q
                      ? `Nothing here contains "${search.trim()}".`
                      : 'A feature is created by the app that checks it.'
                  }
                />
              }
            />
          </SectionCard>
        </Box>
      )}

      <FormDialog
        open={!!featureDraft}
        title="New feature"
        subtitle="A tag the code checks. Adding it here does not make any screen check it."
        onClose={() => setFeatureDraft(null)}
        onSubmit={saveFeature}
        submitLabel="Add feature"
        submitDisabled={!featureDraftValid}
      >
        {featureDraft && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            <TextField
              label="What it permits"
              value={featureDraft.featureName}
              onChange={(e) => setFeatureDraft({ ...featureDraft, featureName: e.target.value })}
              helperText="A sentence a person can read, e.g. “CF HRMS: approve leave requests”."
              autoFocus
              fullWidth
            />
            <TextField
              label="Tag"
              value={featureDraft.featureTag}
              onChange={(e) => setFeatureDraft({ ...featureDraft, featureTag: e.target.value })}
              helperText="Lower case, underscores, app prefix first — cf_hrms_leave_manage. This is the string the code compares, so it can never be changed afterwards."
              fullWidth
            />
            <TextField
              select
              label="Checked by"
              value={featureDraft.type}
              onChange={(e) =>
                setFeatureDraft({ ...featureDraft, type: e.target.value as 'frontend' | 'backend' })
              }
              helperText="The interface hides things; the server refuses them. A permission that must hold is a server one."
              fullWidth
            >
              <MenuItem value="frontend">The interface</MenuItem>
              <MenuItem value="backend">The server</MenuItem>
            </TextField>
          </Box>
        )}
      </FormDialog>

      <FormDialog
        open={!!capabilityDraft}
        title="New capability"
        subtitle="A bundle of features, named so a role can be granted all of them at once."
        onClose={() => setCapabilityDraft(null)}
        onSubmit={saveCapability}
        submitLabel="Add capability"
        submitDisabled={!capabilityDraftValid}
        maxWidth="md"
      >
        {capabilityDraft && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            <TextField
              label="Name"
              value={capabilityDraft.name}
              onChange={(e) => setCapabilityDraft({ ...capabilityDraft, name: e.target.value })}
              helperText="Convention is the app prefix and what it covers — cf_hrms_leave_manage. It is what an administrator will see on Roles and access."
              autoFocus
              fullWidth
            />
            <TextField
              label="Find a feature"
              value={capabilityDraft.search}
              onChange={(e) => setCapabilityDraft({ ...capabilityDraft, search: e.target.value })}
              fullWidth
            />
            <Box
              sx={{
                maxHeight: 280,
                overflow: 'auto',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-sm)',
                p: 0.5,
              }}
            >
              {draftFeatureList.length === 0 ? (
                <Box sx={{ p: 2, fontSize: 13, color: 'var(--c-text-2)' }}>
                  No feature matches that.
                </Box>
              ) : (
                draftFeatureList.map((f) => (
                  <Box
                    key={f.id}
                    component="label"
                    sx={{
                      display: 'flex',
                      gap: 1,
                      alignItems: 'flex-start',
                      px: 1,
                      py: 0.75,
                      borderRadius: 'var(--r-sm)',
                      cursor: 'pointer',
                      '&:hover': { background: 'var(--c-surface-2)' },
                      '&:focus-within': { outline: '2px solid var(--c-focus)', outlineOffset: -2 },
                    }}
                  >
                    <Checkbox
                      size="small"
                      sx={{ p: 0.25 }}
                      checked={capabilityDraft.featureIds.includes(f.id)}
                      onChange={(e) =>
                        setCapabilityDraft({
                          ...capabilityDraft,
                          featureIds: e.target.checked
                            ? [...capabilityDraft.featureIds, f.id]
                            : capabilityDraft.featureIds.filter((id) => id !== f.id),
                        })
                      }
                      inputProps={{ 'aria-label': f.feature_name }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ fontSize: 13 }}>{f.feature_name}</Box>
                      <Mono sx={{ color: 'var(--c-text-3)' }}>{f.feature_tag ?? '—'}</Mono>
                    </Box>
                  </Box>
                ))
              )}
            </Box>
            <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
              {capabilityDraft.featureIds.length} selected. A capability with no features grants
              nothing — the database already carries a long tail of those.
            </Box>
          </Box>
        )}
      </FormDialog>
    </>
  );
}
