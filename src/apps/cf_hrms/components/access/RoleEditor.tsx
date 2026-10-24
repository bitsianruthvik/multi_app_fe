import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, Link, Radio,
  RadioGroup, TextField, useMediaQuery, useTheme,
} from '@mui/material';
import LockRounded from '@mui/icons-material/LockRounded';
import { Callout, CapsLabel, ConfirmDialog, DialogHeader, ErrorNotice, ToneBadge, useToast } from '@shared/ui';
import { refreshAccess } from '../../access/can';
import {
  SCOPE_LABEL, accessApi, loginsHolding, refusalCode,
  type AccessCatalog, type AccessRight, type AccessRole, type AccessScope, type CatalogArea, type LoginHoldingRole,
} from '../../api/access';

/**
 * One access role, opened: its name, the tick-box table (areas down, the four
 * rights across — CF_HRMS_HIRING_SPEC.md §12.1), the named rights, and its
 * scope.
 *
 * THE TABLE COMES FROM THE SERVER. Which areas exist, which of the four rights
 * each one has, and every label are read from `GET /access/catalog`. A right an
 * area does not have is a dash, not an empty box.
 *
 * TWO RULES WHILE TICKING. Add and edit, Remove and Upload mean nothing without
 * View, so ticking one of them ticks View in that row, and unticking View
 * unticks the rest of the row. The server refuses a set that breaks this; the
 * boxes simply never produce one. Named rights are independent.
 *
 * A LOCKED ROLE opens read-only: every box is shown, none can be changed, and
 * the reason is the first thing on the screen.
 */

const RIGHTS: AccessRight[] = ['view', 'edit', 'remove', 'upload'];
const RIGHT_WORDS: Record<AccessRight, string> = {
  view: 'View',
  edit: 'Add and edit',
  remove: 'Remove',
  upload: 'Upload',
};

const DEPARTMENT_SCOPE_HINT =
  'They see the whole structure, but can only change — and only see people in — the org unit of the position they hold and everything under it.';

function tagOf(area: CatalogArea, right: AccessRight): string | undefined {
  return area.rights.find((r) => r.right === right)?.tag;
}

/** The column's header: the server's word when every area agrees on it, else ours. */
function headerFor(areas: CatalogArea[], right: AccessRight): string {
  const words = new Set<string>();
  for (const a of areas) {
    const r = a.rights.find((x) => x.right === right);
    if (r?.label) words.add(r.label);
  }
  return words.size === 1 ? [...words][0] : RIGHT_WORDS[right];
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function savedSentence(n: number): string {
  if (!n) return 'Saved. No login holds this role yet.';
  return `Saved. This changes what ${n === 1 ? '1 login' : `${n} logins`} can do, from their next click.`;
}

export function RoleEditor({
  role,
  catalog,
  onClose,
  onChanged,
  onCopy,
}: {
  role: AccessRole;
  catalog: AccessCatalog;
  onClose: () => void;
  /** The role was saved or deleted: read the list again. */
  onChanged: () => void;
  /** Start a new role as a copy of this one. */
  onCopy: (role: AccessRole) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const toast = useToast();
  const locked = role.locked;
  const isOwner = role.templateKey === 'OWNER';

  /** Only tags the catalog knows can be ticked, shown or sent. */
  const known = useMemo(() => {
    const all = new Set<string>();
    for (const a of catalog.areas) for (const r of a.rights) all.add(r.tag);
    for (const n of catalog.named) all.add(n.tag);
    return all;
  }, [catalog]);
  const initialTags = useMemo(() => new Set(role.tags.filter((t) => known.has(t))), [role.tags, known]);

  const [label, setLabel] = useState(role.label);
  const [description, setDescription] = useState(role.description ?? '');
  const [scope, setScope] = useState<AccessScope>(role.scope);
  const [tags, setTags] = useState<Set<string>>(initialTags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [askClose, setAskClose] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [inUse, setInUse] = useState<LoginHoldingRole[] | null>(null);

  const dirty =
    !locked &&
    (label.trim() !== role.label ||
      description.trim() !== (role.description ?? '').trim() ||
      scope !== role.scope ||
      !sameSet(tags, initialTags));
  const nameless = !label.trim();

  const toggleArea = (area: CatalogArea, right: AccessRight, on: boolean) => {
    setTags((cur) => {
      const next = new Set(cur);
      const tag = tagOf(area, right);
      if (!tag) return cur;
      if (on) {
        next.add(tag);
        const view = tagOf(area, 'view');
        if (right !== 'view' && view) next.add(view);
      } else if (right === 'view') {
        for (const r of area.rights) next.delete(r.tag);
      } else {
        next.delete(tag);
      }
      return next;
    });
  };

  const toggleNamed = (tag: string, on: boolean) => {
    setTags((cur) => {
      const next = new Set(cur);
      if (on) next.add(tag);
      else next.delete(tag);
      return next;
    });
  };

  const close = () => {
    if (busy) return;
    if (dirty) setAskClose(true);
    else onClose();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await accessApi.updateRole(role.roleId, {
        label: label.trim(),
        description: description.trim(),
        scope,
        tags: [...tags],
      });
      toast.success(savedSentence(Number(res.loginsAffected) || 0));
      onChanged();
      void refreshAccess();
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await accessApi.deleteRole(role.roleId);
    } catch (e) {
      // Still held by logins: not an error to read and dismiss, a list to act on.
      if (refusalCode(e) === 'IN_USE') {
        setInUse(loginsHolding(e));
        return;
      }
      throw e;
    }
    toast.success(`${role.label} was deleted.`);
    onChanged();
    onClose();
  };

  const loginsOfRole = `?tab=logins&roleId=${role.roleId}`;

  return (
    <>
      <Dialog open onClose={close} maxWidth="md" fullWidth fullScreen={phone} scroll="paper">
        <DialogHeader
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Box sx={{ overflowWrap: 'anywhere' }}>{role.label}</Box>
              {role.templateKey && <ToneBadge tone="info" noIcon label="Ready-made" />}
              {locked && <ToneBadge tone="neutral" icon={<LockRounded aria-hidden />} label="Locked" />}
            </Box>
          }
          subtitle={`${role.loginCount === 1 ? '1 login holds' : `${role.loginCount} logins hold`} this access role`}
          onClose={close}
          busy={busy}
        />
        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 } }}>
          {locked &&
            (isOwner ? (
              <Callout icon={<LockRounded />} title="This is the Owner role.">
                It always holds every right, so that the company can never lock itself out.
              </Callout>
            ) : (
              <Callout icon={<LockRounded />} title="This role is ready-made and cannot be changed.">
                Copy it to make your own.
                <Box sx={{ mt: 1 }}>
                  <Button size="small" variant="outlined" onClick={() => onCopy(role)}>
                    Make a copy
                  </Button>
                </Box>
              </Callout>
            ))}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            <TextField
              label="Name"
              size="small"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={locked || busy}
              error={!locked && nameless}
              helperText={!locked && nameless ? 'Give the role a name.' : undefined}
              slotProps={{ htmlInput: { maxLength: 80 } }}
              fullWidth
            />
            <TextField
              label="Description (optional)"
              size="small"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={locked || busy}
              multiline
              minRows={1}
              maxRows={3}
              slotProps={{ htmlInput: { maxLength: 250 } }}
              fullWidth
            />
          </Box>

          <CapsLabel sx={{ mb: 1 }}>What this role may do</CapsLabel>
          {/* Only this box scrolls sideways on a very narrow screen — never the page. */}
          <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', mb: 3 }}>
            <Box
              component="table"
              sx={{
                width: '100%',
                minWidth: 330,
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                '& th, & td': { borderBottom: '1px solid var(--c-divider)', verticalAlign: 'middle' },
                '& tbody tr:last-of-type th, & tbody tr:last-of-type td': { borderBottom: 'none' },
              }}
            >
              <Box component="thead" sx={{ background: 'var(--c-surface-2)' }}>
                <tr>
                  <Box component="th" scope="col" sx={{ textAlign: 'left', px: 1.5, py: 1, fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' }}>
                    Area
                  </Box>
                  {RIGHTS.map((r) => (
                    <Box
                      component="th"
                      scope="col"
                      key={r}
                      sx={{ width: { xs: 52, sm: 96 }, px: 0.25, py: 1, fontSize: { xs: 11, sm: 12 }, lineHeight: 1.25, fontWeight: 600, color: 'var(--c-text-2)', textAlign: 'center' }}
                    >
                      {headerFor(catalog.areas, r)}
                    </Box>
                  ))}
                </tr>
              </Box>
              <tbody>
                {catalog.areas.map((area) => (
                  <tr key={area.key}>
                    <Box component="th" scope="row" sx={{ textAlign: 'left', px: 1.5, py: 1, fontWeight: 400 }}>
                      <Box sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>{area.label}</Box>
                      {area.screens.length > 0 && (
                        <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                          {area.screens.join(', ')}
                        </Box>
                      )}
                    </Box>
                    {RIGHTS.map((r) => {
                      const tag = tagOf(area, r);
                      return (
                        <Box component="td" key={r} sx={{ textAlign: 'center', p: 0 }}>
                          {tag ? (
                            <Checkbox
                              size="small"
                              checked={tags.has(tag)}
                              disabled={locked || busy}
                              onChange={(e) => toggleArea(area, r, e.target.checked)}
                              slotProps={{ input: { 'aria-label': `${headerFor(catalog.areas, r)} — ${area.label}` } }}
                            />
                          ) : (
                            <Box component="span" role="img" aria-label="Does not exist" sx={{ color: 'var(--c-text-3)' }}>
                              –
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>

          {catalog.named.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <CapsLabel sx={{ mb: 0.5 }}>Named rights</CapsLabel>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {catalog.named.map((n) => (
                  <Box component="li" key={n.tag} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, py: 0.5 }}>
                    <Checkbox
                      size="small"
                      id={`named-${n.tag}`}
                      checked={tags.has(n.tag)}
                      disabled={locked || busy}
                      onChange={(e) => toggleNamed(n.tag, e.target.checked)}
                      sx={{ mt: '-5px', ml: '-9px' }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Box component="label" htmlFor={`named-${n.tag}`} sx={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text)', cursor: locked ? 'default' : 'pointer' }}>
                          {n.label}
                        </Box>
                        {n.sensitive && <ToneBadge tone="warning" noIcon label="Sensitive" />}
                      </Box>
                      {n.hint && <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.45 }}>{n.hint}</Box>}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          <CapsLabel id="role-scope-label" sx={{ mb: 0.5 }}>Scope</CapsLabel>
          <RadioGroup
            aria-labelledby="role-scope-label"
            value={scope}
            onChange={(e) => setScope(e.target.value as AccessScope)}
          >
            <FormControlLabel value="COMPANY" control={<Radio size="small" />} disabled={locked || busy} label={SCOPE_LABEL.COMPANY} />
            <FormControlLabel value="DEPARTMENT" control={<Radio size="small" />} disabled={locked || busy} label={SCOPE_LABEL.DEPARTMENT} />
          </RadioGroup>
          <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.45, pl: '28px', maxWidth: 620 }}>{DEPARTMENT_SCOPE_HINT}</Box>
        </DialogContent>

        {(!!error || inUse) && (
          <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2, maxHeight: '40vh', overflowY: 'auto', flexShrink: 0 }}>
            <ErrorNotice error={error} fallback="The role could not be saved." sx={{ mb: inUse ? 2 : 0 }} />
            {inUse && (
              <Callout tone="warning" title="Move these logins to another role first." sx={{ mb: 0 }}>
                A role that a login still holds cannot be deleted.
                {inUse.length > 0 ? (
                  <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5 }}>
                    {inUse.map((l, i) => (
                      <li key={l.userId ?? `${l.email}-${i}`}>
                        <Link component={RouterLink} to={{ search: loginsOfRole }} sx={{ overflowWrap: 'anywhere' }}>
                          {l.name || l.email || 'A login'}
                          {l.name && l.email ? ` · ${l.email}` : ''}
                        </Link>
                      </li>
                    ))}
                  </Box>
                ) : (
                  <Box sx={{ mt: 0.75 }}>
                    <Link component={RouterLink} to={{ search: loginsOfRole }}>
                      Show the logins that hold this role
                    </Link>
                  </Box>
                )}
              </Callout>
            )}
          </Box>
        )}

        <DialogActions sx={{ flexWrap: 'wrap', rowGap: 1, px: { xs: 2, sm: 3 } }}>
          {!locked && (
            <Button color="error" onClick={() => setAskDelete(true)} disabled={busy}>
              Delete role
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          {!locked && !dirty && <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>No changes to save</Box>}
          {!locked && dirty && nameless && <Box sx={{ fontSize: 12.5, color: 'var(--c-danger-600)' }}>Give the role a name.</Box>}
          <Button onClick={close} disabled={busy}>
            {locked || !dirty ? 'Close' : 'Cancel'}
          </Button>
          {!locked && (
            <Button
              variant="contained"
              onClick={save}
              disabled={busy || !dirty || nameless}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={askClose}
        title="Close without saving?"
        body="The changes you made to this role will be lost."
        confirmLabel="Close without saving"
        onConfirm={onClose}
        onClose={() => setAskClose(false)}
      />
      <ConfirmDialog
        open={askDelete}
        danger
        title="Delete this access role?"
        entityName={role.label}
        body="The role is removed. No login is deleted. A role that a login still holds cannot be deleted."
        confirmLabel="Delete role"
        onConfirm={remove}
        onClose={() => setAskDelete(false)}
      />
    </>
  );
}
