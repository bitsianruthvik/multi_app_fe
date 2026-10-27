---
id: purchase-material-requests
title: MR inbox (material requests)
area: purchase
roles: [stores, purchase, management]
routes: ["/:company/cf_erp/material-requests"]
order: 10
---
A material request (MR) is a request to Stores. Every one lands here: from a sales order, a maintenance order, or a department's **New MR**. Stores opens each one, takes what is already in stock, and the rest goes on a purchase request (PR) for Purchase. Purchase never works on MRs directly — only on the purchase requests.

Stores' own purchases are not requests to Stores: **New PR** here and **Raise PR** on [To reorder](help:purchase-to-reorder) go straight to a PR, and are not listed in this inbox.

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

## How to ask Stores for material (New MR)
Use this when your department needs material from Stores — consumables, the office, or anything not raised by an order's Material request step.
1. Click **New MR** (top right). A full-screen form opens: **New material request**.
2. Under **For — the cost follows it**, pick **Stock**, **General** or **Sales order**.
3. For **Sales order**, pick the order (required). For **General** you may pick a sales order to charge it to; leave it empty for overhead. **Stock** takes no order.
4. Pick an item in **Item 1**, press Tab, type the **Quantity**. Press Enter to jump to the next row.
5. Add a **Note (what it is for)**.
6. Click **Raise MR** (or press Ctrl+Enter). The MR opens; Stores take what is in stock against it.

## How Stores buys for itself (New PR)
Use this when Stores itself needs something bought — refilling stock, Stores' own consumables. It goes straight to Purchase; nothing is taken from stock.
1. Click **New PR** (top right). A full-screen form opens: **New purchase request**.
2. Under **For — the cost follows it**, pick **Stock** or **General**.
3. For **General** you may pick a **Sales order** or a **Maintenance order** to charge it to; leave both empty for overhead.
4. Add the items and quantities as in New MR, and a **Note (what it is for)**.
5. Click **Raise PR** (or press Ctrl+Enter). The purchase request opens. The app keeps a material request under it; it is not listed here, and you reach it from the PR.

## Good to know
- A sales order's MR is raised from the order's Material request step; a maintenance order's MR from the maintenance order (**Material request** button). Both arrive here.
- **New MR** is open to Stores, maintenance and whoever manages orders. **New PR**, and saving MRs, need the Stores permission (or the older inventory manage permission). Others can look but not change.
- The forms refuse: no item, a quantity of zero or less, a Sales order MR with no order, or a Stock MR that names an order.

## Related
- [The order's Material request step](help:order-material)
- [One material request](help:purchase-material-request)
- [To reorder](help:purchase-to-reorder)
- [Purchase requests](help:purchase-requests)
