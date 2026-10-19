---
id: maintenance
title: Getting started in Maintenance
area: roles
roles: [maintenance]
routes: ["/:company/cf_erp/maintenance"]
order: 70
---
Maintenance keeps the machines running and tells the plan when they are not. Faults come from the floor, preventive jobs come from plans, and you raise your own. Every job is a maintenance order (MO); its spares come through Stores like any other material.

## Your day
### 1. Look at the board
Open [Maintenance — the machines board](help:maintenance-board). Down machines come first. The figures show **Down**, **Planned downtime now**, **Running** and **Open maintenance orders**. Each card says why a machine is in its state and lists its open MOs.

### 2. Faults
Anyone on the floor can **Raise a fault** — from the machine's tablet or from the board ([Raise a fault](help:maintenance-raise-fault)).
- The machine is **Down** at once: the planner counts no capacity for it.
- A maintenance order opens with the reason and note.

### 3. Work the order
Open the order from the board or from [Maintenance orders](help:maintenance-orders) ([a maintenance order](help:maintenance-order)):
1. **Start work** (S) when you begin.
2. **Material request** (M) for spares — prefilled from the machine's tools and spares list. Name a sales order when the spares are for a project. **Send to Stores**.
3. **Waiting for parts** while you wait; **Start work** again when they come.
4. **Close — machine up** (C): **What was done**, any **Other cost (₹)** and what it was for. The machine is back up and the downtime and cost are recorded.

If the fault was nothing, click **False alarm**: the machine is back up at once and the order is cancelled. Use **Cancel** for an order raised by mistake.

To raise a job yourself (the machine stays up until the work starts), click **New** on Maintenance orders.

### 4. Spares and tools
- Your MR goes to the Stores [MR inbox](help:purchase-material-requests). Stores gives what is in stock and Purchase buys the rest; parts issued against the order are added to its cost.
- Tools with a life are followed on [Tools](help:maintenance-tools): record each piece's use and **Retire** it when finished.

## Plan ahead
- [Preventive plans](help:maintenance-plans) — every N days, run hours or tonnes. A due plan opens an MO by itself. Run hours and tonnes come from the machine log, so push operators to keep it up to date.
- [Planned downtime](help:maintenance-downtime) — "every 1st Sunday, 8 h", or a one-off shutdown. It is written into the machine's calendar and the plan gives the machine no work in those hours.

## Set up once
- [Machines](help:maintenance-machines) and [machine types](help:maintenance-machine-types) — the register. Production machines need shifts on [their page](help:maintenance-machine).
- Each machine's **Tools & spares** tab — the tools, spares and consumables it needs, with a typical quantity. Every maintenance MR starts from this list.
- [Stop reasons](help:production-stop-reasons) — what operators tap when a machine stands still.

## Permissions
The Maintenance permission opens the Maintenance tab and lets you raise and work orders, plans and downtime. Raising a fault also works with the machine log or production manage permission. Editing machines, shifts and the tools and spares list needs the production manage permission. The Test login holds all of these in the testing phase.
