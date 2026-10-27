---
id: production-order
title: A production order
area: production
roles: [production, management, stores, accounts]
routes: ["/:company/cf_erp/production-orders/:id"]
order: 11
---
One production order: its state, what it covers, every piece with its steps, and the contractor work given out from it.

## What you see
- The code and state badge (**Yet to plan**, **Planned**, **In production**, **Dispatch**, **Closed**), and what it makes.
- **What it is**: **Sales order**, **Made per** (the whole order, line, unit or sub-assembly), **Progress**, **Released** (when and by whom), **Dispatch** (as a whole or per unit, and how many shipped).
- **Pieces and steps**: each piece by its code, indented under its parent, with a badge per step — operation code and good / total ("CUT 4/4"). Hover a step to see what it waits for. A step given to a contractor reads "with … (WO-…)".
- **Contractor work**: the work orders made from it.

## How to release, take back and dispatch
1. **Release** (Yet to plan) puts its pieces on the floor.
2. **Take back** undoes a release while nothing has started and nothing was issued.
3. **Dispatch** (state Dispatch) ships the finished units; when all are shipped the production order is **Closed**. This button needs the production manage or the inventory manage permission.
4. **Open in Tracker** shows the same steps in the Tracker, scoped to this production order.

## How to give work to a contractor
1. Click **Give work to a contractor** on the **Contractor work** card.
2. The grid shows BOM rows × operations. Click a cell to pick it, a row's name for the whole row, an operation's head for its column, Shift-click for a block (arrows and Space work too). **Filter rows** narrows the list; **Clear** drops the picks.
3. On the right pick the **Contractor** (parties with the Subcontractor role). Each operation shows its tonnes and **₹ / t** (filled from the contractor's last work order).
4. Add **Due by (optional)** and **Note to the contractor (optional)**.
5. Click **Raise contractor PO** (Ctrl+Enter). The PO goes to Management; once approved the work order is issued and appears in Accounts › Work orders.

## Good to know
- Work is recorded on the Machine log or in the Tracker, not here.
- Giving work needs the production manage or the accounts manage permission.

## Related
- [The order's Production step](help:order-production)
- [Production orders](help:production-orders)
- [Tracker](help:production-tracker)
- [Contractor work orders](help:production-contractor-work-orders)
