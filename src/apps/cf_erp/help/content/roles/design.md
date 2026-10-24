---
id: design
title: Getting started in design and planning
area: roles
roles: [design]
routes: []
order: 20
---
This guide is for the design and planning engineer. Sales creates the order and its lines; you turn each line into a frozen, nested design that Stores can buy for and production can make. Each step links to the page that explains it in full.

## Your day
1. Open **Sales › Orders** and pick the **Inquiry** chip, or open **Home › Waiting on you**.
2. Open an order. It lands on the first stage that still needs work, marked on the tabs.
3. Work the stages left to right. **Next: …** at the foot of each stage moves you on; **Skip for now: …** leaves an unfinished stage for later.

## 1. Structure & values
Every line is a group on this tab, with its BOM rows and their values beside them. Amber cells are required and empty.
- Open **Values for the whole order** first and check coats, grade and impact class (BO or BR). Every row takes them. See [Values for the whole order](help:order-values).
- In each line, click **Next missing** and type the values. A standard drawing may not carry every value (weld sizes, surface areas, segment lengths): fill them here.
- Rows marked **to choose** need their item: **⋯ › Choose item**. Section parts need their stock bar: click the section cell and type a size like *150 x 150 x 15*.
- Give every made row a flow (click **no flow** under its name).
- Press **Ctrl+S** or click **Save N changes**. **Check** shows every problem without saving. Use full screen for long grids; your edits stay when you leave it, and leaving the line asks **Save before you go?**.
- If you changed a line copied from a standard, choose **Update the standard too (new version)** or **Keep the standard as it is**.
See [Structure & values](help:order-structure).

## 2. Execution plan
Check how the order is split into production orders (**Per line** is usual; **Per unit** gives one per span) and dispatch units. Each choice says what it makes. Click **Save the plan**, even for the default: the freeze waits for it. When the step says *nothing to choose for this order*, there is nothing to save. See [Execution plan](help:order-execution-plan).

## 3. Freeze design
Pick the line in **Working on**. Work through the checklist until nothing is in the way. If made rows have no flow, **Give them a flow** now; otherwise release will ask later. Click **Freeze the design** and confirm. Every piece now has its code. A later change needs **Revise**. See [Freeze design](help:order-lock).

## 4. Nesting
For each line:
- Check the **Cutting allowance** tab before freezing if the customer wants parts cut long. See [Cutting allowance](help:order-allowance).
- With the customer's ProNest files, click **Upload nesting files** and save. Then look at **Compare with AI**: if AI's plates use less steel, **Make AI's nesting the main one**.
- Without files, click **Nest by AI**, pick the effort (Quick to Long) and the plates, and **Start nesting**. Read the proposal and click **Use this nesting**.
- Lay the sections out on bars: **Propose**, then **Accept**.
- Pieces with no plate long enough: leave them out and **Mark the rest as cut from offcuts**, or have the plate added to the catalog.
- Watch the grade and impact class check. BO and BR do not stand in for each other.
See [Nesting](help:order-nesting) and [Compare with AI](help:order-nesting-compare).

## 5. Hand over
- Tell sales the line is nested: they raise and share the MR and send the customer acceptance. See [Material request](help:order-buying).
- Once Management approves, the order is confirmed. On **Production**, check the times, click **Create the production order** and **Release**. See [Production](help:order-production).
- If release refuses a row with no flow, give it one on Structure & values and **Save**: this is allowed on a frozen line until release.

## Things to remember
- **This layout is out of date** on Nesting means the structure changed after nesting. Use **More › Start again**.
- Save a finished line as a standard drawing so the next order starts from it. See [Standard drawings](help:sales-standard-drawings).

## Related
- [The order page](help:order-page)
- [Add a line](help:order-add-line)
- [Getting started in sales](help:sales)
