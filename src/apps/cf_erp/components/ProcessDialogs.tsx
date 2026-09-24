import { cloneElement, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Alert, Autocomplete, Box, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { cfApi, qs } from '../api/client';
import type {
  OrderType, Party, ProcessDetail, ProcessStage, Specification, StageKind, StageRequirement,
} from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { NO_MANAGE, ORDER_TYPE_CHOICES, kindName, ruleSentence } from '../lib/process';
import { ErrorNotice, Mono } from './ui';
import { FormDialog } from './FormDialog';

/**
 * The dialogs behind the Processes screen, plus the two small pieces that tell
 * a read-only role why it cannot act. Writes need cf_erp_setup_manage; rather
 * than hide the buttons — which reads as a missing feature — they stay where
 * they are, disabled, and say so on hover.
 */

/** A write control that stays visible when the role cannot write, and says why. */
export function Gated({ can, reason = NO_MANAGE, children }: { can: boolean; reason?: string; children: ReactElement<{ disabled?: boolean }> }) {
  if (can) return children;
  return (
    <Tooltip title={reason}>
      {/* A disabled button fires no events, so the tooltip needs a live wrapper. */}
      <Box component="span" sx={{ display: 'inline-flex' }}>{cloneElement(children, { disabled: true })}</Box>
    </Tooltip>
  );
}

/** Says so once at the top, instead of a screenful of disabled icons. */
export function NoManageNotice() {
  return <Alert severity="info" sx={{ mb: 2 }}>{NO_MANAGE}</Alert>;
}

/** The sentence a dialog is about to save, in the tint the app uses for "this is what you get". */
function SaysBox({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 'var(--r-sm)', background: 'var(--c-primary-50)', border: '1px solid var(--c-primary-200)', color: 'var(--c-primary-900)', fontSize: 13.5 }}>
      {children}
    </Box>
  );
}

/** Creates a process or edits its name and description. The code is fixed once it is live. */
export function ProcessDialog({ open, existing, onClose, onSaved }: {
  open: boolean; existing: ProcessDetail | null; onClose: () => void; onSaved: (p: ProcessDetail) => void;
}) {
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  useEffect(() => {
    if (!open) return;
    setForm(existing
      ? { code: existing.code, name: existing.name, description: existing.description ?? '' }
      : { code: '', name: '', description: '' });
  }, [open, existing]);

  const blocked = !form.code.trim() || !form.name.trim();
  const codeFixed = !!existing && existing.status !== 'draft';

  return (
    <FormDialog
      open={open}
      title={existing ? `Edit ${existing.code}` : 'New process'}
      subtitle={existing ? undefined : 'The office’s running order for an order: the stages it goes through, in order. It starts as a draft — arrange its stages, then activate it.'}
      onClose={onClose}
      submitDisabled={blocked}
      submitLabel={existing ? 'Save' : 'Create'}
      onSubmit={async () => {
        const body = { code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null };
        onSaved(existing
          ? await cfApi.put<ProcessDetail>(`/processes/${existing.id}`, body)
          : await cfApi.post<ProcessDetail>('/processes', body));
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '180px minmax(0, 1fr)' }, gap: 2 }}>
        <TextField label="Code" value={form.code} disabled={codeFixed} autoFocus={!existing}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          inputProps={{ style: { fontFamily: 'var(--font-mono)' } }}
          helperText={codeFixed ? 'Fixed once it is live' : 'e.g. STANDARD'} />
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          helperText="What people call it — e.g. Standard bridge order" />
        <TextField label="Description" value={form.description} multiline sx={{ gridColumn: '1 / -1' }}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          helperText="Optional. When this way of working is used, and what is different about it." />
      </Box>
    </FormDialog>
  );
}

export interface StagePatch {
  label: string | null;
  requirement: StageRequirement;
  overrideSpec: { id: number; code: string; name: string } | null;
}

/**
 * Edits one stage: what it is called here, whether it must be worked, and the
 * specification that lets a line opt out of it. Nothing is saved from here —
 * the page sends the whole ordered list back, because that is the only way the
 * API takes a change to the stages.
 */
export function StageDialog({ open, stage, kinds, onClose, onSave }: {
  open: boolean; stage: ProcessStage | null; kinds: StageKind[]; onClose: () => void; onSave: (patch: StagePatch) => Promise<void>;
}) {
  const specs = useLoad(() => cfApi.get<Specification[]>('/specifications'), []);
  const [label, setLabel] = useState('');
  const [requirement, setRequirement] = useState<StageRequirement>('required');
  const [specId, setSpecId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !stage) return;
    setLabel(stage.label ?? '');
    setRequirement(stage.requirement);
    setSpecId(stage.overrideSpec?.id ?? null);
  }, [open, stage]);

  // Inactive specifications are kept in the list only while one is still attached,
  // so an old choice is never silently swapped for nothing.
  const options = useMemo(
    () => (specs.data ?? []).filter((s) => s.status === 'active' || s.id === stage?.overrideSpec?.id),
    [specs.data, stage],
  );
  const chosen = options.find((s) => s.id === specId) ?? null;
  const own = stage ? kindName(stage.stageKey, kinds) : '';

  return (
    <FormDialog
      open={open}
      title={stage ? `Edit ${label.trim() || own}` : 'Edit stage'}
      subtitle="Saving sends the whole list of stages back, in the order shown."
      onClose={onClose}
      onSubmit={() => onSave({
        label: label.trim() && label.trim() !== own ? label.trim() : null,
        requirement,
        overrideSpec: chosen ? { id: chosen.id, code: chosen.code, name: chosen.name } : null,
      })}
    >
      <ErrorNotice error={specs.error} onRetry={specs.reload} />
      <TextField label="Name on this process" value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder={own} helperText={`Leave it empty to call it what it is called everywhere else: ${own}.`} />
      <TextField select label="Must it be worked?" value={requirement}
        onChange={(e) => setRequirement(e.target.value as StageRequirement)}>
        <MenuItem value="required">Yes — the order waits here until it is done</MenuItem>
        <MenuItem value="optional">No — the order can move past it</MenuItem>
      </TextField>
      <Autocomplete
        size="small"
        options={options}
        value={chosen}
        onChange={(_, s) => setSpecId(s?.id ?? null)}
        getOptionLabel={(s) => `${s.code} · ${s.name}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={specs.error ? 'The specifications could not be loaded' : 'No specification to choose'}
        renderOption={(props, s) => (
          <li {...props} key={s.id}>
            <Box>
              <Box sx={{ fontSize: 14 }}>{s.name} <Mono muted>{s.code}</Mono></Box>
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{s.dataType === 'boolean' ? 'Yes or no' : s.dataType}</Typography>
            </Box>
          </li>
        )}
        renderInput={(p) => <TextField {...p} label="Lines can skip it when (optional)"
          helperText="A yes/no specification reads best here. Leave it empty and the stage is worked out from the order’s own data." />}
      />
      <SaysBox>
        {chosen
          ? `A line whose item says no to ${chosen.name} skips this stage.`
          : 'Every line goes through this stage unless the order’s own data says otherwise.'}
      </SaysBox>
    </FormDialog>
  );
}

/**
 * Adds a rule: a customer, a kind of order, both, or neither. Neither is the
 * house default — the process an order falls back to when nothing narrower
 * claims it.
 */
export function ProcessRuleDialog({ open, processId, onClose, onSaved }: {
  open: boolean; processId: number; onClose: () => void; onSaved: () => void;
}) {
  const parties = useLoad(() => cfApi.get<Party[]>(`/parties${qs({ limit: 500 })}`), []);
  const [customer, setCustomer] = useState<Party | null>(null);
  const [orderType, setOrderType] = useState<'' | OrderType>('');

  useEffect(() => { if (open) { setCustomer(null); setOrderType(''); } }, [open]);

  const customers = useMemo(
    () => (parties.data ?? []).filter((p) => p.roles.includes('customer') && p.status === 'active'),
    [parties.data],
  );
  const rule = { customer: customer ? { id: customer.id, name: customer.name } : null, orderType: orderType || null };

  return (
    <FormDialog
      open={open}
      title="Add a rule"
      subtitle="Who follows this process. A rule naming both a customer and a kind of order beats one naming only a customer, which beats one naming only a kind, which beats the house default."
      onClose={onClose}
      submitLabel="Add rule"
      onSubmit={async () => {
        await cfApi.post(`/processes/${processId}/rules`, { customerId: customer?.id ?? null, orderType: orderType || null });
        onSaved();
      }}
    >
      {/* Customers live in the shared parties module, which a setup-only role may
          not be able to read — say that instead of showing an empty picker. */}
      {parties.error && (
        <Alert severity="info">
          The customer list could not be loaded — you may not have permission to see customers. A rule for a kind of order, or the house default, can still be added.
        </Alert>
      )}
      <Autocomplete
        size="small"
        options={customers}
        value={customer}
        onChange={(_, p) => setCustomer(p)}
        getOptionLabel={(p) => `${p.code} · ${p.name}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        loading={parties.loading}
        noOptionsText={parties.error ? 'Could not load customers' : 'No customers yet'}
        renderInput={(p) => <TextField {...p} label="Customer (optional)" autoFocus helperText="Leave it empty for any customer." />}
      />
      <TextField select label="Kind of order" value={orderType} onChange={(e) => setOrderType(e.target.value as '' | OrderType)}>
        {ORDER_TYPE_CHOICES.map((c) => <MenuItem key={c.value || 'any'} value={c.value}>{c.label}</MenuItem>)}
      </TextField>
      <SaysBox>{ruleSentence(rule)}</SaysBox>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        Each combination belongs to one process. If another process already claims this one, the save is refused and names it.
      </Typography>
    </FormDialog>
  );
}
