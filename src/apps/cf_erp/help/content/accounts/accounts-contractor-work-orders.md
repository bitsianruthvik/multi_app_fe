---
id: accounts-contractor-work-orders
title: Contractor work orders and weekly payments
area: accounts
roles: [accounts, management, production, admin]
routes: ["/:company/cf_erp/contractor-work-orders", "/:company/cf_erp/contractor-work-orders/:id"]
order: 60
---
**Accounts › Work orders** shows every piece of work given to a contractor: raised from a production order, approved by Management, and paid week by week by the tonne. Accounts records the payments here.

## What you see on the board
- Badges: **N waiting approval** and **₹ owed to contractors**.
- Five lanes:
  - **Waiting approval**: contractor PO with Management.
  - **Issued**: approved; the contractor may start.
  - **In progress**: work done and paid week by week.
  - **Completed**: all done (or closed short), but money still owed.
  - **Paid in full**: done and paid in full (last 90 days).
- Each card shows the work order code, the sales order and production order, the contractor, the value, *tonnes done of tonnes · ₹ paid · ₹ owed* and the due date. A card that was sent back has a red border and the reason.
- **Search work orders** and a full-screen button.

## Where a work order comes from
Production opens a production order and uses **Give work to a contractor**. That makes a contractor PO, which goes to Management in [Approvals](help:management-approvals) as a *Contractor PO*. Approval issues it.

## How to pay a contractor for the week
1. Click the card to open the work order.
2. Check **What it is** (Work: tonnes done of tonnes, Value, Paid) and **Operations**: one line per operation, paid by the tonne, with Tonnes, Rate (₹/t), Value, Done, Left and Paid.
3. Click **Record payment (P)**.
4. For each operation, type the **Tonnes done** this week. The amount is tonnes × rate unless you type **Amount (₹)** yourself.
5. Fill in **Paid on**, **Reference (UTR, cheque no.)** and **Notes (optional)**. Check the **Total**.
6. Click **Record payment (Ctrl+Enter)**.

## Other buttons
- **Send again**: send a sent-back work order to Management again.
- **Close short**: ask Management to close it before all the work is done. You must give a reason.
- **Cancel**: cancel the work order, with a reason.
- **Remove** on a payment: for a payment entered by mistake. Its tonnes go back.

## Good to know
- When all the work is done, the dialog says *All the work is done — record what is still owed.*
- Paying the balance moves the card to **Paid in full** by itself.
- **What it covers** lists the BOM rows × operations given to the contractor. Their steps on the tracker show the contractor's name.

## Related
- [Approvals](help:management-approvals)
- [Dashboard — Work orders tab](help:management-dashboard)
