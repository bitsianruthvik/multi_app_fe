---
id: purchase
title: Getting started in Purchase
area: roles
roles: [purchase]
routes: ["/:company/cf_erp/purchase-requests"]
order: 40
---
You buy what Stores cannot give from stock. Your work never starts from an order or an MR — it arrives as purchase requests (PRs). You get quotes, raise purchase orders, chase deliveries and close what will not come. Management approves every PO; Stores books the goods in.

## The chain you sit in
**Need → MR → Stores (take from stock, raise the PR) → Purchase (quotes → PO) → Management approval → Stores GRN → stock**

- A sales order raises its MR from its Material request step, a maintenance order from its **Material request** button, and Stores raises MRs for stock and general use.
- When Stores saves an MR with something left to buy, a PR is made by itself — one per MR.
- So your in-tray is **Purchase › Purchase requests**.

## Your day
### 1. Open the PR list
Go to [Purchase requests](help:purchase-requests). Start on **Not closed**. **Open** means nothing is ordered yet; **Partly ordered** means some lines still need a PO. **Lines to order** shows how much is left.

### 2. Get quotes on the grid
Open a PR — [the quote grid](help:purchase-request).
1. Pick a vendor in each column (**Pick a vendor**); add more columns with **Vendor**.
2. Type each vendor's rate per unit. Tab or Enter moves on; each cell saves by itself.
3. Use the **⋯** in a cell for **Delivery days** and a **Remark**.
4. The lowest rate on each line turns green.

### 3. Raise the PO
1. Click **Raise PO** under the vendor you choose.
2. Check the quantities (0 leaves a line out) and the **Expected delivery**.
3. If the vendor already has a PO waiting for approval, **Put it on** that PO — one PO for several orders.
4. Click **Raise PO**. It goes to Management.

### 4. Follow your POs
[Purchase orders](help:purchase-orders) shows every PO by stage: **Pending Management approval**, **Waiting for goods**, **Part received**, **Closed**, **Closed short**, **Cancelled**. Watch **Outstanding**.

On a [purchase order](help:purchase-order):
- Before approval you can still change prices, add or remove lines, switch on **Reverse charge**, and change which sales orders a line is bought for.
- If Management clicks **Send back**, read the reason, fix the PO and click **Send for approval** again.
- After approval keep the **Expected** dates true — moving a date lists the planned work it makes late.
- If the vendor will not deliver the rest, click **Close PO short** and **Ask Management**. Once approved, the rest goes back to the PR and you can order it from someone else.
- **Cancel** is possible only while nothing has been received.

### 5. Deliveries
Stores books each delivery as a GRN on [Receive against PO](help:purchase-receive). The GRN carries the supplier invoice number and date, the price, discount, GST and freight. When everything is in, the PO closes by itself. If the bill did not come with the goods, Stores ticks **Invoice to follow** and Accounts chases it.

## GST in short
- The PO shows **GST (input credit)**: CGST + SGST when the supplier is in your state, IGST when not.
- "No GST rate" means the item has no HSN / GST rate. Fix it once for the whole family in Setup › Company tax details, not on every PO.
- Under reverse charge you pay the GST yourself, so it is not in the supplier's total.

## Other screens you will use
- [To reorder](help:purchase-to-reorder) — Stores raises stock MRs from it; the PR lands with you.
- [Plate changes](help:purchase-plate-changes) — after the MD approves a plate change on a line that is already on a PO, you change the POs and tick each line off.
- **Purchase › Suppliers** — who you buy from.
- [Management approvals](help:management-approvals) — where your POs are approved.

## Permissions
In the testing phase the Test login holds everything. In real use the Purchase permission does all of Purchase's work: vendors and quotes on a PR, raising and changing POs, sending them for approval, closing short, cancelling and the plate-change checklist. Inventory manage (Stores) no longer does these — it receives the goods. Approving a PO needs the purchase order approval permission and is meant for someone other than the buyer.
