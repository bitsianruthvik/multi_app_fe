import type { ReactNode } from 'react';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import type { PurchaseStage, PurchaseType } from '../../api/types';
import type { PrStatus } from '../../api/purchaseRequests';
import { Badge, type Family } from '../ui';
import { PO_STAGE_LABEL, PO_TYPE_LABEL, PR_STATUS_LABEL } from '../../lib/purchaseRequest';

const STAGE_FAMILY: Record<PurchaseStage, Family> = {
  pending_approval: 'warning', requested: 'warning', waiting: 'info', part_received: 'info', closed: 'success', closed_short: 'neutral', cancelled: 'neutral',
};
const STAGE_ICON: Record<PurchaseStage, ReactNode> = {
  pending_approval: <HourglassTopRounded />, requested: <EditNoteRounded />, waiting: <LocalShippingRounded />, part_received: <Inventory2Rounded />,
  closed: <CheckCircleRounded />, closed_short: <RemoveCircleOutlineRounded />, cancelled: <BlockRounded />,
};

export function PoStageBadge({ stage, label }: { stage: PurchaseStage | undefined; label?: string }) {
  const s: PurchaseStage = stage ?? 'requested';
  return <Badge family={STAGE_FAMILY[s]} icon={STAGE_ICON[s]} label={label ?? PO_STAGE_LABEL[s]} />;
}

export function PoTypeChip({ type }: { type: PurchaseType | undefined }) {
  return <Badge family="neutral" noIcon label={PO_TYPE_LABEL[type ?? 'material']} />;
}

const PR_FAMILY: Record<PrStatus, Family> = { open: 'warning', partly_ordered: 'info', ordered: 'info', closed: 'success' };

export function PrStatusBadge({ status }: { status: PrStatus }) {
  return <Badge family={PR_FAMILY[status]} noIcon label={PR_STATUS_LABEL[status]} />;
}
