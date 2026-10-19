---
id: purchase-order
title: A purchase order — approval, GST and closing
area: purchase
roles: [purchase, management, stores]
routes: ["/:company/cf_erp/purchase-orders/:id"]
order: 41
---
One purchase order: its stage, its lines (ordered, received, pending), the money with GST, and the buttons for each stage. Purchase prepares it, Management approves it, Stores receives against it.

## What you see
- Badges: the stage, the type (**Material** or **Contractor**), and **Customer supplies** for a customer's ₹0 PO.
- Facts: **Supplier**, **For sales order**, **Lines**, **Ordered**, **Received**, **Outstanding**, **Amount**, **GST (input credit)** (or **GST (we pay)** under reverse charge), **Total incl. GST** and **Expected delivery**.
- The **Lines** table: **Item**, **Ordered**, **Received**, **Pending**, **Price (₹)**, **Amount**, **GST**, **For** (the sales orders each line is bought for), **Expected** and **Deliveries** (each GRN, linked).
- **Expected date changes** — who moved a date, and when.

## How to approve (Management)
1. A yellow note says "Waiting for approval in Management…". Nothing can be received until it is approved.
2. Click **Approve** — the PO moves to Waiting for goods. Or click **Send back** and say why; the buyer reads it, changes the PO and sends it again.
3. You can also approve from Management › Approvals, which compares each line with the other quotes on the PR.

## How to prepare a PO (Purchase)
While it is **Not placed** or **Pending Management approval**:
1. Click **Add a line** for another item (**Item**, **Quantity**, **Expected**, **Price per unit (₹, before tax)**), or the bin on a line to remove it.
2. Type a price in **Price (₹)**. The pencil in **For** changes which sales orders a line is bought for.
3. Switch on **Reverse charge — we pay the GST, not the supplier** when that applies.
4. For a hand-made draft, click **Send for approval** (it needs a supplier and at least one line).

## After approval
- Click **Receive goods** to open Receive against PO for this PO.
- Change a line's or the PO's **Expected** date while goods are pending; planned cards that become late are listed.
- Click **Close PO short**, give **Why** and **Ask Management**. Once Management approves, what is pending is released back to the PR; what arrived stays locked for its order.
- **Cancel** is offered only while nothing has been received.

## Good to know
- GST is CGST + SGST when the supplier is in your state, IGST otherwise. "Line with no GST rate" means the item has no HSN / GST rate — use **set HSN / GST by family** (Setup › Company tax details) so the next PO and GRN have it.
- Approving needs the purchase order approval permission (a contractor's PO, the contractor PO approval permission), and is meant for someone other than the person who raised it.

## Related
- [Management approvals](help:management-approvals)
- [Purchase orders](help:purchase-orders)
- [Receive against PO (GRN)](help:purchase-receive)
- [A purchase request](help:purchase-request)
