import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, FormControlLabel, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import {
  SectionCard, EmptyState, ErrorNotice, ListSkeleton, FormDialog, ConfirmDialog,
  ToneBadge, Mono, useToast,
} from '@shared/ui';
import { peopleApi, type IdentifierList, type PeoplePickers } from '../api/people';

/**
 * Identifiers — Aadhaar, PAN, UAN, ESI and the rest.
 *
 * THE PII CONTRACT, ON THE SCREEN SIDE.
 *
 * The server masks every value unless the caller both asks (`?reveal=1`) and
 * holds `cf_hrms_people_pii`, and an honoured reveal writes an audit row naming
 * who read whose identifiers. This component holds up its half:
 *
 *  - Masked values are what loads. Nothing reveals on mount.
 *  - Revealed values live in ONE piece of state that is dropped the moment the
 *    reader hides them, navigates away or the component unmounts. They are never
 *    written to a ref that outlives the view, never to localStorage, and never
 *    to a URL or query string — a query string ends up in browser history, in
 *    access logs and in proxy traces.
 *  - A reveal auto-hides after ninety seconds, because the usual way an
 *    identifier leaks is a screen left open on a shared terminal.
 *  - Somebody without the permission is not offered the button at all, rather
 *    than being offered one that quietly does nothing.
 */

const AUTO_HIDE_MS = 90_000;

export function EmployeeIdentifiersTab({
  employeeId,
  canManage,
  pickers,
  onCountChange,
}: {
  employeeId: number;
  canManage: boolean;
  /** Passed down rather than fetched — the record screen already has it. */
  pickers: PeoplePickers | null;
  onCountChange?: (n: number) => void;
}) {
  const toast = useToast();
  const [masked, setMasked] = useState<IdentifierList | null>(null);
  /** The only place unmasked values ever sit. Cleared, never persisted. */
  const [revealed, setRevealed] = useState<IdentifierList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revealing, setRevealing] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ identifierType: '', value: '', isVerified: false, validFrom: '', validTo: '' });
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; type: string } | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    setRevealed(null);
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await peopleApi.identifiers(employeeId);
      setMasked(list);
      onCountChange?.(list.items.length);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  // Leaving the screen drops the plaintext, always — including on a route change
  // the reader did not think of as "closing" anything.
  useEffect(() => hide, [hide]);

  const reveal = async () => {
    setRevealing(true);
    try {
      const list = await peopleApi.identifiers(employeeId, true);
      if (list.masked) {
        // The server declined. Say so rather than showing X's with no explanation.
        toast.error('You do not have permission to see the full numbers.');
        return;
      }
      setRevealed(list);
      hideTimer.current = setTimeout(() => setRevealed(null), AUTO_HIDE_MS);
    } catch (err) {
      setError(err);
    } finally {
      setRevealing(false);
    }
  };

  const submitAdd = async () => {
    await peopleApi.addIdentifier(employeeId, {
      identifierType: form.identifierType.trim().toUpperCase(),
      value: form.value.trim(),
      isVerified: form.isVerified,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
    });
    setForm({ identifierType: '', value: '', isVerified: false, validFrom: '', validTo: '' });
    hide();
    await load();
    toast.success('Identifier added.');
  };

  const remove = async () => {
    if (!confirmDelete) return;
    await peopleApi.removeIdentifier(confirmDelete.id);
    setConfirmDelete(null);
    hide();
    await load();
    toast.success('Identifier removed.');
  };

  if (loading) return <SectionCard><ListSkeleton rows={4} /></SectionCard>;
  if (error && !masked) return <ErrorNotice error={error} onRetry={() => void load()} />;
  if (!masked) return null;

  const shown = revealed ?? masked;
  const isRevealed = !!revealed;

  return (
    <>
      <ErrorNotice error={error} />

      <SectionCard
        title="Statutory identifiers"
        subtitle={
          isRevealed
            ? 'Showing the full numbers. This was recorded in the audit log, and they hide again automatically.'
            : 'Stored masked on screen. The full number is only ever fetched when someone with the permission asks for it.'
        }
        actions={(
          <Box sx={{ display: 'flex', gap: 1 }}>
            {masked.canSeePii && shown.items.length > 0 && (
              <Button
                size="small"
                variant={isRevealed ? 'outlined' : 'contained'}
                startIcon={isRevealed ? <VisibilityOffRounded /> : <VisibilityRounded />}
                disabled={revealing}
                onClick={() => (isRevealed ? hide() : void reveal())}
              >
                {isRevealed ? 'Hide numbers' : 'Reveal numbers'}
              </Button>
            )}
            {canManage && (
              <Button size="small" startIcon={<AddRounded />} onClick={() => setAddOpen(true)}>
                Add
              </Button>
            )}
          </Box>
        )}
      >
        {shown.items.length === 0 ? (
          <EmptyState
            icon={<BadgeRounded />}
            title="No identifiers recorded"
            hint="Aadhaar, PAN, UAN, ESI — whatever statute requires for this person."
            action={canManage && (
              <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setAddOpen(true)}>
                Add an identifier
              </Button>
            )}
          />
        ) : (
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <Box component="thead">
              <Box component="tr">
                {['Type', 'Number', 'Verified', 'Valid from', 'Valid to', ''].map((h) => (
                  <Box
                    component="th"
                    key={h}
                    sx={{
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '.06em',
                      textTransform: 'uppercase',
                      color: 'var(--c-text-3)',
                      pb: 1,
                      borderBottom: '1px solid var(--c-border)',
                    }}
                  >
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {shown.items.map((i) => (
                <Box component="tr" key={i.id}>
                  <Box component="td" sx={{ py: 1.25, borderBottom: '1px solid var(--c-border)', fontSize: 13.5, color: 'var(--c-text)' }}>
                    {i.identifierType}
                  </Box>
                  <Box component="td" sx={{ py: 1.25, borderBottom: '1px solid var(--c-border)' }}>
                    <Mono
                      sx={{
                        fontSize: 14,
                        letterSpacing: '.04em',
                        color: isRevealed ? 'var(--c-text)' : 'var(--c-text-2)',
                      }}
                    >
                      {i.value}
                    </Mono>
                  </Box>
                  <Box component="td" sx={{ py: 1.25, borderBottom: '1px solid var(--c-border)' }}>
                    <ToneBadge tone={i.isVerified ? 'success' : 'neutral'} label={i.isVerified ? 'Verified' : 'Unverified'} />
                  </Box>
                  <Box component="td" sx={{ py: 1.25, borderBottom: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-text-2)' }}>
                    {i.validFrom ?? '—'}
                  </Box>
                  <Box component="td" sx={{ py: 1.25, borderBottom: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-text-2)' }}>
                    {i.validTo ?? '—'}
                  </Box>
                  <Box component="td" sx={{ py: 1.25, borderBottom: '1px solid var(--c-border)', textAlign: 'right' }}>
                    {canManage && (
                      <Tooltip title={`Remove ${i.identifierType}`}>
                        <IconButton
                          size="small"
                          aria-label={`Remove ${i.identifierType}`}
                          onClick={() => setConfirmDelete({ id: i.id, type: i.identifierType })}
                        >
                          <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {!masked.canSeePii && shown.items.length > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1.5 }}>
            The full numbers need the “read unmasked statutory identifiers” permission.
          </Typography>
        )}
      </SectionCard>

      {canManage && (
        <FormDialog
          open={addOpen}
          title="Add an identifier"
          subtitle="The number is stored once and shown masked from then on."
          onClose={() => setAddOpen(false)}
          onSubmit={submitAdd}
          submitLabel="Add"
          submitDisabled={!form.identifierType.trim() || !form.value.trim()}
        >
          <Autocomplete
            freeSolo
            options={pickers?.identifierTypes ?? []}
            value={form.identifierType}
            onInputChange={(_, v) => setForm((f) => ({ ...f, identifierType: v }))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Identifier type"
                required
                size="small"
                helperText="Statutory identifiers differ by country — pick one or type a new one"
              />
            )}
          />
          <TextField
            label="Number"
            required
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            size="small"
            fullWidth
            sx={{ mt: 2 }}
            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mt: 2 }}>
            <TextField
              label="Valid from"
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Valid to"
              type="date"
              value={form.validTo}
              onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="A reissued number ends the old row rather than overwriting it"
            />
          </Box>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={(
              <Checkbox
                checked={form.isVerified}
                onChange={(e) => setForm((f) => ({ ...f, isVerified: e.target.checked }))}
              />
            )}
            label="The original document has been seen"
          />
        </FormDialog>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Remove this identifier?"
        entityName={confirmDelete?.type}
        body="The row is soft-deleted, so the history stays. Add it again if it was removed by mistake."
        confirmLabel="Remove"
        danger
        onConfirm={remove}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}
