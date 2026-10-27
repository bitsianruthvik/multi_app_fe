---
id: purchase-requests
title: Purchase requests
area: purchase
roles: [purchase, stores, management]
routes: ["/:company/cf_erp/purchase-requests"]
order: 30
---
Purchase's in-tray. A purchase request (PR) is what Stores raises to Purchase: what is left to buy on one material request after Stores took what it could from stock, or Stores' own purchase (**New PR** in the MR inbox, **Raise PR** on To reorder). Open a PR to get vendors' quotes and raise purchase orders.

## What you see
- One row per PR: **PR** number, **Status**, **Material request** (with the order and line, or "For stock / general …"), **Lines to order** ("3 of 16"), **Vendors** (how many columns are filled) and **Purchase orders** raised from it.
- Status chips: **Not closed** (the default), **Open**, **Partly ordered**, **Ordered**, **Closed**, **All**, each with a count.

## How to work the list
1. Start on **Not closed** — everything still to buy.
2. **Open** = nothing ordered yet. **Partly ordered** = some lines are on a PO, some are not.
3. Type in **Search PR, MR, order or customer** to find one.
4. Click a row to open the quote grid.

## Good to know
- A PR is made when Stores saves an MR with something to buy, or clicks **Raise PR** on To reorder or **New PR** in the MR inbox. Purchase never makes a PR by hand.
- There is one PR per MR. If the order's need changes and Stores saves the MR again, the same PR is brought up to date.
- When a PO is closed short, what it did not deliver comes back to the PR and can be ordered again.

## Related
- [A purchase request — the quote grid](help:purchase-request)
- [Purchase orders](help:purchase-orders)
- [MR inbox](help:purchase-material-requests)
