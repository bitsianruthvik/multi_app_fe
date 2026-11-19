import { useEffect, useState } from 'react';
import { Box, Button } from '@mui/material';
import MoveDownRounded from '@mui/icons-material/MoveDownRounded';
import type { MasterRecord, MovementDetail, MovementType } from '../api/types';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { MovementDialog } from './MovementDialog';
import { useToast } from './toastContext';
import { SuccessCheck } from '../motion';
import { useSavedCheck } from '../hooks/useSavedCheck';
import { useStoresV2 } from '../hooks/useStoresDesk';

const LABEL: Record<MovementType, string> = { receipt: 'Receive', issue: 'Issue', transfer: 'Transfer', scrap: 'Scrap', adjustment: 'Count' };

/**
 * The buttons that post stock movements, with the one form behind them.
 * `requestOpen` opens the form from outside — the Create menu's "Receive stock"
 * arrives as ?new=receipt — and `onRequestHandled` lets the page forget it.
 */
export function MovementButtons({ types = ['receipt', 'issue', 'transfer', 'adjustment'], preset, onPosted, requestOpen, onRequestHandled }: {
  types?: MovementType[];
  preset?: { areaId?: number | null; item?: MasterRecord | null; orderId?: number | null };
  onPosted: (m: MovementDetail) => void;
  requestOpen?: MovementType | null;
  onRequestHandled?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<MovementType | null>(null);
  // §111: on the Stores desk a balance changes only by Receive against a PO, Give out and Count — the free receipt,
  // issue and count are not offered (the server refuses them too). Moving between areas and scrapping stay.
  const desk = useStoresV2();
  const shown = desk ? types.filter((t) => t === 'transfer' || t === 'scrap') : types;
  // Motion: a tick beside the buttons once a movement is posted.
  const [postedTick, markPosted] = useSavedCheck();
  useEffect(() => {
    if (!requestOpen) return;
    if (!desk || requestOpen === 'transfer' || requestOpen === 'scrap') setOpen(requestOpen);
    onRequestHandled?.();
  }, [requestOpen, onRequestHandled, desk]);
  if (!shown.length) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      {postedTick > 0 && <SuccessCheck key={postedTick} size={22} label="Posted" />}
      {shown.map((t, i) => (
        <Button key={t} variant={i === 0 ? 'contained' : 'outlined'} startIcon={i === 0 ? <MoveDownRounded /> : undefined} onClick={() => setOpen(t)}>{LABEL[t]}</Button>
      ))}
      <MovementDialog open={!!open} type={open ?? 'receipt'} preset={preset} onClose={() => setOpen(null)}
        onPosted={(m) => { invalidateNavCounts(); toast.success(`${m.code} posted.`); markPosted(); onPosted(m); }} />
    </Box>
  );
}
