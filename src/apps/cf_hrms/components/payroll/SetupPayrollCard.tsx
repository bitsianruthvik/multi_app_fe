import { useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import { ErrorNotice, Surface, useToast } from '@shared/ui';
import { payrollApi } from '../../api/payroll';

/**
 * Shown while the company has no pay components (spec §25.2). One button adds
 * the ready-made components, the sample structure "Staff standard" and the
 * statutory settings with their sources. Safe to press twice: what exists stays.
 */
export function SetupPayrollCard({ canEdit, onDone }: { canEdit: boolean; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const { created } = await payrollApi.setup();
      const parts = [
        created.components.length ? `${created.components.length} components` : '',
        created.structure ? `the structure “${created.structure}”` : '',
        created.statutory.length ? `${created.statutory.length} statutory settings` : '',
      ].filter(Boolean);
      toast.success(parts.length ? `Payroll is set up: ${parts.join(', ')}.` : 'Payroll was already set up.');
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface e={1} sx={{ p: { xs: 2, sm: 3 }, mb: 2 }} data-payroll-setup="">
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <PaymentsOutlined sx={{ fontSize: 32, color: 'var(--c-primary-600)' }} />
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>Payroll is not set up yet</Typography>
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', mt: 0.5 }}>
            Setting up adds the usual components (Basic, HRA, PF, ESI, professional tax, TDS and more), a sample
            salary structure, and the PF, ESI, professional tax and LWF settings, each with its source. You can
            change all of it afterwards.
          </Typography>
          <ErrorNotice error={error} sx={{ mt: 1.5 }} />
          {canEdit ? (
            <Button variant="contained" onClick={() => void run()} disabled={busy} sx={{ mt: 1.5 }}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} data-action="payroll-setup">
              {busy ? 'Setting up…' : 'Set up payroll'}
            </Button>
          ) : (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', mt: 1.5 }}>
              Someone with the right to change payroll can set it up.
            </Typography>
          )}
        </Box>
      </Box>
    </Surface>
  );
}
