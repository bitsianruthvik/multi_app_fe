import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import PauseCircleRounded from '@mui/icons-material/PauseCircleRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import type { AreaPurpose, BatchStatus, MovementType, StockCategory } from '../api/types';
import { BATCH_STATUS_LABEL, CATEGORY_LABEL, MOVEMENT_LABEL, PURPOSE_HELP, PURPOSE_LABEL } from '../lib/inventory';
import { Badge, type Family } from './ui';

const CATEGORY_FAMILY: Record<StockCategory, Family> = { available: 'success', in_process: 'info', held: 'warning', rejected: 'danger', dispatch: 'neutral' };
export function CategoryBadge({ category }: { category: StockCategory }) {
  return <Badge family={CATEGORY_FAMILY[category]} label={CATEGORY_LABEL[category]} />;
}

export function PurposeChip({ purpose }: { purpose: AreaPurpose }) {
  return <Badge family={purpose === 'quarantine' ? 'warning' : purpose === 'wip' ? 'info' : 'neutral'} label={PURPOSE_LABEL[purpose]} title={PURPOSE_HELP[purpose]} />;
}

const BATCH_ICON = { available: <CheckCircleRounded />, on_hold: <PauseCircleRounded />, rejected: <CancelRounded /> };
export function BatchStatusBadge({ status, note }: { status: BatchStatus; note?: string | null }) {
  const family: Family = status === 'available' ? 'success' : status === 'on_hold' ? 'warning' : 'danger';
  return <Badge family={family} icon={BATCH_ICON[status]} label={BATCH_STATUS_LABEL[status]} title={note ?? undefined} />;
}

export function MovementTypeChip({ type, reversal = false }: { type: MovementType; reversal?: boolean }) {
  const family: Family = type === 'receipt' ? 'success' : type === 'scrap' ? 'danger' : type === 'adjustment' ? 'warning' : 'neutral';
  return <Badge family={family} label={`${reversal ? 'Reversal · ' : ''}${MOVEMENT_LABEL[type]}`} />;
}
