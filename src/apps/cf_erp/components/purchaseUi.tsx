import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import type { ReactNode } from 'react';
import type { PurchaseStatus } from '../api/types';
import { PURCHASE_STATUS_FAMILY, PURCHASE_STATUS_LABEL } from '../lib/purchase';
import { Badge } from './ui';

const ICON: Record<PurchaseStatus, ReactNode> = {
  draft: <EditNoteRounded />,
  ordered: <LocalShippingRounded />,
  partially_received: <Inventory2Rounded />,
  received: <CheckCircleRounded />,
  cancelled: <BlockRounded />,
};

/** A purchase order's state, in the same badge language as everything else. */
export function PurchaseStatusBadge({ status, title }: { status: PurchaseStatus; title?: string }) {
  return <Badge family={PURCHASE_STATUS_FAMILY[status]} icon={ICON[status]} label={PURCHASE_STATUS_LABEL[status]} title={title} />;
}
