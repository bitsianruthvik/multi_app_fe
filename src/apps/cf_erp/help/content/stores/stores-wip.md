---
id: stores-wip
title: Work in progress
area: stores
roles: [stores, production, accounts, management]
routes: ["/:company/cf_erp/wip"]
order: 30
---
The production ledger: every piece being made is stock here, at the level it has reached. It moves up when the next step starts (cut plate → part → girder) and comes back down when it is taken apart. Stores and Accounts use it to see the material sitting on the floor and its value.

## What you see
- Figures: **Lots** (separate lots of production stock), **Pieces** (at every level), **Value** (material only; lots with no cost are left out) and **Offcuts** with their weight and value.
- One card per order line ("SO… · line 2"), with how many lots and how much material they hold.
- Each lot: its code, the item, the level it has reached, **Quantity** and value. A lot that holds other pieces right now opens with its arrow to show what is inside.
- A line under the figures links to **Offcuts** when cut plates left any.

## How to find something
1. Pick an **Order** to see only its lines.
2. Or type in **Search lot, item or piece code**.
3. Clear both to see everything.

## Good to know
- Pieces appear as soon as an order is released and its first step starts.
- Nothing is posted by hand here; the steps recorded on the floor and in the Tracker move the stock.
- The value is material only — labour is not in it.

## Related
- [Offcuts](help:stores-offcuts)
- [Tracker](help:production-tracker)
- [Stock](help:stores-stock)
