---
id: maintenance-board
title: Maintenance — the machines board
area: maintenance
roles: [maintenance, production, management]
routes: ["/:company/cf_erp/maintenance"]
order: 10
---
Every machine at a glance: running, down, stopped or in planned downtime, today and coming up. Maintenance starts the day here; anyone on the floor can raise a fault from it.

## What you see
- Figures: **Down** (a fault holds them — no capacity in the plan until closed), **Planned downtime now**, **Running** and **Open maintenance orders**. Click one to filter, or to open the orders.
- **Show**: **All machines**, **Down**, **Planned downtime**, **Stopped**, **Running**, **Up, no job**, each with a count.
- One card per machine, down machines first. The coloured edge and badge give its state; the line under it says why: "MO-… · down 2 h 05 min", the planned downtime and until when, the stop reason and since when, or how many jobs are running.
- **Next planned:** the machine's next planned downtime.
- Chips for its open maintenance orders ("MO-… · In progress") — click one to open it.
- **Planned downtime — now and the next 14 days** at the foot.

## How to raise a fault from the board
1. Click **Raise a fault** on the machine's card, or the red **Raise a fault** at the top (press F) and pick the machine.
2. Fill the dialog — see [Raise a fault](help:maintenance-raise-fault).

## Good to know
- **Refresh** (R) reads the board again; the full-screen button suits a wall screen.
- Raising a fault needs the Maintenance permission, the machine log (floor) permission or the production manage permission.

## Related
- [Raise a fault](help:maintenance-raise-fault)
- [Maintenance orders](help:maintenance-orders)
- [Planned downtime](help:maintenance-downtime)
