---
id: stores-batches
title: Batches (heats and lots)
area: stores
roles: [stores, production, management]
routes: ["/:company/cf_erp/batches"]
order: 60
---
Each delivery lot of an item kept by batch — a heat of plate — with what it records (the heat number), where it is, and whether it may be used. Stores and quality use it to trace material and to hold a doubtful heat.

## What you see
- Figures: **Batches**, **Value (ours)**, **On hold** (not issued until released) and **Rejected** (never issued — move or scrap them). Click a figure to filter.
- Status chips: **All**, **Available**, **On hold**, **Rejected**.
- Owner chips when customers' material is held: **Any owner**, **Ours**, or one customer's.
- **In stock** (the default) or **Used up too**.
- Columns: **Batch**, **Item**, **Received**, **Supplier** (with the supplier's lot), **Owner**, **On hand**, **Value**, **Status**; hidden: **Unit cost**.

## How to find a heat
1. Type the heat or lot number in **Search batch, item or supplier lot**.
2. Click **Used up too** if the batch may already be consumed.
3. Click the row to open it.

## Good to know
- A batch starts when an item kept by batch is received — on a GRN (**New batch**, with the **Supplier lot number** and its values) or a stock receipt.
- A customer's lot is never valued as ours; its value shows "theirs".

## Related
- [A batch](help:stores-batch)
- [Receive against PO (GRN)](help:purchase-receive)
