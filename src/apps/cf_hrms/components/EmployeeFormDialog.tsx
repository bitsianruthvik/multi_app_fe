import { useEffect, useMemo, useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { FormDialog } from '@shared/ui';
import {
  peopleApi, EMPLOYMENT_TYPE_LABEL, EMPLOYMENT_STATUS_LABEL,
  type Employee, type EmployeeDetail, type EmployeeInput, type PeoplePickers,
} from '../api/people';

/**
 * Create or edit one employee.
 *
 * Deliberately NOT here: a manager, a position, a department. An employee has
 * none of those — they belong to the work assignment, and a field for them on
 * this form would be the first step to a person doing three jobs having one
 * "department". `contractorId` appears only when the employment type is
 * Contract, because that is the only combination the service accepts.
 *
 * The form does not pre-validate beyond the two fields the user must type
 * something into. Every other rule — the code being free, the exit date, the
 * contractor pairing — is the service's, and FormDialog renders its refusal
 * with the itemised `problems` list intact. Re-implementing those checks here
 * would give two sets of words for one rule.
 */
export function EmployeeFormDialog({
  open,
  onClose,
  onSaved,
  pickers,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (detail: EmployeeDetail) => void;
  pickers: PeoplePickers | null;
  /** Omitted to create. */
  employee?: Employee;
}) {
  const blank: EmployeeInput = useMemo(() => ({
    employeeCode: '',
    fullName: '',
    dateOfBirth: '',
    gender: '',
    phone: '',
    email: '',
    dateOfJoining: new Date().toISOString().slice(0, 10),
    employmentType: 'EMPLOYEE',
    contractorId: null,
    employmentStatus: 'ACTIVE',
    exitDate: '',
  }), []);

  const [form, setForm] = useState<EmployeeInput>(blank);
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: '', postalCode: '', country: '' });
  const [emergency, setEmergency] = useState({ name: '', relationship: '', phone: '' });

  useEffect(() => {
    if (!open) return;
    if (employee) {
      setForm({
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        dateOfBirth: employee.dateOfBirth ?? '',
        gender: employee.gender ?? '',
        phone: employee.phone ?? '',
        email: employee.email ?? '',
        dateOfJoining: employee.dateOfJoining,
        employmentType: employee.employmentType,
        contractorId: employee.contractorId,
        employmentStatus: employee.employmentStatus,
        exitDate: employee.exitDate ?? '',
      });
      setAddress({
        line1: employee.addressJson?.line1 ?? '',
        line2: employee.addressJson?.line2 ?? '',
        city: employee.addressJson?.city ?? '',
        state: employee.addressJson?.state ?? '',
        postalCode: employee.addressJson?.postalCode ?? '',
        country: employee.addressJson?.country ?? '',
      });
      setEmergency({
        name: employee.emergencyContactJson?.name ?? '',
        relationship: employee.emergencyContactJson?.relationship ?? '',
        phone: employee.emergencyContactJson?.phone ?? '',
      });
    } else {
      setForm(blank);
      setAddress({ line1: '', line2: '', city: '', state: '', postalCode: '', country: '' });
      setEmergency({ name: '', relationship: '', phone: '' });
    }
  }, [open, employee, blank]);

  const set = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isContract = form.employmentType === 'CONTRACT';
  const isExited = form.employmentStatus === 'EXITED';

  const submit = async () => {
    const hasAddress = Object.values(address).some((v) => v.trim());
    const hasEmergency = Object.values(emergency).some((v) => v.trim());
    const payload: EmployeeInput = {
      ...form,
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender || null,
      phone: form.phone || null,
      email: form.email || null,
      exitDate: form.exitDate || null,
      // The pairing the service enforces, mirrored so the form never sends a
      // contractor on a permanent employee and gets refused for it.
      contractorId: isContract ? form.contractorId ?? null : null,
      address: hasAddress ? address : null,
      emergencyContact: hasEmergency ? emergency : null,
    };
    const detail = employee
      ? await peopleApi.update(employee.id, payload)
      : await peopleApi.create(payload);
    onSaved(detail);
    onClose();
  };

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 };
  const label = { fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--c-text-3)', mt: 1 };

  return (
    <FormDialog
      open={open}
      title={employee ? `Edit ${employee.fullName}` : 'New employee'}
      subtitle={employee ? undefined : 'One record per person. Their jobs are added afterwards, as work assignments.'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={employee ? 'Save' : 'Create employee'}
      submitDisabled={!form.employeeCode?.trim() || !form.fullName?.trim() || !form.dateOfJoining}
      maxWidth="md"
    >
      <Box sx={grid}>
        <TextField
          label="Employee code"
          required
          value={form.employeeCode ?? ''}
          onChange={(e) => set('employeeCode', e.target.value)}
          size="small"
          autoFocus
          helperText="Unique in this company; case does not matter"
        />
        <TextField
          label="Full name"
          required
          value={form.fullName ?? ''}
          onChange={(e) => set('fullName', e.target.value)}
          size="small"
        />
      </Box>

      <Typography sx={label}>Employment</Typography>
      <Box sx={grid}>
        <TextField
          label="Date of joining"
          required
          type="date"
          value={form.dateOfJoining ?? ''}
          onChange={(e) => set('dateOfJoining', e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Employment type"
          select
          value={form.employmentType ?? 'EMPLOYEE'}
          onChange={(e) => set('employmentType', e.target.value)}
          size="small"
        >
          {(pickers?.employmentTypes ?? Object.keys(EMPLOYMENT_TYPE_LABEL)).map((t) => (
            <MenuItem key={t} value={t}>{EMPLOYMENT_TYPE_LABEL[t] ?? t}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Status"
          select
          value={form.employmentStatus ?? 'ACTIVE'}
          onChange={(e) => set('employmentStatus', e.target.value)}
          size="small"
        >
          {(pickers?.employmentStatuses ?? Object.keys(EMPLOYMENT_STATUS_LABEL)).map((s) => (
            <MenuItem key={s} value={s}>
              {EMPLOYMENT_STATUS_LABEL[s as keyof typeof EMPLOYMENT_STATUS_LABEL] ?? s}
            </MenuItem>
          ))}
        </TextField>
        {/* Only where it is legal. The service refuses a contractor on anything else. */}
        {isContract && (
          <TextField
            label="Contractor"
            select
            required
            value={form.contractorId ?? ''}
            onChange={(e) => set('contractorId', e.target.value ? Number(e.target.value) : null)}
            size="small"
            helperText="Who employs this person"
          >
            {(pickers?.contractors ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
        )}
        {isExited && (
          <TextField
            label="Exit date"
            required
            type="date"
            value={form.exitDate ?? ''}
            onChange={(e) => set('exitDate', e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="Every later report reads this date"
          />
        )}
      </Box>

      <Typography sx={label}>Identity and contact</Typography>
      <Box sx={grid}>
        <TextField
          label="Date of birth"
          type="date"
          value={form.dateOfBirth ?? ''}
          onChange={(e) => set('dateOfBirth', e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField label="Gender" value={form.gender ?? ''} onChange={(e) => set('gender', e.target.value)} size="small" />
        <TextField label="Phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} size="small" />
        <TextField label="Email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} size="small" />
      </Box>

      <Typography sx={label}>Address</Typography>
      <Box sx={grid}>
        <TextField label="Line 1" value={address.line1} onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))} size="small" />
        <TextField label="Line 2" value={address.line2} onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))} size="small" />
        <TextField label="City" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} size="small" />
        <TextField label="State" value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))} size="small" />
        <TextField label="Postal code" value={address.postalCode} onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))} size="small" />
        <TextField label="Country" value={address.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))} size="small" />
      </Box>

      <Typography sx={label}>Emergency contact</Typography>
      <Box sx={grid}>
        <TextField label="Name" value={emergency.name} onChange={(e) => setEmergency((c) => ({ ...c, name: e.target.value }))} size="small" />
        <TextField label="Relationship" value={emergency.relationship} onChange={(e) => setEmergency((c) => ({ ...c, relationship: e.target.value }))} size="small" />
        <TextField label="Phone" value={emergency.phone} onChange={(e) => setEmergency((c) => ({ ...c, phone: e.target.value }))} size="small" />
      </Box>
    </FormDialog>
  );
}
