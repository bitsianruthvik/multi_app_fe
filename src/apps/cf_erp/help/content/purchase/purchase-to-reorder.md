---
id: purchase-to-reorder
title: To reorder
area: purchase
roles: [stores, purchase]
routes: ["/:company/cf_erp/to-reorder"]
order: 20
---
The list of catalog items that need buying for stock, suggested by AI from each item's procurement method. Stores ticks, adjusts and raises one purchase request (PR) for stock, which goes straight to Purchase.

## What you see
- Items bought **to min / max** whose free stock (plus what is already coming for stock) is below the minimum — the suggestion fills up to the maximum.
- Items bought **periodically** whose period is over — the suggestion is what was used since the period began.
- Columns: a tick box, **Item**, **How** (the method), **Free**, **Coming**, **Why (by AI)** and **Order** (the quantity). Hidden: **Lead time** and **Preferred vendors**.
- Every row starts ticked, with the suggestion typed in.

## How to raise the reorder PR
1. Untick rows you do not want (click the row or its box).
2. Change any **Order** quantity.
3. Click **Raise PR for N items** (or Ctrl+Enter in a quantity box).
4. The purchase request opens. The toast names it: *PR-… raised for stock — with Purchase.*

## How an item gets on this list
Open the item in the catalog and use its **Procurement** card. **Method** is one of: **Make (in-house)**, **Buy on requirement**, **Buy to min / max**, **Buy periodically**, **Customer supplies**, **Subcontract**. For min / max fill **Minimum stock** and **Maximum stock**; for periodic fill **Every … days**. **Lead time**, **Minimum order**, **Order multiple** and **Preferred vendors** are there too. A temporary (order-made) item takes the method from its definition.

## Good to know
- Only **Buy to min / max** and **Buy periodically** items appear here. Items bought on requirement come through order MRs.
- Each ticked row needs a quantity above zero, and at least one row must be ticked.
- This is Stores' own purchase, not a request to Stores, so it does not appear in the [MR inbox](help:purchase-material-requests). The app keeps a material request for stock under the PR (nothing taken from stock); you reach it from the PR.
- To buy something that is not on this list for Stores itself, use **New PR** in the MR inbox.
- Raising needs the Stores permission.

## Related
- [MR inbox](help:purchase-material-requests)
- [Purchase requests](help:purchase-requests)
