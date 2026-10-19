---
id: production-operation
title: An operation — machines and times
area: production
roles: [production, design, admin]
routes: ["/:company/cf_erp/operations/:id"]
order: 71
---
One operation: its name, code, status, its main machine type and times, the flows it is used in, and — under **Advanced** — every timing rule per machine type or machine.

## What you see
- The name (click it to rename; Enter saves, Esc drops it), **Code**, **Status** (**Active** or **Inactive**).
- The simple card: **Machine type**, **Setup time**, **Time per quantity**, and **Used in flows**.
- **How long?** — pick a **Machine**, an **Item** and **Pieces**, then **Work it out** to see the time the rules give. Nothing is saved.
- **Advanced** (click to open): **Which machines, and how long** — rules per machine type (any level) or per machine, with **Can do it** (or **Kept out**), **Time per piece**, **Setup per run** and **Valid**; and **Machines it reaches today**.

## How to change the times
1. Click the **Machine type**, **Setup time** or **Time per quantity** on the simple card (or **Set time** / **Edit time** in Advanced). The time builder takes a fixed time or a formula fed by the item's and machine's values.
2. For a machine type that needs different times, open **Advanced** and click **Add rule**. The most specific rule valid on the day applies.
3. The bin on a rule deletes it; machines under it fall back to the next rule up.

## Good to know
- **Edit** changes the code and description. The bin deletes the operation, but it is refused while it is a step of a flow or a wait rule waits for it — mark it **Inactive** instead.
- Changing it needs the production manage permission.

## Related
- [Operations](help:production-operations)
- [Machines](help:maintenance-machines)
