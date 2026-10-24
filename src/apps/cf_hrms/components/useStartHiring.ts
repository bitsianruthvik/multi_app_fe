import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage, useCompanySlug, useToast } from '@shared/ui';
import { hiringApi, openHiringIdOf } from '../api/hiring';
import { useHiringDialog } from './hiringDialogContext';

/**
 * Start (or continue) the hiring on a position and open it as the pop-up — the
 * logic behind HiringEntry's button, for a caller that has its own control
 * (the org chart's edit menu, "Hire for this", spec §34.5). Same rules: one open
 * hiring per position; a refusal naming the open one goes there instead.
 */
export function useStartHiring(positionId: number | null, onChanged: () => void) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const dialog = useHiringDialog();
  const open = (id: number) => {
    if (dialog) dialog.open(id, onChanged);
    else {
      onChanged();
      navigate(`/${company}/cf_hrms/hiring/${id}`);
    }
  };

  const start = async (forPosition: number | null = positionId) => {
    if (forPosition == null) return;
    setBusy(true);
    try {
      const { hiring: started } = await hiringApi.start(forPosition);
      open(started.id);
    } catch (e) {
      // Someone started one meanwhile: go to it rather than report a refusal.
      let existing = openHiringIdOf(e);
      if (existing == null && (e as { code?: string })?.code === 'HIRING_OPEN') {
        existing = await hiringApi
          .list({ status: 'open', positionId: forPosition })
          .then((r) => r.hirings[0]?.id ?? null)
          .catch(() => null);
      }
      if (existing != null) {
        open(existing);
        return;
      }
      toast.error(errorMessage(e, 'Hiring could not be started for this position.'));
    } finally {
      setBusy(false);
    }
  };
  return { start, open, busy };
}
