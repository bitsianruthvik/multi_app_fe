---
id: order-execution-plan
title: Execution plan
area: order
roles: [design, production, sales]
routes: ["/:company/cf_erp/orders/:id"]
tab: execution_plan
order: 30
---
The execution plan says how the order is made and shipped: how many production orders, and how the girders go out in dispatch units. It is set for the whole order (a line may differ) before the design is frozen, and the freeze fixes it. The design or planning engineer saves it.

## What you see
- **Nothing to choose**: when every choice gives the same result, the step is one sentence, for example *1 production order, ships as 1 dispatch unit — nothing to choose for this order.* This happens with one line of quantity 1 and no sub-assembly of which a unit holds more than one. The step is done by itself and nothing needs saving. Click **Change** to open the whole plan.
- **Start from:** ready-made plans, when your company has them.
- **Production orders**: each choice says what it makes, for example **Whole order — 1 production order**, **Per line — 2 production orders**, **Per unit — 3 production orders (one per unit)** or **Per sub-assembly: Girder line — 8 production orders (each Girder line + the rest)**. Hover a choice for its meaning.
- **Dispatch**: the same, in dispatch units, for example **Same as production orders — 2 dispatch units** or **Per unit — 3 dispatch units (one per unit)**. A dispatch unit is never bigger than a production order.
- A choice that gives the same as a simpler one is left out, and a small note under the bar names it, for example *Per unit gives the same here (every line is 1 unit).* The choice you made or saved always shows.
- A table per line (**Line**, **Sells**, **Production orders**, **Dispatch**, **Makes**), only when the order has more than one line. A line can choose differently from **As the order**, which says what it gives, for example *As the order: Per line — 1 production order*. A line taken from stock says *Taken from stock*.
- A sentence saying what the plan makes, and the **Production orders** and **Dispatch units** preview lists.
- At the foot: *Not saved yet — the default is shown. Check it and save.* or *Saved by … on …*, with **Undo changes** and **Save the plan**.

## How to save the plan
1. Open **Execution plan**.
2. Read the choices and the preview. The default is one production order per line.
3. Pick the choice that makes what the job needs, for the order or for one line.
4. If a warning box lists problems, fix them first. **Save the plan** waits for them.
5. Click **Save the plan**. The button then says **Saved**.

## Good to know
- Freeze design waits until the plan is saved, even if you kept the default. When there is nothing to choose, it does not wait.
- If the order later gets a second line or a sub-assembly that makes a difference, the plan asks to be saved again.
- Once a line is frozen its plan is fixed (a lock icon shows). A change then needs a revision of the order.
- The plan picks its levels from the structure, so draw the structure first.
- On Production, the production orders are made from this plan (the default one when there is nothing to choose).
- Full screen is available from the button at the top right.

## Related
- [Structure & values](help:order-structure)
- [Freeze design](help:order-lock)
- [Production](help:order-production)
