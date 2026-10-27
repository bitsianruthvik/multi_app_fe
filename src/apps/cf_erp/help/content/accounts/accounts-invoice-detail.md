---
id: accounts-invoice-detail
title: One invoice
area: accounts
roles: [accounts, sales, admin]
routes: ["/:company/cf_erp/invoices/:id"]
order: 30
---
One tax invoice: who it is billed and shipped to, the tax, its lines, and the files for the government portals. Accounts issues drafts here and records the IRN and e-way bills.

## What you see
- The header: the invoice number (a draft says *A draft has no number yet — issuing gives it one and freezes it*), the customer and the status. Badges show **IRN** and **N e-way** once entered.
- Facts: **Order**, **Date**, **Place of supply**, **Tax** (*IGST* or *CGST + SGST*), **Total** and **Financial year**.
- **Delivery and transport**: **Billed to**, **Shipped to** (on a draft, a **Ship to** picker), **Invoice date** (empty = the day it is issued), **Transport mode**, **Vehicle no.**, **Transporter**, **Transporter GSTIN**, **Distance (km)**, **LR / RR / airway bill no.**, **LR date** and **Notes**. Click **Save details** after a change.
- **Lines**: one line for each shipment on the invoice, at the order line's rate, with its HSN and tax.
- **Government portals**: **E-invoice** and **E-way bill**.
- Buttons at the top: **Issue** (drafts), **Print** (Original for Recipient, Duplicate for Transporter, Triplicate for Supplier), **PDF** (issued invoices), the bin to delete a draft, and **Cancel** (issued invoices).

## How to issue a draft
1. Check **Ship to**. The ship-to state decides CGST + SGST (same state as the company) or IGST (another state).
2. Fill in the transport details and click **Save details**.
3. To take a shipment off this invoice, click the bin on its line. The shipment can go on another invoice.
4. Click **Issue**, then **Issue it**. The invoice gets its number and is frozen. **Issue** stays greyed while the invoice has problems or no lines.

## How to record the IRN and e-way bill
1. Click **Download e-invoice file**, then upload the file on the e-invoice portal yourself.
2. Click **Enter IRN** and copy in the **IRN** (64 characters), the **Acknowledgement no.**, the **Acknowledgement date and time** and the **Signed QR code text**. Click **Save IRN**. They are printed on the invoice with its QR code.
3. For transport, click **Download e-way bill file** and upload it on the e-way bill portal.
4. Click **Add e-way bill no.** and enter the **E-way bill no.**, **Vehicle no.** and **Valid until**. Add one per vehicle.

## Good to know
- An issued invoice cannot be edited. To correct it, click **Cancel**, type why, and raise a new one.
- The buttons need the accounts manage permission. Without it the invoice is read only.
- Deleting a draft sends its shipments back to un-invoiced.
- The software does not talk to the portals. You upload and copy back by hand.

## Related
- [Invoices](help:accounts-invoices)
- [Receipts](help:accounts-receipts)
- [Company tax details](help:accounts-company-tax)
