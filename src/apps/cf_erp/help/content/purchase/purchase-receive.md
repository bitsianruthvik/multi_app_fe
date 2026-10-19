---
id: purchase-receive
title: Receive against PO (GRN)
area: purchase
roles: [stores, purchase, accounts]
routes: ["/:company/cf_erp/receive"]
order: 50
---
Stores books what a supplier delivers. Each booking is a GRN (goods receipt note) against an approved PO: quantity, store, supplier invoice, price, discount, GST and freight. What arrives is locked for the order it was bought for.

## What you see
- One row per PO line still pending: **Purchase order**, **Vendor**, **Item**, **Ordered**, **Received**, **Pending**, **Due**, **For** (the sales orders, or "stock") and a **Receive** button.
- Only POs approved by Management (or a customer's ₹0 PO) appear.

## How to book a delivery
1. Find the PO (search **PO, vendor or item**, or come from the PO's **Receive goods** button) and click **Receive** on any of its lines.
2. **Book a delivery — GRN** opens with every pending line of that PO. The line you clicked is ticked — tick every other line that came on the same truck.
3. Pick **Into** — only storage areas are offered.
4. Type the **Delivery note**, **Supplier invoice no.** and **Invoice date**, or tick **Invoice to follow** (Accounts sees the GRN flagged until they are entered).
5. Per line, check **Qty**, **Unit price ₹** (from the PO), **MRP ₹**, **Discount** (% or ₹), **HSN / SAC** and **GST**. The table works out **Taxable ₹**, **CGST + SGST ₹** or **IGST ₹**, and **Landed / unit ₹**.
6. For an item kept in batches, fill the batch row: **New batch** with **Supplier lot number** and its values (heat number), or **Add to a batch**.
7. Add **Freight ₹** and **Other charges ₹** if any; tick **GST on it** when taxed.
8. Check **Bill total** and **Stock value (landed, no GST)**, then click **Receive** (Ctrl+Enter). Enter moves to the next field.

## Good to know
- Goods go to a storage area only, never a dispatch, WIP or scrap area — cutting takes plates only from storage. If "No storage area is set up", make one in Stocking areas first.
- The grey line at the bottom says what still stops booking: no line ticked, no area, no invoice number or date, more than is outstanding, no unit price, or no GST rate.
- Freight and other charges are shared over the lines by value and go into the stock cost; their GST is claimed back.
- If the company's or supplier's GST state is missing, pick one in the warning — it is used for this GRN only.
- When everything is in, the PO closes by itself.

## Related
- [A purchase order](help:purchase-order)
- [Stocking areas](help:stores-areas)
- [Batches](help:stores-batches)
