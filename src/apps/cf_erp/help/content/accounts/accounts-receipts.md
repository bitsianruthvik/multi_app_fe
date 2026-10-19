---
id: accounts-receipts
title: Receipts (record a payment)
area: accounts
roles: [accounts, management, admin]
routes: ["/:company/cf_erp/receipts"]
order: 40
---
**Accounts › Receipts** lists the money received from customers and is where Accounts records each payment, against an invoice or the order. Part payments are fine.

## What you see
- **Order the payment is for** and the **Record a payment** button (needs the accounts manage permission).
- The list: **Date**, **Receipt**, **Order**, **Customer**, **Against** (an invoice, or *The order*), **Amount**, **On account**, **How** and **Reference**. Each row has **Remove**.
- A total line under the list: *N payments · ₹ received*.

## How to record a payment
1. In **Order the payment is for**, type the order code and pick it.
2. Click **Record a payment**. The dialog says what the customer owes, on how many invoices, and any amount already on account.
3. In **Against**, pick the invoice, or leave **The order (oldest invoice first)**. Picking an invoice fills in what it still owes.
4. Fill in **Amount received (₹)**, **Received on**, **How** (Bank transfer (NEFT / RTGS), Cheque, UPI, Cash or Other), **Reference (UTR, cheque no.)** and **Notes (optional)**.
5. Click **Record payment**.

You can also record a payment from a **Billed** card on the [Billing](help:accounts-billing) board with **Record payment**. The invoice and its amount are filled in for you.

## What happens next
- The money is set against the invoice, or the oldest open invoices of the order. Anything more is kept **On account**.
- A fully paid invoice moves its billing card to **Paid**.
- When everything is paid and the post-production stages are done, the order closes, and the message says so.

## How to undo a mistake
1. Click **Remove** on the row.
2. Type **Why is it removed?** and click **Remove**. The receipt is kept with your reason; it no longer counts.

## Good to know
- A receipt cannot be dated in the future.
- Outstanding and overdue amounts show on the billing cards, which turn red when overdue.

## Related
- [Billing](help:accounts-billing)
- [Invoices](help:accounts-invoices)
- [Order costing](help:management-order-costing)
