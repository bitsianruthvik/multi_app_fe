---
id: purchase-orders
title: Purchase orders
area: purchase
roles: [purchase, management, stores, accounts]
routes: ["/:company/cf_erp/purchase-orders"]
order: 40
---
Every purchase order, material and contractor, with its stage. Purchase follows its POs here; Management sees what waits for approval.

## What you see
- The figures on top: **Orders**, **Pending Management approval**, **Waiting for goods** (approved, still with the vendor), **Order value** (before tax; lines with no price are left out) and **Outstanding** (quantity ordered, not yet received).
- Stage chips: **Open**, **Pending Management approval**, **Waiting for goods**, **Part received**, **Closed**, **Closed short**, **Cancelled**, **All**.
- Columns: **Number**, **Stage**, **Type** (Material or Contractor), **Supplier**, **For order**, **Ordered**, **Received**, **Outstanding**, **Amount**; hidden: **Lines**, **Expected**.

## How a PO moves
1. **Not placed** — made by hand, still a draft.
2. **Pending Management approval** — raised from a PR or sent for approval.
3. **Waiting for goods** — approved.
4. **Part received** — some GRNs booked.
5. **Closed** — everything received (it closes by itself), or **Closed short** — Management agreed the rest will not come. **Cancelled** — called off before anything arrived.

## How to make a PO by hand
1. Click **New purchase order**.
2. Leave **Number** empty for the next number. Pick the supplier (it can be named later), **Expected**, **For sales order (optional)** and **Notes**.
3. Click **Create**. The PO opens as a draft: add lines, then **Send for approval**.

Most POs are raised from a purchase request's quote grid instead.

## Good to know
- Making and changing POs needs the Purchase permission. Stores (inventory manage) only receives the goods — and on the customer's own PO may also move its dates, close it short or cancel it.
- Contractor POs come from production orders (Give work to a contractor) and are approved by Management like material POs.

## Related
- [A purchase order](help:purchase-order)
- [A purchase request — quotes and Raise PO](help:purchase-request)
- [Receive against PO (GRN)](help:purchase-receive)
