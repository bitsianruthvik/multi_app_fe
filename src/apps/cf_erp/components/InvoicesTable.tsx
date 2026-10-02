import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import type { InvoiceSummary } from '../api/gst';
import { dayText } from '../lib/money';
import { INVOICE_STATUS_LABEL, invoiceNoText } from '../lib/gst';
import { Money } from './Money';
import { Mono } from './ui';
import { InvoiceStatusBadge } from './InvoiceParts';
import { DataTable, type DataColumn, type ServerPaging } from './DataTable';

const tick = (yes: boolean, label: string) => (yes
  ? <Box component="span" aria-label={label} title={label} sx={{ color: 'var(--c-success-700)', display: 'inline-flex' }}><CheckRounded fontSize="small" /></Box>
  : <Mono muted>—</Mono>);

/** Invoices as a table: number, date, customer, order, taxable, GST, total, status, IRN and e-way marks. */
export function InvoicesTable({ rows, loading, onOpen, empty, bare, storageKey = 'invoices', hideOrder = false, server }: {
  rows: InvoiceSummary[];
  loading?: boolean;
  onOpen: (i: InvoiceSummary) => void;
  empty: ReactNode;
  bare?: boolean;
  storageKey?: string;
  hideOrder?: boolean;
  /** Set when the rows are one server page of more (Invoices screen). */
  server?: ServerPaging<InvoiceSummary>;
}) {
  const columns: DataColumn<InvoiceSummary>[] = [
    { key: 'no', header: 'Invoice', alwaysVisible: true, sortValue: (i) => i.invoiceNo ?? `~${i.id}`, exportValue: (i) => invoiceNoText(i), render: (i) => <Mono chip muted={!i.invoiceNo}>{invoiceNoText(i)}</Mono> },
    { key: 'date', header: 'Date', sortValue: (i) => i.invoiceDate, render: (i) => <Mono muted={!i.invoiceDate}>{dayText(i.invoiceDate) || '—'}</Mono> },
    { key: 'customer', header: 'Customer', sortValue: (i) => i.customer.name, render: (i) => <Box sx={{ fontWeight: 500 }}>{i.customer.name ?? '—'}</Box> },
    ...(hideOrder ? [] : [{ key: 'order', header: 'Order', sortValue: (i: InvoiceSummary) => i.order.code, render: (i: InvoiceSummary) => <Mono>{i.order.code}</Mono> }]),
    { key: 'taxable', header: 'Taxable', numeric: true, sortValue: (i) => i.taxable, exportValue: (i) => i.taxable, render: (i) => <Money value={i.taxable} /> },
    { key: 'tax', header: 'GST', numeric: true, sortValue: (i) => i.tax, exportValue: (i) => i.tax, render: (i) => <Money value={i.tax} /> },
    { key: 'total', header: 'Total', numeric: true, alwaysVisible: true, sortValue: (i) => i.grandTotal, exportValue: (i) => i.grandTotal, render: (i) => <Money value={i.grandTotal} strong /> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, exportValue: (i) => INVOICE_STATUS_LABEL[i.status], render: (i) => <InvoiceStatusBadge status={i.status} /> },
    { key: 'irn', header: 'IRN', sortValue: (i) => (i.irn ? 1 : 0), exportValue: (i) => (i.irn ? 'yes' : 'no'), render: (i) => tick(!!i.irn, 'IRN entered') },
    { key: 'eway', header: 'E-way', sortValue: (i) => i.ewayBills, exportValue: (i) => i.ewayBills, render: (i) => tick(i.ewayBills > 0, `${i.ewayBills} e-way bill${i.ewayBills === 1 ? '' : 's'}`) },
  ];
  return <DataTable rows={rows} columns={columns} getRowId={(i) => i.id} onRowClick={onOpen} loading={loading} bare={bare} server={server} storageKey={storageKey} exportName="invoices"
    defaultSortKey="date" defaultSortDir="desc" empty={empty} />;
}
