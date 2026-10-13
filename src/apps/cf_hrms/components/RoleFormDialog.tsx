/**
 * Create or edit the role record itself — everything except its content.
 *
 * `role_purpose` gets the most room on purpose. It is the first paragraph of
 * every JD generated from this role, and a role saved without one produces a
 * document that opens with a blank line. The helper text says so rather than
 * leaving someone to discover it at generation time.
 */
import { useEffect, useState } from 'react';
import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import { CodeNote } from './CodeNote';
import { FormDialog } from '@shared/ui';
import { useCan } from '../access/can';
import { createRole, updateRole, listDepartments, type Role } from '../api/roles';

const STATUSES: { value: string; label: string; hint: string }[] = [
  { value: 'DRAFT', label: 'Draft', hint: 'Being written. Not yet something to staff against.' },
  { value: 'ACTIVE', label: 'Active', hint: 'In use — positions can be created for it.' },
  { value: 'RETIRED', label: 'Retired', hint: 'No longer assigned. Kept so old documents stay explicable.' },
];

interface FormState {
  title: string;
  defaultDepartmentId: string;
  status: string;
  rolePurpose: string;
  roleSummary: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const EMPTY: FormState = {
  title: '', defaultDepartmentId: '', status: 'DRAFT',
  rolePurpose: '', roleSummary: '', effectiveFrom: '', effectiveTo: '',
};

export function RoleFormDialog({
  open,
  role,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null to create. */
  role: Role | null;
  onClose: () => void;
  onSaved: (role: Role) => void;
}) {
  const can = useCan();
  // Departments belong to the org area: asked for only with its view.
  const seeDepartments = can.org.view;
  // Retiring a role is a removal (roles.remove); without it the option is not offered
  // (a role that is already retired keeps showing it).
  const mayRetire = can.roles.remove;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<{ id: number; name: string; code: string | null }[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(
      role
        ? {
            title: role.title,
            defaultDepartmentId: role.defaultDepartmentId ? String(role.defaultDepartmentId) : '',
            status: role.status,
            rolePurpose: role.rolePurpose ?? '',
            roleSummary: role.roleSummary ?? '',
            effectiveFrom: role.effectiveFrom ?? '',
            effectiveTo: role.effectiveTo ?? '',
          }
        : EMPTY,
    );
    if (!seeDepartments) {
      setDepartments([]);
      return;
    }
    listDepartments()
      .then((r) => setDepartments(r.items))
      .catch(() => setDepartments([]));
  }, [open, role, seeDepartments]);

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <FormDialog
      open={open}
      title={role ? 'Edit role' : 'New role'}
      subtitle={
        role
          ? role.title
          : 'A role is a reusable kind of work — "Printing Operator". Where it sits is a position, and who does it is the person in that position.'
      }
      onClose={onClose}
      onSubmit={async () => {
        const body = {
          // No code: the server issues it on create and never changes it (spec §11).
          title: form.title,
          defaultDepartmentId: form.defaultDepartmentId ? Number(form.defaultDepartmentId) : null,
          status: form.status,
          rolePurpose: form.rolePurpose || null,
          roleSummary: form.roleSummary || null,
          effectiveFrom: form.effectiveFrom || null,
          effectiveTo: form.effectiveTo || null,
        };
        onSaved(role ? await updateRole(role.id, body) : await createRole(body));
      }}
      submitLabel={role ? 'Save' : 'Create role'}
      enterSubmits={false}
      maxWidth="md"
    >
      <Stack spacing={2} sx={{ mt: 0.5 }}>
        <CodeNote code={role?.roleCode} isNew={!role} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>

          <TextField
            label="Title"
            value={form.title}
            onChange={set('title')}
            required
            size="small"
            fullWidth
            helperText="One title is one role for the whole company — two nodes with the same title share this role."
          />
        </Stack>

        <TextField
          label="Purpose"
          value={form.rolePurpose}
          onChange={set('rolePurpose')}
          multiline
          minRows={3}
          size="small"
          fullWidth
          helperText="Why this role exists, in a sentence or two. It is the first paragraph of every JD generated from this role."
        />

        <TextField
          label="Summary"
          value={form.roleSummary}
          onChange={set('roleSummary')}
          multiline
          minRows={2}
          size="small"
          fullWidth
          helperText="Optional one-line description of the scope."
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {seeDepartments && (
            <TextField
              label="Default department"
              value={form.defaultDepartmentId}
              onChange={set('defaultDepartmentId')}
              select
              size="small"
              fullWidth
              helperText="Where this kind of work usually sits. A position may place it elsewhere."
            >
              <MenuItem value="">—</MenuItem>
              {departments.map((d) => (
                <MenuItem key={d.id} value={String(d.id)}>
                  {d.name}
                  {d.code ? ` (${d.code})` : ''}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField label="Status" value={form.status} onChange={set('status')} select size="small" fullWidth>
            {STATUSES.filter((s) => s.value !== 'RETIRED' || mayRetire || form.status === 'RETIRED').map((s) => (
              <MenuItem key={s.value} value={s.value}>
                <Stack>
                  <Typography sx={{ fontSize: 14 }}>{s.label}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{s.hint}</Typography>
                </Stack>
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Effective from"
            type="date"
            value={form.effectiveFrom}
            onChange={set('effectiveFrom')}
            size="small"
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Effective to"
            type="date"
            value={form.effectiveTo}
            onChange={set('effectiveTo')}
            size="small"
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="Leave empty while the role is current."
          />
        </Stack>
      </Stack>
    </FormDialog>
  );
}

export default RoleFormDialog;
