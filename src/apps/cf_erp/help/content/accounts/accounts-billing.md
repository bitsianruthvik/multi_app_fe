---
id: accounts-billing
title: Billing
area: accounts
roles: [accounts, management, admin]
routes: ["/:company/cf_erp/billing"]
order: 10
---
**Accounts › Billing** shows every payment milestone of every accepted order as a card: the advance, payment on dispatch, retention and the rest. Cards move by themselves when things happen in the plant. Accounts ticks the due cards and raises the GST invoice.

## What you see
- A summary badge, **N due to bill · ₹**, and a red **overdue** badge when invoices are past their date.
- Four lanes, each with its card count and total:
  - **Upcoming**: not due yet. A card moves to Due by itself when its milestone happens.
  - **Due to bill**: ready to bill. Tick cards of one order and raise one invoice.
  - **Billed**: on an invoice. A card turns red when it is past its due date and not paid.
  - **Paid**: paid in full.
- Each card shows the order code (a link), the milestone name, the amount, a note, when it falls due or *Due since…*, and the customer. Billed and paid cards add **PDF** and **Open** (the invoice), and billed cards add **Record payment**.

## What moves a card to Due
The milestones and their triggers come from the customer acceptance that Management approved. Examples:
- When the order is accepted (usually the advance).
- When the design is frozen.
- When the material is in place, or when the customer's material is received.
- When production starts, or when an operation is completed (pro-rata milestones bill week by week).
- On each dispatch, or when fully dispatched.
- When a post-production stage is done, such as *Inspection by the customer* or *Handover*.
- N days after another event, on a fixed date, or *N months after* a milestone (retention).

Nothing is dragged by hand.

## How to raise an invoice
1. Find the order (use **Search orders**) and tick its cards in **Due to bill**.
2. A blue bar shows **N cards of (order) · ₹ before tax**. Click **Raise invoice**.
3. In **Raise invoice — (order)**, check the **Invoice date** (it cannot be in the future), the **Credit days** (it shows *Pay by (date)*), and add **Notes (optional)**.
4. Read the tax line. *Within the state … CGST + SGST* or *Inter-state … IGST*, then the lines by HSN with Taxable, GST, Tax and Total, and the **Invoice total**.
5. If a yellow **Fill these in first** box appears, fix each point. Each one has a button that takes you to the fix: **Setup › Company tax details**, **Open the customer**, **Open the item** or **Open the template**.
6. Click **Raise invoice**. The invoice is numbered and issued (for example INV/26-27/0001), the card moves to **Billed**, and the PDF opens.

## Good to know
- One invoice is for one order. Cards of two orders cannot be ticked together.
- What blocks an invoice: no HSN code or GST rate on the order line's item or template; the company GSTIN, state, legal name or address missing; a registered customer with no GSTIN; or the customer's state not known.
- The place of supply is the customer's default ship-to state, or their own state. If it equals the company's state the tax is CGST + SGST; otherwise it is IGST.
- When the last card is paid and the post-production stages are done, the order closes by itself. An order with retention still to come stays open until the retention is paid.

## Related
- [Invoices](help:accounts-invoices)
- [Receipts](help:accounts-receipts)
- [Company tax details](help:accounts-company-tax)
- [Approvals](help:management-approvals)
