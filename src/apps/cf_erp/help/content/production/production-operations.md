---
id: production-operations
title: Operations
area: production
roles: [production, design, admin]
routes: ["/:company/cf_erp/operations"]
order: 70
---
The kinds of work the shop does — cut, drill, fit up, weld, blast, paint. Each operation says which machine type does it and how long it takes. Flows put operations in order. The production engineer sets these up once; the planner and the order's times read them.

## What you see
- Figures, each a filter: **Operations**, **No machine type yet** (no timing rule, so nothing can be timed), **No time yet** (a machine type but no time per quantity) and **In no flow** (not a step anywhere).
- Chips: **All**, **No machine type yet**, **No time yet**, **In no flow**, **Inactive**.
- Columns: **Code**, **Name**, **Machine type**, **Setup time**, **Time per quantity**, **Used in flows**, **Status**; hidden: **Description**.
- The machine type and the two times can be edited right in the row. An operation with several rules shows its main one and "+N more rules", which opens its page's **Advanced** section.

## How to add an operation
1. Click **New operation**.
2. Type the **Code** and **Name** (and a **Description**), click **Create**.
3. In its row (or on its page) pick the **Machine type** and set **Setup time** and **Time per quantity**.
4. Add it to a flow on the Flows screen.

## Good to know
- Setup and operation time are both per quantity.
- An operation with no machine type, or no time, makes its steps impossible to plan — fix the rows the warning chips show.
- An order can override all its times (for example 0.1 s for a trial); that is set on the order's Production step, not here.
- Changing operations needs the production manage permission.

## Related
- [An operation](help:production-operation)
- [Flows](help:production-flows)
