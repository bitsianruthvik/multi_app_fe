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
- **Start from:** ready-made plans, when your company has them.
- A sentence saying what the plan makes, for example *1 production order, one per line*, and one for dispatch.
- **Production orders**: **Whole order**, **Per line** (the usual choice), **Per unit** (one per span of a line of 3) or **Per sub-assembly** (one per sub-assembly of a BOM level, such as each girder, and one for the rest of each unit). Hover a choice for its meaning.
- **Dispatch**: **Same as production orders**, **Per line**, **Per unit** or **Per sub-assembly**. A dispatch unit is never bigger than a production order.
- A table per line (**Line**, **Sells**, **Production orders**, **Dispatch**, **Makes**), where one line can choose differently from **As the order**. A line taken from stock says *Taken from stock*.
- **Production orders** and **Dispatch units**: the preview lists.
- At the foot: *Not saved yet — the default is shown. Check it and save.* or *Saved by … on …*, with **Undo changes** and **Save the plan**.

## How to save the plan
1. Open **Execution plan**.
2. Read the sentence and the preview. The default is one production order per line.
3. Change **Production orders** or **Dispatch** if the job needs it, for the order or for one line.
4. If a warning box lists problems, fix them first. **Save the plan** waits for them.
5. Click **Save the plan**. The button then says **Saved**.

## Good to know
- Freeze design is refused until the plan is saved, even if you kept the default. It is one click.
- Once a line is frozen its plan is fixed (a lock icon shows). A change then needs a revision of the order.
- The plan picks its levels from the structure, so draw the structure first.
- On Production, the production orders are made from this saved plan.
- Full screen is available from the button at the top right.

## Related
- [Structure & values](help:order-structure)
- [Freeze design](help:order-lock)
- [Production](help:order-production)
