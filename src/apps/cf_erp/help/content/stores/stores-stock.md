---
id: stores-stock
title: Stock
area: stores
roles: [stores, purchase, production, management, accounts]
routes: ["/:company/cf_erp/stock"]
order: 10
---
Every stocking area's stock in one list. Each row is one item in one area, by owner and by what it counts as. Stores posts receipts, issues, transfers and counts from here.

## What you see
- On top: **Ours — value at cost**, and each customer's material held (theirs, not in our value). Click a customer's name to see only theirs.
- Rows grouped by how the item is kept: **Counted by quantity**, **Kept in lots**, **Tracked piece by piece**. Open a row with its arrow to see the lots or the pieces; click a piece to see its history.
- Columns: **Item**, **Area**, **Owner**, **Quantity**, **kg**, **Value**, **Counts as**.

## How to filter
- **Counts as** chips: **All**, **Raw / available**, **In process (WIP)**, **Finished**, **Held**, **Rejected**, **Dispatch**, **Scrap**, **Offcut**.
- Owner chips (when customers' material is held): **All owners**, **Ours**, **All customers'**, or one customer's.
- **All items**, **Standard (catalog)**, **Custom (made for an order)**; **Any tracking**, **By quantity**, **In lots**, **Piece by piece**.
- **Classification** and **Stocking area** pickers, and **Search item or lot**.
- Long lists load a page at a time — click **Load more**.

## How to post a movement
With the inventory manage permission you see **Receive**, **Issue**, **Transfer** and **Count**.
1. Click the button. The form's title says what it does (**Receive stock**, **Issue stock**, **Transfer stock**, **Count stock**).
2. Pick the area(s): **Into** for a receipt, **From** for an issue, **From** and **To** for a transfer, **Area counted** for a count.
3. For an issue, choose **Used for**: **A sales order** (pick it, and optionally the **Line**; order costing counts it) or **General (overhead)**.
4. Add the lines: **Item** and **Quantity** (a count asks **Counted**). A batch-kept item asks for its batch.
5. Set **Date**, **Reference** (for a receipt, **Delivery note / invoice**) and, for a count or scrap, **Reason**. Click **Post**.

## Good to know
- Supplier deliveries against a PO are booked in Receive against PO, not here — that GRN carries the invoice, GST and the lock for the order.
- An issue never takes from a quarantine area.
- **Check ledger** recounts every balance from its movements and says whether they agree.

## Related
- [Movements](help:stores-movements)
- [Issuing material to production](help:stores-issuing)
- [Stocking areas](help:stores-areas)
- [Receive against PO (GRN)](help:purchase-receive)
