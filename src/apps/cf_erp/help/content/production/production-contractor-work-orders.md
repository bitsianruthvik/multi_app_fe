---
id: production-contractor-work-orders
title: Contractor work orders
area: production
roles: [accounts, production, management]
routes: ["/:company/cf_erp/contractor-work-orders"]
order: 60
---
Every contractor work order on one board, in Accounts › Work orders. A work order is raised from a production order (fabrication or painting given outside, paid by the tonne), approved by Management, and paid week by week.

## The lanes
- **Waiting approval** — the contractor PO is with Management.
- **Issued** — approved; the contractor may start.
- **In progress** — work done and paid week by week.
- **Completed** — all done (or closed short); money still owed.
- **Paid in full** — done and paid (last 90 days).

Cards move by themselves: Management's approval issues one, payments move it on, all work done completes it, paying the balance closes it.

## What you see
- At the top: how many wait for approval and how much is owed to contractors.
- Each card: the work order code, the sales order and production order, the contractor, the value, "… of … t done · ₹… paid · ₹… owed" and the due date. A card sent back by Management has a red border and the reason.
- **Search work orders** finds one.

## How to start one
Open a production order and use **Give work to a contractor**. There is no "new" button here.

## Related
- [Contractor work orders (Accounts)](help:accounts-contractor-work-orders)
- [A contractor work order](help:production-contractor-work-order)
- [A production order](help:production-order)
