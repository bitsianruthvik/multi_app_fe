---
id: production-contractor-work-order
title: A contractor work order — weekly payments
area: production
roles: [accounts, production, management]
routes: ["/:company/cf_erp/contractor-work-orders/:id"]
order: 61
---
One contractor work order: its operations, the cells it covers, and its weekly payments. Accounts records the payments; each payment also records the tonnes done.

## What you see
- The code and lane, the contractor, the sales order and the production order.
- **What it is**: **Sales order**, **Production order**, **Contractor PO** (with its stage), **Work** (tonnes done of total, %), **Value**, **Paid** (and owed).
- **Operations** — one contractor PO line each, paid by the tonne: **Tonnes**, **Rate (₹/t)**, **Value**, **Done**, **Left**, **Paid**.
- **Payments** — week by week: **Date**, **Reference**, **Tonnes**, **Amount**, **By**.
- **What it covers** — each BOM row × operation. On the floor these steps show "with … (WO-…)".

## How to record a week's payment
1. Click **Record payment (P)**.
2. Per operation type the **Tonnes done** this week. **₹ / t** comes from the PO; **Amount (₹)** is tonnes × rate unless you type it (a deduction, an advance, the balance).
3. Set **Paid on**, **Reference (UTR, cheque no.)** and **Notes (optional)**.
4. Click **Record payment** (Ctrl+Enter). Tonnes done move the contractor PO like a GRN; all done closes it.

## Other actions
- **Remove** on a payment entered by mistake — say why; its tonnes go back off the PO.
- **Close short** — the contractor will not do the rest. Write why and **Ask Management**; what was done stays paid for.
- **Cancel** — its contractor PO is cancelled and the cells go back in-house.
- **Send again** — after Management sent it back.

## Good to know
- Payments, close short and cancel need the accounts manage permission.

## Related
- [Contractor work orders (Accounts)](help:accounts-contractor-work-orders)
- [Contractor work orders](help:production-contractor-work-orders)
- [A production order](help:production-order)
