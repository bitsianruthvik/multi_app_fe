---
id: order-execution-plan
title: Execution plan
area: order
roles: [design, production, sales]
routes: ["/:company/cf_erp/orders/:id"]
tab: execution_plan
order: 30
---
The execution plan says how the order is split into production orders. It is set before the design is frozen, and the freeze fixes it. The design or planning engineer chooses it.

## What you see
- **Nothing to choose**: when every choice gives the same result, the step is one sentence, for example *1 production order, ships as 1 dispatch unit — nothing to choose for this order.* Click **Change** to open it.
- Four cards, each saying how many production orders it makes. The **i** on each card says what it does.
  - **Entire order** — one production order for everything.
  - **Per line** — one for each line. The usual choice.
  - **Per qty** — one for each unit of a line (a line of 3 spans makes 3).
  - **Custom** — you pick rows of the BOM and make production orders of them.
- **Makes N production orders**, and **Show the list** for their names.
- **More options** (not on Custom): **Ship as**. A shipment is never bigger than a production order.

A click on a card saves it at once. When nothing was saved yet, **Save the plan** keeps the default as it is.

## Custom
1. Click **Custom**. The whole BOM of every line is shown as a tree; open a row with its arrow.
2. Tick rows. A row takes everything under it that is not in another production order yet, so its own rows are ticked with it.
3. Click **Create production order**. A chip (**PO 1 · 2 rows**) appears above the BOM, and those rows leave the BOM: it shows only what is not in a production order yet.
4. Click a chip to see its rows in the BOM again, in the chip's colour. Click it again to hide them. **×** on a chip removes it; its rows come back.
5. Whatever nobody picks is one more production order per line — the dashed chip (**The rest**, or **Rest of line 2**). Tick a line's own top row to put everything left of it in one production order.

## Good to know
- Freeze design waits until the plan is saved, even if you kept the default. When there is nothing to choose, it does not wait.
- Leaving Custom for another card drops the production orders picked there; you are asked first.
- Once a line is frozen its plan is fixed (a lock icon shows). A change then needs a revision of the order.
- A plan saved earlier as *one per sub-assembly* (for example per Girder line) still works; it is named under the cards. Pick a card to change it.
- On Production, the production orders are made from this plan; a custom one is named after its first rows.
- Full screen is available from the button at the top right.

## Related
- [Structure & values](help:order-structure)
- [Freeze design](help:order-lock)
- [Production](help:order-production)
