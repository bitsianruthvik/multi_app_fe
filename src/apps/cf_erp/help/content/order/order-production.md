---
id: order-production
title: Production (on the order)
area: order
roles: [production, design, management]
routes: ["/:company/cf_erp/orders/:id"]
tab: production
order: 80
---
The Production step holds the times of every operation, then the production orders made from the saved execution plan. Releasing a production order puts its steps on the shop floor. It needs a confirmed order and a frozen design; the steps then wait for their material.

## What you see
- **Times**: setup and operation time per piece, filled in by the formulas. Pick the **Line** to see it. Type over a box to change one time.
- **Override all times to (s)**: for testing only. Every setup and operation time on this order becomes that many seconds; leave it blank to go back to the formulas.
- **Production orders**: *Split by AI from the saved execution plan.* Each row shows the production order, its status (for example *Yet to plan*, *Planned*, *Dispatch*, *Closed*) and its buttons.

## How to put the order on the floor
1. Check the times. Change a box only where you know better than the formula.
2. Click **Create the production order** (or **Create N production orders**). The hover text lists what will be made, or why it cannot be made yet.
3. On each row click **Release**, or **Release all (N)** when there are several.
4. The planner and the machine log take it from here.
5. When a production order is finished, **Dispatch** ships it from here.

## Good to know
- Release asks every made row for a flow. If a row has none, give it one on Structure & values (pick it, then **Save**) — this is allowed on a frozen line until release.
- **Take back** undoes a release while nothing has started.
- A customer order is confirmed only by an approved Customer acceptance; until then the stage says so and offers **Go to Customer acceptance**.
- A line whose cut plates have no plate yet waits for Nesting.
- Seeing this step needs the production permission; releasing and dispatching need their own.

## Related
- [Execution plan](help:order-execution-plan)
- [Freeze design](help:order-lock)
- [Customer acceptance](help:order-acceptance)
