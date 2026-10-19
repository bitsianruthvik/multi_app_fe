---
id: stores-issuing
title: Issuing material to production and cutting
area: stores
roles: [stores, production]
routes: ["/:company/cf_erp/stock", "/:company/cf_erp/tracker"]
order: 15
---
How bought material reaches the shop floor. Material for an order is first locked to it (MR and GRN), then reserved for the steps that use it, then issued to the order.

## The chain
1. Stores saves the MR: stock taken is earmarked for the order; the rest is bought.
2. The GRN books the delivery into a storage area and locks it for the order.
3. When the production order is released, its steps list the material they need.
4. A step is **Ready** only when its earlier steps are done and its material is reserved.

## How to reserve and issue for released work
1. Open **Tracker** and pick the **Material** view.
2. **Still to reserve** lists material that work still to run needs and does not have. **Cover** says **Covered** or "… short".
3. Click **Reserve** on a row that has free stock. The steps waiting on it turn ready.
4. Click **Issue** on a reserved row and confirm **Issue**. It posts a stock issue to the order from wherever the reserved stock sits — WIP areas first.
5. To free a reservation, click the small button beside it and confirm **Let it go**; the step waits again.

## Issuing consumables and tools
For anything not reserved by a step (gas, grinding discs, a tool), use **Issue** on the Stock screen. **Used for** is required: **A sales order** (order costing counts it) or **General (overhead)**.

## Good to know
- Cutting takes plates only from storage or WIP areas. A plate in a dispatch area cannot be cut ("reserved but not on the shelf") — transfer it to a storage area first.
- Stock in quarantine, on hold or rejected is never issued.
- Reserving and issuing need the inventory manage permission.

## Related
- [Tracker](help:production-tracker)
- [Stock](help:stores-stock)
- [Work in progress](help:stores-wip)
