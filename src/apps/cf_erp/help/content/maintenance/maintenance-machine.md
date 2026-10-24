---
id: maintenance-machine
title: A machine — shifts, tools and spares
area: maintenance
roles: [maintenance, production, admin]
routes: ["/:company/cf_erp/machines/:id"]
order: 51
---
One machine: what it carries, what it can do, when it works, the tools and spares it needs, and its history.

## What you see
- Facts: **Machine type**, **Serial**, **Can do** (the operation codes), **Bought as**, **Updated**.
- Tabs:
  - **Specifications** — what its type says it must carry, and its own values (timing formulas read them). **Rules on this machine only** is rarely needed.
  - **Charts** — lookup tables for this machine.
  - **Operations** — **What it can do**: each operation, **Can do it** (or **Kept out**), where it is **Set on**, **Setup per run** and **Work per piece**.
  - **Shifts** — its weekly shifts, **The next two weeks** as they will run, and **Day exceptions**.
  - **Tools & spares** — the tools, spares and consumables it needs.
  - **History** — every change to a value.

## How to set shifts
1. On **Shifts** click **Add shift**: **Name** (Day, Night…), the days, **Start**, **End** (end before start runs past midnight), **Break (min)**, **Valid from** / **Valid to**. Click **Add shift**.
2. Or **Copy from…** another machine.
3. For one day, click **Change a day**: pick the **Date**, then **Not working** (what stops) or **Extra time**.

## How to keep its tools and spares list
1. Open **Tools & spares**.
2. Per row pick the kind (**Tool**, **Spare**, **Consumable**), the item, a typical quantity and a note. Tick **Search the whole catalog** to find any item.
3. Enter in the last field adds a line; **Save list** (Ctrl+Enter) saves it.
4. Maintenance orders start their material requests from this list.

## Good to know
- A machine with no shifts cannot be planned on. Planned downtime and open faults come off its shifts.
- **Edit** and the bin (delete — its own values and rules go with it) are at the top.
- The **Tools & spares** list can be changed with the Maintenance permission or production manage. Everything else here (the machine, its shifts, its values) needs production manage.

## Related
- [Machines](help:maintenance-machines)
- [Planned downtime](help:maintenance-downtime)
- [A maintenance order](help:maintenance-order)
