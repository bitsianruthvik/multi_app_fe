import { einvoiceFile, ewayBillFile, printInvoiceBlob } from '../api/gst';

/** An invoice number made safe for a file name: INV/26-27/0001 → INV-26-27-0001. */
export const fileStem = (invoiceNo: string | null | undefined, id: number) => (invoiceNo ? invoiceNo.replace(/[^A-Za-z0-9._-]+/g, '-') : `invoice-${id}`);

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The printable invoice. The page wants the bearer header, which a plain link
 * cannot send — so the HTML is fetched here and opened as a blob in a new tab.
 * The tab is opened first, inside the click, or a popup blocker would eat it.
 */
export async function openInvoicePrint(id: number, copy: 'original' | 'duplicate' | 'triplicate'): Promise<void> {
  const tab = window.open('about:blank', '_blank');
  try {
    const blob = await printInvoiceBlob(id, copy);
    const url = URL.createObjectURL(new Blob([blob], { type: 'text/html' }));
    if (tab) tab.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

export async function downloadEinvoice(id: number, invoiceNo: string | null): Promise<void> {
  saveBlob(await einvoiceFile(id), `einvoice-${fileStem(invoiceNo, id)}.json`);
}

export async function downloadEwayBill(id: number, invoiceNo: string | null): Promise<void> {
  saveBlob(await ewayBillFile(id), `ewaybill-${fileStem(invoiceNo, id)}.json`);
}
