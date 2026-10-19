---
id: stores-areas
title: Stocking areas
area: stores
roles: [stores, production, admin]
routes: ["/:company/cf_erp/stocking-areas"]
order: 70
---
Every place that holds stock — a yard, a store, the WIP beside a machine, an inspection hold. Each one has its own inventory, and its purpose decides how its stock counts.

## The purposes
- **Storage** — stock here is available to use. Goods coming in — GRNs, **Receive stock**, customer material — go into a storage area (or quarantine).
- **Work in process** — stock being worked on, beside a machine or in a bay. Cutting takes plates from storage or WIP.
- **Quarantine** — stock held: not issued until it is moved back to storage. A receipt may go here to be inspected.
- **Dispatch** — finished and waiting to leave.
- **Scrap** — scrap kept until it is sold or sent back.

## What you see
- Figures: **Areas**, **Holding stock**, **Quarantine**.
- Purpose chips: **All**, **Storage**, **Work in process**, **Quarantine**, **Dispatch**, **Scrap**. Search **code, name or machine**.
- Columns: **Code**, **Name**, **Counts as**, **Machine**, **Items**, **Status**; hidden: **Stock lines**.

## How to add an area
1. Click **New area**.
2. Type the **Code** (for example RM-YARD) and **Name**.
3. Pick **Its stock counts as** — the help line under it explains the choice.
4. Optionally pick **Beside machine** for a WIP area at one machine.
5. Leave **Status** active, add **Notes**, and save.

## Good to know
- Start with where material arrives: a raw material store with the Storage purpose. Without one, a GRN or a receipt has nowhere to go ("No storage area to receive into").
- Nothing is received straight into a work-in-process, dispatch or scrap area — it is refused, naming the area and its purpose. Receive into storage, then **Transfer**.
- Nothing goes into an inactive area; stock can still leave it.
- Making areas needs the inventory manage permission.

## Related
- [A stocking area](help:stores-area)
- [Receive against PO (GRN)](help:purchase-receive)
