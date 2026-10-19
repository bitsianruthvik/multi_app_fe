---
id: purchase-material-requests
title: MR inbox (material requests)
area: purchase
roles: [stores, purchase, management]
routes: ["/:company/cf_erp/material-requests"]
order: 10
---
Every material request (MR) in the company lands here, in Stores. Stores opens each one, takes what is already in stock, and the rest goes on a purchase request for Purchase. Purchase never works on MRs directly — only on the purchase requests made from them.

## What you see
- One row per MR: **MR** number, **For**, **Order / what**, **Locked** and **Purchase request**.
- **For** says who the material is for, and so where the cost goes: **Sales order** (the order's cost sheet), **Maintenance order** (the machine's maintenance cost), **Stock** (refills the store) or **General** (overhead, unless a sales order is named).
- **Locked** shows how much of each MR is already earmarked for it. "Waits for the customer's acceptance" means the order is not accepted yet, so nothing is locked.
- **Purchase request** shows the PR made from the MR and its status, or "Not made yet". For customer-supplied material it says "The customer sends it".
- Hidden columns (pick them from the table's column menu): **Customer** and **Material** ("We buy" or "Customer supplies").

## How to find an MR
1. Click a **For** chip — **All**, **Sales order**, **Maintenance order**, **Stock** or **General** — to see one kind.
2. Click **Open** (the default) or **Closed too**.
3. Type in **Search MR, order, customer or note**.
4. Click a row to open the MR.

## How to raise an MR by hand
Use this for stock, consumables, the office, or anything not raised by an order's Material request step.
1. Click **New MR** (top right). A full-screen form opens.
2. Under **For — the cost follows it**, pick **Stock**, **General** or **Sales order**.
3. For **Sales order**, pick the order (required). For **General** you may pick a sales order to charge it to; leave it empty for overhead. **Stock** takes no order.
4. Pick an item in **Item 1**, press Tab, type the **Quantity**. Press Enter to jump to the next row.
5. Add a **Note (what it is for)**.
6. Click **Raise MR** (or press Ctrl+Enter). The MR opens so you can take stock against it.

## Good to know
- A sales order's MR is raised from the order's Material request step; a maintenance order's MR from the maintenance order (**Material request** button). Both arrive here.
- Raising and saving MRs needs the Stores permission (or the older inventory manage permission). Others can look but not change.
- The form refuses: no item, a quantity of zero or less, a Sales order MR with no order, or a Stock MR that names an order.

## Related
- [The order's Material request step](help:order-material)
- [One material request](help:purchase-material-request)
- [To reorder](help:purchase-to-reorder)
- [Purchase requests](help:purchase-requests)
