---
id: order-values
title: Values for the whole order
area: order
roles: [design, sales]
routes: ["/:company/cf_erp/orders/:id"]
tab: structure
order: 22
---
Some values are the same for the whole order: the number of coats, the steel grade, the impact class (BO or BR), metallising. You set them once and every row that has them takes them. They open on **Structure & values** under **Values for the whole order**. The Values stage has no tab of its own: it is a check on Structure & values, and Freeze design waits for it.

## What you see
- One row per value your setup allows for a whole order (Setup › Specifications, "Can be set for a whole order"). Each shows its name and code.
- A **Whole order** field, then one field per line: **Line 1**, **Line 2**… An empty line field says *As the order (…)*.
- Under each line field: how many of its rows use the value, *No row of this line has it*, or *Locked* for a frozen line.

## How to set them
1. On **Structure & values**, click **Values for the whole order**.
2. Pick or type the **Whole order** value, for example impact class *BR*. A typed number is saved when you press Enter or leave the field.
3. If one line differs, set that line's field.
4. A message says how many rows changed. The line badges (*20 values missing*) update.

## Which value wins
A row's own value always wins, then the line's, then the order's. In the grid a cell that takes the order's value carries a small **O** (a line's value, **L**); a row's own value typed over it shows **✎**, and clicking that mark takes the row back to the order's value. Emptying a row's own value gives it the order's value again.

## The Values check
- Every required value must be filled before a line's design can be frozen. The line badge and **Next missing** show what is left.
- A standard drawing may not carry every value your setup asks for (for example weld sizes or surface area). Fill those in the grid.
- Cut pieces for plate parts are made by the system as soon as their thickness, size and grade are filled.

## Good to know
- The same values can be set in the **New order** dialog when the order is made.
- A frozen line keeps the values it was frozen with. A change then needs a revision.
- If nothing can be set for a whole order, the panel says so: turn it on for a specification in Setup › Specifications.

## Related
- [Structure & values](help:order-structure)
- [New order](help:sales-new-order)
- [Freeze design](help:order-lock)
