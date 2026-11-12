---
id: order-production
title: Production setup (on the order)
area: order
roles: [production, design, management]
routes: ["/:company/cf_erp/orders/:id"]
tab: production
order: 80
---
Production setup is where the order's production orders get their times. The production orders are made from the execution plan as soon as it is saved — this step does not wait for the freeze, the nesting or the customer. When the times are checked, send them to planning; Planning releases them to the floor.

## What you see
- **Production orders**: each row shows its code, what it holds and its state — **Setting times**, **Planning**, **Released**, **In production**, **Dispatch** or **Closed**.
- **Send to planning** on a row (or **Send all to planning (N)**), **Back to times** on one in planning, and **Open in Planning**.
- **Times**: setup and operation time per piece, filled in by the formulas. Pick the **Line** to see it. Type over a box to change one time.
- **Override all times to (s)**: for testing only. Every setup and operation time on this order becomes that many seconds; leave it blank to go back to the formulas.
- The **i** buttons explain each part.

## How to set up production
1. Save the [execution plan](help:order-execution-plan). Its production orders appear here as **Setting times**.
2. Check the times. Change a box only where you know better than the formula.
3. Click **Send to planning** on each production order, or **Send all to planning**. They move to **Planning**.
4. In Planning › Production orders, a production order in planning is released once the order is confirmed (the customer and the MD accepted it), the design is frozen and the line is nested.

## Good to know
- Changing the execution plan remakes the production orders that are still setting their times. One already in planning or released stops the change: send it back to times first.
- Release refuses a made row with no flow. Those rows are listed at the top of **Production orders** with **Give them a flow** per line.
- A production order's nesting is frozen only once it is released.
- Times are fixed once a line is released: they are on its steps then.
- The 3D view of the order's progress is on Production › Tracker › **3D**.

## Related
- [Execution plan](help:order-execution-plan)
- [Production orders](help:production-orders)
- [Tracker](help:production-tracker)
