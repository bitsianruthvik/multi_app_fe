---
id: maintenance-machine-types
title: Machine types
area: maintenance
roles: [maintenance, production, admin]
routes: ["/:company/cf_erp/machine-types/:id"]
order: 52
---
A machine type is the deepest level of a machine family (for example Cutting › Plasma › CNC plasma cutter). It says what every machine of the type must carry, holds the charts they share, and is what the planner counts capacity by.

## What you see
- The type's code, name and status; **Path** (family › subfamily › type), **Machines** and **Charts**.
- Tabs: **Specifications** — the values every machine of the type must carry; **Charts** — lookup tables they share; **Machines** — **Machines of this type**, including the types below it.

## How to add a machine type
1. On Machines, click **Machine types**.
2. Under **Add a machine type** pick the **Family** (Cutting, Welding…) and **Subfamily** — or start a new family with **New family code** / **New family name** and a new subfamily.
3. Type the **Type code** (a machine's code is numbered from it — PLS-01), **Type name** and **Description**, and add it.
4. Open the type and add its specifications.

## Good to know
- Put timing rules and specifications on the type, not on each machine, so every similar machine shares them.
- Specifications on a type need the setup manage permission; charts the production manage permission.

## Related
- [Machines](help:maintenance-machines)
- [An operation](help:production-operation)
