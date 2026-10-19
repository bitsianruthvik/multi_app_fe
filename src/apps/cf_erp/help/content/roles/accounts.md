---
id: accounts
title: Getting started as Accounts
area: roles
roles: [accounts]
routes: []
order: 30
---
This guide is for the accounts team. Your job in the app: set up the company's tax details once, raise GST invoices when milestones fall due, record what customers pay, pay contractors week by week, and watch each order's margin.

## Your screens (the Accounts menu)
- **Billing**: payment milestones as cards.
- **Invoices**: every tax invoice.
- **Receipts**: money received.
- **Order costing**: the margin of each order.
- **Work orders**: contractor work and its weekly payments.
- And under Setup, **Company tax details**.

## Once, before the first invoice
1. Open [Company tax details](help:accounts-company-tax).
2. Fill in **Who is selling**: legal name, GSTIN (the state fills in from it), address, city and pincode.
3. Set the **Invoice prefix** and, if needed, the **LUT number** and **E-invoice required**.
4. Check the **GST rates** list (for example 5, 12, 18, 28).
5. In **HSN and GST by catalog family**, give every family an HSN and a rate. Steel structures and girders usually take HSN 7308. Without this, invoices are blocked and purchase orders show GST ₹0.
6. Make sure each customer has a GSTIN, or is marked unregistered, and a state. Sales keeps the customer records.

## Every day
1. Open [Billing](help:accounts-billing). Cards in **Due to bill** moved there by themselves: the advance when Management approves the acceptance, the dispatch share when a girder ships, and so on.
2. Tick the due cards of one order and click **Raise invoice**. Check the date, credit days and the tax: **CGST + SGST** inside the state, **IGST** for another state. Fix anything in **Fill these in first**, then click **Raise invoice**. The PDF opens; send it to the customer.
3. Open [Invoices](help:accounts-invoices). Issue any **Drafts** made by dispatches (see [One invoice](help:accounts-invoice-detail)). For each invoice, download the e-invoice file, upload it on the portal, and click **Enter IRN** with what the portal gives back. Add the **e-way bill** number per vehicle.
4. When money arrives, click **Record payment** on the billed card, or use [Receipts](help:accounts-receipts). Type the amount, date, how it was paid and the UTR or cheque number. Part payments are fine; anything extra stays on account.

## Every week
1. Open [Work orders](help:accounts-contractor-work-orders). For each contractor in **Issued** or **In progress**, open the work order and click **Record payment (P)**. Enter the tonnes done per operation; the amount is tonnes × rate.
2. Open [Order costing](help:management-order-costing). Look at **Not costed** and the margins. A missing scrap rate, plate rate or stock cost makes the margin wrong. Tell Stores or Purchase what is missing.
3. On Billing, chase the red **Overdue** cards.

## Good to know
- Nothing on the billing board is dragged. If a card has not moved, the milestone has not happened in the plant yet.
- One invoice is for one order.
- An issued invoice is frozen. To correct one, cancel it with a reason and raise it again.
- A receipt entered by mistake is removed with a reason, never deleted.
- An order closes when everything is paid and its post-production stages are done. Retention keeps it open until it is paid.

## Related
- [Billing](help:accounts-billing)
- [Receipts](help:accounts-receipts)
- [Company tax details](help:accounts-company-tax)
- [Home](help:home-cockpit)
