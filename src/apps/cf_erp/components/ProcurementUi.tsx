import type { RequestStatus, RfqStatus, RfqSupplierStatus } from '../api/procurement';
import { REQUEST_STATUS_FAMILY, REQUEST_STATUS_LABEL, RFQ_STATUS_FAMILY, RFQ_STATUS_LABEL, SUPPLIER_STATUS_FAMILY, SUPPLIER_STATUS_LABEL } from '../lib/procurement';
import { Badge } from './ui';

/** A purchase request's state, in the same badge language as everything else. */
export const RequestStatusBadge = ({ status }: { status: RequestStatus }) => <Badge family={REQUEST_STATUS_FAMILY[status]} label={REQUEST_STATUS_LABEL[status]} />;
export const RfqStatusBadge = ({ status }: { status: RfqStatus }) => <Badge family={RFQ_STATUS_FAMILY[status]} label={RFQ_STATUS_LABEL[status]} />;
export const SupplierStatusBadge = ({ status }: { status: RfqSupplierStatus }) => <Badge family={SUPPLIER_STATUS_FAMILY[status]} label={SUPPLIER_STATUS_LABEL[status]} />;
