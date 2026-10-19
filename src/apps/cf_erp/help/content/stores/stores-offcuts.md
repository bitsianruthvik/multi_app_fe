---
id: stores-offcuts
title: Offcuts
area: stores
roles: [stores, production, design, accounts]
routes: ["/:company/cf_erp/offcuts"]
order: 40
---
What is left of a cut plate or a cut bar, kept as stock so the next nest can use it. A plate offcut shows the drawing of its shape; a bar shows its length.

## What you see
- Columns: **Shape**, **Offcut** number, **Kind** (plate or bar), **Steel** (thickness and grade), **Weight**, **Value**, **Size** (the clean rectangle), **From** (the order and nest it came from) and **Status**.
- Status chips: **Available**, **Planned**, **Used**, **Scrapped**, **Returned**, **All**.
- Kind chips: **All kinds**, **Plates**, **Bars**; boxes for **Thickness mm** and **Grade e.g. E350**.

## What each status means
- **Planned** — its nest is accepted but the plate is not cut yet.
- **Available** — cut, in stock and usable.
- **Used** — used in another nest.
- **Scrapped** — written off.
- **Returned** — returned to the customer.

## How to look at one offcut
1. Click a row.
2. The dialog shows the outline, **Status**, **Steel**, **Material**, **Weight**, **Value**, **Area**, **Kind**, **Clean rectangle** (or **Length** for a bar), **Bounding box**, **Item**, **Order**, **Nest** and **Batch** ("Not cut yet" while planned).

## Good to know
- Offcuts appear by themselves when a nested plate or bar is cut. You do not add them by hand.
- After cutting they sit in the WIP area beside the machine; their value is credited on the order's costing.
- To look for a usable remnant before nesting, filter **Available**, then type the thickness and grade.

## Related
- [Work in progress](help:stores-wip)
- [Stock](help:stores-stock)
