---
id: order-execution-plan
title: Execution plan
area: order
roles: [design, production, sales]
routes: ["/:company/cf_erp/orders/:id"]
tab: execution_plan
order: 30
---
The execution plan says how the order is made and shipped: how many production orders, what goes in each, and how the girders go out. It is set before the design is frozen, and the freeze fixes it. The design or planning engineer saves it.

## What you see
- **Nothing to choose**: when every choice gives the same result, the step is one sentence, for example *1 production order, ships as 1 dispatch unit — nothing to choose for this order.* The step is done by itself and nothing needs saving. Click **Change** to open the whole plan.
- **How should the production orders be made?** Three cards, each saying what it makes:
  - **All at once** — one production order for the whole order. Not shown when the order has one line (it would be the same as One per line).
  - **One per line** — each line is one production order. The usual choice.
  - **Split into batches** — break a line into smaller production orders, of any sizes you like.
- **Split by:** after Split into batches, choose what a piece is: **Each Bridge span** (each unit of a line) or a level by its own name, for example **Each Girder line**.
- **The pieces of each line**, as small tags in order (for example *Bridge span 1 · Girder line 3*). Each piece is its own production order until you put it in a batch. A batch is one production order. A tag in a batch shows the batch number and the batch colour.
- Under the tags, each batch in words, for example **Batch 1 — 4 Girder lines: …**, and what is left over, for example *8 left over — each becomes its own production order.*
- What is not inside a piece (loose items and the final assembly of a span) stays one production order per span.
- A sentence saying what the plan makes, and the **Production orders** list.
- **Shipping** (folded): one choice, **Ship as**, for example **Same as production orders**. A shipment is never bigger than a production order; a choice that would be says so under the box.
- **A line made differently** (folded, only with more than one line): a line can choose its own way instead of **Same as the whole order**. A line taken from stock says *Taken from stock*.
- At the foot: *Not saved yet — the default is shown. Check it and save.* or *Saved by … on …*, with **Undo changes** and **Save the plan**.

## How to make batches
1. Click **Split into batches**, then choose what to split by (for example **Each Girder line**).
2. In **Batch sizes**, type the sizes, for example `4, 8`: the first 4 pieces go in batch 1, the next 8 in batch 2. Sizes need not add up: what is left over stays one production order each, and **Put them in one batch** makes it one more batch.
3. Or type a number next to **or equal batches of** and click **Make batches**: 12 pieces in batches of 5 gives 5, 5 and 2.
4. To mix rows, click a tag: it moves to the next batch (from the last batch it starts a new one, then goes back on its own). The sizes follow.
5. **Clear** takes every piece out of its batch.

## How to save the plan
1. Open **Execution plan**.
2. Choose a card (and the batches, when you split). The preview shows what the order will make.
3. If a warning box lists problems, fix them first. **Save the plan** waits for them.
4. Click **Save the plan**. The button then says **Saved**.

## Good to know
- Freeze design waits until the plan is saved, even if you kept the default. When there is nothing to choose, it does not wait.
- Choosing another way to split clears the batches, because they were made of the old pieces.
- A batch holds pieces of one line only.
- Once a line is frozen its plan is fixed (a lock icon shows). A change then needs a revision of the order. A revision takes the plan with it, but not the batches: make them again on the revision.
- The plan picks its levels from the structure, so draw the structure first.
- On Production, the production orders are made from this plan: a batch becomes one production order named after its first pieces, for example *Batch 1: Girder line 1, Girder line 2 (+2 more)*.
- Full screen is available from the button at the top right.

## Related
- [Structure & values](help:order-structure)
- [Freeze design](help:order-lock)
- [Production](help:order-production)
