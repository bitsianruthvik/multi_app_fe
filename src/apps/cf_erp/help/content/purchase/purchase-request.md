---
id: purchase-request
title: A purchase request — quotes and Raise PO
area: purchase
roles: [purchase, management]
routes: ["/:company/cf_erp/purchase-requests/:id"]
order: 31
---
The PR is the request for quotation (RFQ). Rows are what is to buy; columns are vendors. Type each vendor's rate, compare, and raise a purchase order to the vendor you choose.

## What you see
- The **Quotes** grid: **Line** (item, name, status), **Needed**, **PO raised** (and how much is already in), then one column per vendor. A new PR shows three empty vendor columns.
- The lowest rate on each line is shown in green.
- **Purchase orders raised** lists each PO from this PR with its stage and supplier.

## How to collect quotes
1. In an empty column, use **Pick a vendor** to choose a supplier. Click **Vendor** (top of the card) for more columns.
2. Type the rate per unit in each cell (₹ per the line's unit, for example per kg). A cell saves when you leave it, press Enter (which moves down the column; Shift+Enter moves up), or pause typing. Esc puts back the saved rate.
3. Click the **⋯** beside a quoted cell for **Delivery days** and a **Remark**, then **Save**.
4. To swap the vendor in a column, use the **⋯** in its head; the bin removes the column. Both are only offered before a PO is raised from that column.

## How to raise a PO
1. Click **Raise PO** under the vendor's name (it is greyed out until the vendor has quoted an open line).
2. The dialog lists that vendor's quoted lines at their rates. **Quantity** is what is still to order — change it, or type 0 to leave a line out.
3. Set **Expected delivery** for the whole PO (each line keeps its quote's date).
4. If the vendor already has a PO waiting for Management approval, **Put it on** lets you add these lines to it instead of **A new purchase order** — one PO for several orders.
5. Click **Raise PO**. The toast says it waits for Management approval.

## Good to know
- Every PO waits for Management approval before it is placed.
- **PO raised** per line is what live POs hold for it. A PO closed short gives the rest back, and you can raise a new PO for it.
- A rate must be a number, like 62.5.
- Vendors, quotes and raising POs need the Purchase permission; without it the grid is read-only. Stores raises the PR but does not quote or order.
- The grid scrolls sideways inside its own box when there are many vendors.

## Related
- [Purchase requests](help:purchase-requests)
- [A purchase order](help:purchase-order)
