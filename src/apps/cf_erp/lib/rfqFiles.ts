import { rfqPrintBlob } from '../api/procurement';

/**
 * The printable RFQ for one supplier. The page needs the bearer header, which a plain link cannot send, so the HTML
 * is fetched here and opened as a blob in a new tab (as the invoice is). The tab is opened first, inside the click,
 * or a popup blocker would eat it.
 */
export async function openRfqPrint(rfqId: number, supplierId: number): Promise<void> {
  const tab = window.open('about:blank', '_blank');
  try {
    const blob = await rfqPrintBlob(rfqId, supplierId);
    const url = URL.createObjectURL(new Blob([blob], { type: 'text/html' }));
    if (tab) tab.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
