---
id: stores-movements
title: Movements
area: stores
roles: [stores, accounts, management]
routes: ["/:company/cf_erp/movements"]
order: 20
---
The stock ledger: every receipt, issue, transfer, count and scrap, newest first. Every stock figure in the app is built from these. A posted movement never changes; a mistake is undone by reversing it.

## What you see
- Figures: **Movements**, **This month**, **Receipts** (click to filter) and **Reversed**.
- Type chips: **All**, **Receipts**, **Issues**, **Transfers**, **Counts**, **Scrap**.
- Search by **document, reference, supplier, order**.
- Click a row to open the movement.

## How to post a movement
With the inventory manage permission the buttons **Receive**, **Issue**, **Transfer**, **Count** and **Scrap** sit at the top. They open the same form as on the Stock screen:
- **Receive stock** — stock arriving (pick an optional **Supplier**). A batch-kept item starts a new batch with its values, such as the heat number.
- **Issue stock** — stock leaving for use; say what it is used for: a sales order or General.
- **Transfer stock** — between two areas; nothing is used up.
- **Count stock** — type what is really there; the difference is posted. Give a reason.
- **Scrap stock** — written off; give a reason.

## Good to know
- GRNs booked in Receive against PO, production issues and dispatches all appear here too.
- Use **Reverse** on the movement's own page to undo one.

## Related
- [A movement](help:stores-movement)
- [Stock](help:stores-stock)
