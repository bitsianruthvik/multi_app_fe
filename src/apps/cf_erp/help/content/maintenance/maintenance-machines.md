---
id: maintenance-machines
title: Machines (the register)
area: maintenance
roles: [maintenance, production, admin]
routes: ["/:company/cf_erp/machines"]
order: 50
---
The register of machines — what does the work. It is **Production › Machines**, and the same page is **Maintenance › Machine register**. A machine's type decides what it must carry (a plasma cutter its cutting speed), and the operation rules turn those values into times. Maintenance, planning and the machine log all read this list.

## What you see
- Figures: **Production machines** (or **All machines**), **Active**, and **Machine types** (click to manage them).
- Chips: **Production machines** (machines that can run an operation) or **All machines** (the whole asset register); **Any status**, **Active**, **Inactive**; a **Machine type or group** picker; search.
- Columns: **Code**, **Name**, **Machine type** (click to open the type), **Serial**, **Status**; hidden: **Bought as**, **Production** ("Yes", or "Asset" for a machine with no operation to run).

## How to add a machine
1. Make sure its type exists — **Machine types** at the top.
2. Click **New machine**.
3. Pick the **Machine type**, type the **Name**, leave **Code** empty to number it by the coding rule, add the **Serial number**, **Bought as (optional)** and **Notes**.
4. Save, then open it to set its shifts, values and tools.

## Good to know
- An inactive machine is left out of timing.
- A machine with no shifts cannot be planned on.
- **Classification** opens the machine family tree.
- Adding and changing machines needs the production manage permission.

## Related
- [A machine](help:maintenance-machine)
- [Machine types](help:maintenance-machine-types)
- [Maintenance — the machines board](help:maintenance-board)
