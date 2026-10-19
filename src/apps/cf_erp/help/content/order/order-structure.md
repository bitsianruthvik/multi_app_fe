---
id: order-structure
title: Structure & values
area: order
roles: [design, sales]
routes: ["/:company/cf_erp/orders/:id"]
tab: structure
order: 20
---
The first step of every order. It shows the whole order in one view: each line, what it is made of (its BOM) and the values beside each row. Design fills it; sales adds the lines and prices.

## What you see
- **Add line** and the full-screen button at the top. With several lines, buttons open or fold every line.
- **Values for the whole order**: coats, grade, impact class… set once, every line takes them. See [Values](help:order-values).
- One group per line: *Line 1*, what it sells, the quantity and the rate, *From template …* or *From standard …*, and badges such as **47 rows**, **3 to choose**, **20 values missing** or **Frozen**. On the right: move up / down, the standard drawing button, **Change quantity, date or price** and **Remove the line**.
- Inside each line, its grid: every row with its values. Amber cells are required and still empty.
- At the foot: the order total, with GST once it can be worked out, and *Not the whole order:* when a line has no rate or no weight yet.

## How to fill the values
1. Open the line. Click **Next missing** to jump to the first empty required cell.
2. Type the value. An arrow, Enter or Tab keeps it and moves on.
3. Switch on **Only what's missing** to see only the gaps.
4. Click **Save N changes** in the bar at the bottom, or press **Ctrl+S**. **Check** runs the save and takes it back, so you see every problem first. **Cancel** throws your typing away.

## How to change the BOM
- **Add line** inside a line's grid adds a row. The **⋯** menu on a row offers **Add a line inside**, **Choose item** (for a *to choose* row) and **Edit line details**.
- Copy a row below it, remove a row, or drag rows to rearrange. All of it waits for **Save**.
- A section part shows its section. Click it to choose the stock bar it is cut from (type a size like *75 x 75 x 8*).
- Click **no flow** under a row's name to choose how it is made.
- **Download** / **Upload** (or **Download Excel** / **Upload Excel**) work on the grid in Excel.

## Good to know
- Unsaved edits are never lost by a click. Leaving the line, the tab or the page asks **Save before you go?** with **Save**, **Discard** or **Stay**.
- Full screen fills the window; **Esc** brings it back. Your unsaved edits stay.
- A line tied to a standard drawing whose BOM you changed shows **Update the standard too (new version)** or **Keep the standard as it is**.
- **Save line N as a standard drawing** at the foot keeps a finished line for the next order.
- A frozen line no longer changes, except that a row with no flow may still be given one until release.

## Related
- [Add a line](help:order-add-line)
- [Values for the whole order](help:order-values)
- [Execution plan](help:order-execution-plan)
- [Freeze design](help:order-lock)
