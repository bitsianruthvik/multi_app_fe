---
id: stores-movement
title: A movement — and reversing it
area: stores
roles: [stores, accounts]
routes: ["/:company/cf_erp/movements/:id"]
order: 21
---
One stock movement: what moved, from where to where, at what cost, and why.

## What you see
- The header: the document code, its type badge, and **Undone** if it was reversed.
- Facts: **Date**, **Supplier**, **For order**, **Used for** (General (overhead) or Sales order, with the line), **Reference**, **Lines**, **Value**, **Scrap handed back** and **Posted**.
- Links to **Reversed by …**, **Reverses …**, the order and the supplier.
- The **Lines** table: **Item**, **Batch**, **From**, **To**, **Quantity** (for a count, the **Change**), **Owner** when a customer's material moved, **Unit cost** and **Value**. A customer's material shows "theirs" and no cost.

## How to reverse a movement
1. Click **Reverse** (top right). It shows only with the inventory manage permission, and not on a movement that is itself a reversal or already reversed.
2. Type **Why** and confirm **Reverse**.
3. The exact opposite is posted, dated today, and opens. Both stay in the ledger.

## Good to know
- A reversal is refused if the stock it put somewhere has since moved on.
- Reversing a GRN lets go of what it held for orders; planned cards may then wait for material again (the message says so — see the Plan board).

## Related
- [Movements](help:stores-movements)
- [Stock](help:stores-stock)
