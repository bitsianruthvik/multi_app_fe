---
id: order-lock
title: Freeze design
area: order
roles: [design, management]
routes: ["/:company/cf_erp/orders/:id"]
tab: lock
order: 40
---
Freezing the design rolls a line's structure out into pieces and gives each piece its own code. After that the structure, values and cut pieces no longer change; a change means a new revision of the order. Nesting, buying and production all work from the frozen pieces. It is done one line at a time by the design engineer.

## What you see
- **Freeze the design of line N** and the **Freeze the design** button.
- A sentence such as *336 pieces will be written — 177 numbered one by one, 159 groups of identical parts.*
- A checklist, each item with a tick or what is wrong and a link to the step that fixes it:
  - **Every required value is filled**
  - **The execution plan is saved**
  - **The structure rolls out into pieces** (every row has its item chosen)
  - **Every part says how it is cut**, **Every section part has its bar and length**, **Every plate part has its cut piece**
  - **Every made part says how it is made** (a heads-up only, see below)
  - **Every piece gets a code of its own**
- **The BOM freezing will build**: **Show the full BOM** and **Download** (Excel workbook or CSV).

## How to freeze a line
1. Pick the line in **Working on**.
2. Work down the checklist. Use the links to fill values, save the execution plan or choose items and sections.
3. When nothing is in the way, click **Freeze the design**.
4. Read the confirm box: each piece gets its code now, the structure stops changing, nesting picks the plates next, and a change after this means a revision. Click **Freeze the design**.
5. The page shows *Frozen (date) by (name) · N pieces coded*, and the order header shows **Revise**.

## Rows with no flow
If made rows have no flow, freezing is not held up, but release will ask for one later. Click **Give them a flow**, tick the rows, pick the flow and click **Give N rows (flow)**. A row made another way can be unticked and given its own flow on Structure & values. A row with no flow can still get one after the freeze, until release.

## Good to know
- Freezing does not need the plates: nesting chooses them afterwards.
- Cut pieces are made by the system from the parts and values. If one cannot be made, the checklist says why.
- A line released before it was frozen must have its release taken back first.
- Freezing needs the orders permission.

## Related
- [Values for the whole order](help:order-values)
- [Execution plan](help:order-execution-plan)
- [Nesting](help:order-nesting)
- [The order page (Revise)](help:order-page)
