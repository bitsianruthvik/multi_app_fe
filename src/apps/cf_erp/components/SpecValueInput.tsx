import type React from 'react';
import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, InputAdornment, MenuItem, TextField,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { AddedSpecOption, DataType, Resolution, SpecOption } from '../api/types';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { enterSubmits } from '../lib/dialog';
import { DialogHeader } from './FormDialog';
import { ErrorNotice } from './ui';
import { useToast } from './toastContext';

/** The specification a value is for — enough to add to its list and to say so. */
interface SpecRef { id: number; code: string; name: string }

/**
 * One input for one specification value, shaped by its data type. Values are
 * kept as strings while typing; the backend checks and converts them.
 *
 * An option list can take a value it does not have yet without leaving the
 * form it sits in: given `spec` (and the record's `chain`), it ends in
 * "+ Add a new value…" for anybody holding the catalog grant. Opt-in, like
 * ClassificationPicker's allowCreate — a filter or a receipt offers nothing to add.
 */
export function SpecValueInput({
  dataType, unit, options, value, onChange, label, disabled, size = 'small', autoFocus, spec, chain,
}: {
  dataType: DataType;
  unit?: string | null;
  options?: SpecOption[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium';
  autoFocus?: boolean;
  /** The specification this value is for. With it, an option list can take a new value in place. */
  spec?: SpecRef;
  /**
   * The resolution chain of the record the value belongs to. Its Variant is
   * where the backend checks a new value against a narrowed list; a machine's
   * chain is offered no new value — machine setup is not the catalog's.
   */
  chain?: Resolution['chain'];
}) {
  const common = { label, size, disabled, fullWidth: true, autoFocus, value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  switch (dataType) {
    case 'number':
      return (
        <TextField
          {...common}
          type="number"
          // Scrolling the page over a focused number field used to change the
          // value silently; dropping focus first leaves the value alone.
          inputProps={{
            step: 'any',
            onWheel: (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
            style: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' },
          }}
          InputProps={unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined}
        />
      );
    case 'boolean':
      return (
        <TextField {...common} select>
          <MenuItem value="">—</MenuItem>
          <MenuItem value="true">Yes</MenuItem>
          <MenuItem value="false">No</MenuItem>
        </TextField>
      );
    case 'date':
      return <TextField {...common} type="date" InputLabelProps={{ shrink: true }} />;
    case 'option':
      return <OptionInput options={options} value={value} onChange={onChange} label={label} disabled={disabled} size={size} autoFocus={autoFocus} spec={spec} chain={chain} />;
    default:
      return <TextField {...common} inputProps={{ maxLength: 500 }} />;
  }
}

/** The synthetic last choice that opens the dialog. It is never a value. */
const ADD = '__add__';

/** The Variant a record sits on: the deepest classification node in its chain. */
function variantOf(chain: Resolution['chain'] | undefined): number | null {
  const nodes = (chain ?? []).filter((s) => s.subjectType === 'classification');
  return nodes.length ? nodes[nodes.length - 1].subjectId : null;
}

function OptionInput({ options, value, onChange, label, disabled, size, autoFocus, spec, chain }: {
  options?: SpecOption[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
  disabled?: boolean;
  size: 'small' | 'medium';
  autoFocus?: boolean;
  spec?: SpecRef;
  chain?: Resolution['chain'];
}) {
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const classificationId = variantOf(chain);
  const onMachine = !!chain?.some((s) => s.subjectType === 'machine');
  const canAdd = !!spec && !onMachine && !disabled && isPermitted('cf_erp_catalog_manage');
  // Values added here are choosable at once, before the caller reads its
  // resolution again. They are kept with the Variant they were checked
  // against: another Variant may narrow them out, so they are not offered there.
  const [made, setMade] = useState<{ at: number | null; list: SpecOption[] }>({ at: null, list: [] });
  const [adding, setAdding] = useState(false);
  // A new key per opening gives the dialog a fresh form, with no effect to reset it.
  const [opening, setOpening] = useState(0);

  const shown = useMemo(() => {
    const given = options ?? [];
    const known = new Set(given.map((o) => o.id));
    const extra = made.at === classificationId ? made.list.filter((o) => !known.has(o.id)) : [];
    return [...given, ...extra];
  }, [options, made, classificationId]);

  return (
    <>
      <TextField select label={label} size={size} disabled={disabled} fullWidth autoFocus={autoFocus} value={value}
        onChange={(e) => {
          if (e.target.value !== ADD) { onChange(e.target.value); return; }
          setOpening((n) => n + 1);
          setAdding(true);
        }}>
        <MenuItem value="">—</MenuItem>
        {shown.map((o) => <MenuItem key={o.id} value={String(o.id)}>{o.label || o.value}</MenuItem>)}
        {canAdd && <MenuItem value={ADD}>+ Add a new value…</MenuItem>}
      </TextField>
      {canAdd && spec && (
        <NewOptionDialog key={opening} open={adding} spec={spec} classificationId={classificationId} known={shown}
          onClose={() => setAdding(false)}
          onAdded={(o) => {
            setMade((m) => ({ at: classificationId, list: [...(m.at === classificationId ? m.list : []), o] }));
            onChange(String(o.id));
            toast.success(`${o.value} added to ${spec.name} and chosen here.`);
          }}
          onExisting={(o) => {
            onChange(String(o.id));
            toast.info(`${spec.name} already has ${o.label || o.value} — chosen here instead of adding it twice.`);
          }} />
      )}
    </>
  );
}

/**
 * A value (and its label) for a specification's list, added for the whole
 * company through the catalog's door, which only adds. Then, by the answer:
 *   added              chosen at once; the form around it is left as it was
 *   already there      the one on the list is chosen instead (DUPLICATE_OPTION)
 *   narrowed out here  it stays a company value but is not chosen — the record
 *                      could not be saved with it — and the dialog says why
 */
function NewOptionDialog({ open, spec, classificationId, known, onClose, onAdded, onExisting }: {
  open: boolean;
  spec: SpecRef;
  classificationId: number | null;
  /** What the list offers now, so a duplicate can be chosen instead. */
  known: SpecOption[];
  onClose: () => void;
  onAdded: (o: SpecOption) => void;
  onExisting: (o: SpecOption) => void;
}) {
  const [form, setForm] = useState({ value: '', label: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  /** Added for the company, but not allowed where this record sits: the backend's sentence. */
  const [notHere, setNotHere] = useState<string | null>(null);
  const typed = form.value.trim();

  const submit = async () => {
    if (!typed || busy || notHere) return;
    setBusy(true);
    setError(null);
    try {
      const res = await cfApi.post<AddedSpecOption>(`/catalog/specifications/${spec.id}/options`, {
        value: typed, label: form.label.trim() || undefined, classificationId: classificationId ?? undefined,
      });
      setBusy(false);
      if (res.narrowedOut) { setNotHere(res.message); return; }
      onAdded(res.option);
      onClose();
    } catch (e) {
      setBusy(false);
      const err = e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e));
      // Already on the list: choose that one. One this record cannot take
      // (retired, or narrowed out here) is not on its list, and the backend's
      // sentence says why instead.
      const same = err.code === 'DUPLICATE_OPTION' ? known.find((o) => o.value.trim().toLowerCase() === typed.toLowerCase()) : undefined;
      if (same) { onExisting(same); onClose(); return; }
      setError(err);
    }
  };

  const onKeyDown = enterSubmits(() => { void submit(); }, busy || !typed || !!notHere);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth onKeyDown={onKeyDown}>
      <DialogHeader title={`New ${spec.name.toLowerCase()} value`} onClose={onClose} busy={busy}
        subtitle={notHere
          ? `Added to ${spec.name} for the whole company — but not chosen here.`
          : `Added to ${spec.name} for the whole company and chosen here. Renaming, reordering and retiring values stay in Setup.`} />
      <DialogContent>
        <ErrorNotice error={error} />
        {notHere ? (
          <Alert severity="warning" sx={{ borderRadius: 'var(--r-sm)' }}>
            <Box>{notHere}</Box>
            <Box sx={{ mt: 0.75 }}>It has not been chosen here — this record could not be saved with it.</Box>
          </Alert>
        ) : (
          // The Value field opens focused, so its label is already floating: the
          // extra top room keeps it clear of the title's edge, which clips it.
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1.5 }}>
            <TextField size="small" required autoFocus label="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
              inputProps={{ maxLength: 100, style: { fontFamily: 'var(--font-mono)' } }} helperText="Stored as typed — codes use it, e.g. E450" />
            <TextField size="small" label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              inputProps={{ maxLength: 255 }} helperText="Optional — shown in lists instead of the value" />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Box sx={{ flex: 1 }} />
        {notHere ? (
          <Button variant="contained" onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="contained" onClick={() => void submit()} disabled={busy || !typed}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
              {busy ? 'Adding…' : 'Add value'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
