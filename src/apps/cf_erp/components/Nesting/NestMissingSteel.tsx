import { useState } from 'react';
import { Box, Button, CircularProgress, Tooltip } from '@mui/material';
import AddCircleOutlineRounded from '@mui/icons-material/AddCircleOutlineRounded';
import { addMissingSteel, type NestPlatesAdded } from '../../api/nesting';
import type { NestPlanMissingSteel } from '../../api/types';
import { mm } from '../../lib/nesting';
import { steelWords } from '../../lib/nestMissingSteel';

/** Who may add a plate here: the order grant (the route is the order's) and the catalog grant (it writes an item). */
export const NO_CATALOG = 'Adding a plate to the catalog needs the catalog grant (Catalog › manage). Ask someone who has it, or add the plate in Catalog › Items.';

/**
 * "ADD THIS PLATE TO THE CATALOG" (2026-10-31), beside a plan's problem "No catalog plate is 8 mm MS E250 …". The
 * server makes the plate at the size the company's plates of that thickness use most (else the size most plates are),
 * coded and named by the company's rules, as Catalog › Items would; the screen then runs the plan again.
 */
export function NestMissingSteel({ orderId, lineId, missing, canAdd, why, onAdded, onError }: {
  orderId: number;
  lineId: number;
  /** The steels of ONE problem (one per impact class its pieces ask). */
  missing: NestPlanMissingSteel[];
  canAdd: boolean;
  /** Why it cannot be added (no grant, a run going). */
  why?: string | null;
  onAdded: (out: NestPlatesAdded) => void;
  onError: (e: unknown) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!missing.length) return null;
  const add = async (m: NestPlanMissingSteel) => {
    setBusy(m.key);
    try { onAdded(await addMissingSteel(orderId, lineId, m)); } catch (e) { onError(e); } finally { setBusy(null); }
  };
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
      {missing.map((m) => {
        const label = missing.length > 1 ? `Add a ${steelWords(m)} plate to the catalog` : 'Add this plate to the catalog';
        const tip = !canAdd ? (why ?? NO_CATALOG)
          : `Makes a ${steelWords(m)} catalog plate at the size your ${mm(m.thickness)} mm plates use most (else your most common plate size), coded and named by your coding rules — then runs nesting again.`;
        return (
          <Tooltip key={m.key} title={tip}>
            <span>
              <Button size="small" variant="outlined" color="warning" data-testid="nest-add-missing-steel"
                disabled={!canAdd || busy != null} onClick={() => { void add(m); }}
                startIcon={busy === m.key ? <CircularProgress size={14} /> : <AddCircleOutlineRounded fontSize="small" />}>
                {busy === m.key ? 'Adding…' : label}
              </Button>
            </span>
          </Tooltip>
        );
      })}
    </Box>
  );
}
