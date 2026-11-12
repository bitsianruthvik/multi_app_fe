---
id: maintenance-machines
title: Machines (the register)
area: maintenance
roles: [maintenance, production, admin]
routes: ["/:company/cf_erp/machines"]
order: 50
---
The register of machines — what does the work. It is **Maintenance › Machine register**: Maintenance (and the production manager) add and change machines here. Stores sees the same list, read-only, as **Stores › Machines**. A machine's type decides what it must carry (a plasma cutter its cutting speed), and the operation rules turn those values into times. Maintenance, planning and the machine log all read this list.

## What you see
- Figures: **Production machines** (or **All machines**), **Active**, and **Machine types** (click to manage them).
- Chips: **Production machines** (machines that can run an operation), **All machines** (the whole asset register) or **Tools** (durable tools); the stage — **In use** (everything not condemned), **Setup**, **Live**, **Condemn asked**, **Condemned**; a **Machine type or group** picker; search.
- Columns: **Code**, **Name**, **Machine type** (click to open the type), **Serial**, **Place**, **With** (who has it, and when it is due back), **Stage**; hidden: **Bought as**, **Production** ("Yes", or "Asset" for a machine with no operation to run).

## How to add a machine you have
1. Make sure its type exists — **Machine types** at the top.
2. Click **New machine** (Maintenance only).

To **buy** one, click **Request a new machine** instead — see [Buying a new machine](help:maintenance-new-machine).
3. Pick the **Machine type**, type the **Name**, leave **Code** empty to number it by the coding rule, add the **Serial number**, **Bought as (optional)** and **Notes**.
4. Save, then open it to set its shifts, values and tools.

## Good to know
- An inactive machine is left out of timing.
- A machine with no shifts cannot be planned on.
- **Classification** opens the machine family tree.
- **New machine** needs the Maintenance permission; **Request a new machine** needs Maintenance or production manage.

## Related
- [A machine's life](help:maintenance-machine-life)
- [Check-in / out](help:stores-check-in-out)
- [Buying a new machine](help:maintenance-new-machine)
- [A machine](help:maintenance-machine)
- [Machine types](help:maintenance-machine-types)
- [Maintenance — the machines board](help:maintenance-board)
