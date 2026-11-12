---
id: maintenance-machine-life
title: A machine's life — setup, live, condemned
area: maintenance
roles: [maintenance, stores, production, accounts, management, admin]
routes: ["/:company/cf_erp/machines/:id"]
order: 52
---
Every machine, and every durable tool, moves through four stages: **Received → Setup → Live → Condemned**. The bar under a machine's name shows where it is. Its **Life** tab shows where it is, who has it, what it cost and which orders used it. Its **Log** tab lists everything that happened to it.

## The stages
- **Setup** — it has been received and registered. Maintenance sets it up on a **setup ticket** (a maintenance order). It is not planned on and cannot be checked out.
- **Live** — the setup ticket is closed. It is planned on, can be checked out, and starts depreciating that day.
- **Condemn asked** — Maintenance asked to condemn it, and the MD decides in Approvals. If the MD sends it back, it returns to the stage it was in.
- **Condemned** — the MD approved. It leaves planning and check-out for good. Its disposal is recorded next.

## How it gets on the register
1. Stores books the GRN of a machine (or a durable tool) as usual.
2. The **Register** dialog opens at once. For each unit, enter its name, **Serial number**, **Code** (or leave it empty to number it automatically) and **Machine type**. Optionally enter its **Life (years)** and **Salvage value**.
3. **Needs setup by Maintenance** is ticked for a machine. Leave it ticked and a setup ticket goes to Maintenance. Untick it for a tool that is ready to use, and the tool goes live at once.
4. Registering takes the units out of stock: they are assets now, not material.
5. Not registered yet? It waits under **Stores › Check-in / out › To register**, and on Home as *Machines to register*.

## Setting it up
1. Open the setup ticket (the **Setup ticket** button on the machine, or Maintenance orders).
2. Raise an MR on the ticket for what it needs: cables, foundation bolts, consumables.
3. Move it between the store and a **maintenance bay** with **Move** while you work on it. A maintenance bay is a stocking area with the purpose *Maintenance bay*.
4. On the machine's **Life** tab, the **Setup** card lists what was issued on its tickets. Each line is either:
   - **Installation (capitalised)** — added to the machine's cost and depreciated with it.
   - **Consumable (expense)** — not added to its cost.
   Consumable families default to expense and everything else to installation. Change any line; your accountant decides the policy.
5. **Close — machine goes live** on the ticket. The machine is live from today.

## Cost and depreciation
- On the **Life** tab, **Cost and depreciation › Edit** takes the **Cost** (from its GRN), **Salvage value**, **Life (years)** and **Live since**.
- It depreciates on a straight line: (cost + installation − salvage) spread over its life, one day at a time from the day it went live.
- The card shows the **Book value**, the amount per day and per year, the amount so far, and the date it is **Fully down**.
- **Use by order**:
  - Each day it worked is charged to the orders whose work ran on it that day, split by run hours.
  - A day with no run hours goes to the order it was checked out to.
  - Days with neither are idle, and their cost is shown as *not recovered*.
  - Each order's cost sheet shows the charge as **Machine use**.

## Condemning it
1. Maintenance clicks **Condemn…** and writes why.
2. The MD sees it in Approvals (and on Home under *Machines to condemn*), with its age, book value and maintenance cost.
3. Once it is approved, click **Record disposal**: **Scrapped** or **Sold**, the date, and the amount realised. The rest of its book value is written off.

## Good to know
- **Durable tools** (grinders, welding sets, gauges) are any item of a tool family with no tool life set. Tools with a life (discs, tips, nozzles) stay on Tools.
- Machines already on the register before this change are **Live**, with no cost until you enter one.
- Moving a machine needs Stores or Maintenance. Checking out needs Stores. Setup, condemning and the setup items need Maintenance. Cost and disposal need Maintenance or Accounts manage. The MD's step needs *Approve condemning a machine*.

## Related
- [Check-in / out](help:stores-check-in-out)
- [Buying a new machine](help:maintenance-new-machine)
- [Machines (the register)](help:maintenance-machines)
- [A machine](help:maintenance-machine)
