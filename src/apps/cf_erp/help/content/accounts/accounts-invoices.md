---
id: accounts-invoices
title: Invoices
area: accounts
roles: [accounts, sales, management, admin]
routes: ["/:company/cf_erp/invoices"]
order: 20
---
**Accounts › Invoices** is the list of every tax invoice. Accounts use it to issue drafts and see which still need the IRN or an e-way bill. Sales can find and read an invoice here.

## Where invoices come from
- **Milestone invoices**: raised from [Billing](help:accounts-billing) by ticking due cards, such as the advance, dispatch or retention. They are numbered and issued at once.
- **Dispatch drafts**: when someone with the accounts manage permission ships a line with **Make the tax invoice** ticked, a draft appears here. A dispatch by Stores or Production waits under **Shipped, not invoiced** at the top of this page (and on the order's **Invoices** card) until Accounts click **Make invoice**. A draft has no number until someone issues it.

## What you see
- Figures: **Drafts to issue** (shipped, not yet numbered), **Issued, no IRN** (waiting for the e-invoice portal) and **Issued**. Click a figure to filter.
- Search by number, order or customer, and the chips **All**, **Drafts**, **Issued** and **Cancelled**.
- Columns: **Invoice**, **Date**, **Customer**, **Order**, **Taxable**, **GST**, **Total**, **Status**, **IRN** (a tick when entered) and **E-way** (a tick when at least one e-way bill is added).

## How to work the list
1. Click **Drafts** and open each draft. Check it and click **Issue** (see [Invoice detail](help:accounts-invoice-detail)).
2. Click **Issued, no IRN**. For each invoice, download the e-invoice file, upload it on the portal and enter the IRN.
3. Use the search to answer a customer's question about an invoice number.

## Good to know
- Numbers follow the company's prefix and the financial year, for example INV/26-27/0001. You set the prefix in [Company tax details](help:accounts-company-tax).
- The **IRN** column matters only if *E-invoice required* is switched on for the company.
- A cancelled invoice stays in the list with its reason.
- Raising, editing, issuing and cancelling invoices, the IRN and e-way bills need the accounts manage permission. Sales can read and print them.

## Related
- [Invoice detail](help:accounts-invoice-detail)
- [Billing](help:accounts-billing)
- [Receipts](help:accounts-receipts)
