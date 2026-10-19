---
id: production
title: Getting started in Production
area: roles
roles: [production]
routes: ["/:company/cf_erp/production-orders"]
order: 60
---
Production turns a confirmed sales order into steel that leaves the gate. The production manager releases work, plans it on the machines, follows it on the floor, gives work to contractors when needed, and hands it to dispatch. Operators record their work on the machine tablet.

## How work reaches you
1. On the sales order, the **Production** step makes the production orders from the saved execution plan ("Create the production order"). It can also override every time on the order for a trial. See [the order's Production step](help:order-production).
2. Each production order is one piece of work, such as "SO260014 · Span 2 of 3". It starts **Yet to plan**.

## Your day
### 1. Release
Open [Production orders](help:production-orders). Use the **Yet to plan** chip, then click **Release all yet to plan (N)**, or open one and click **Release**. Released, it is **Planned** and its steps exist.

If release is refused because a row has no flow, give that row a flow on the order, save, and release again. **Take back** undoes a release while nothing has started and nothing was issued.

### 2. Plan
Open the [Planner](help:production-planner).
- Choose **Automatic (AI)** — committed dates, then money unlocked, then your priority — or **Manual** — your **Rank** and **Earliest start**.
- Check **Late against committed** and **Steps that cannot be planned** (no material date or no machine time), and read "slowed by …" on each row.
- **By machine type (2)** shows each day's load. A machine marked "down" has an open fault; "No shifts" means it cannot be planned on.
- Click **Save plan**. The first save is the baseline. To move the baseline, **Re-baseline…** asks Management.

For the month-by-month picture and tonnage goals use [Plan by month](help:production-plan).

### 3. Make sure material is there
A step is **Ready** only when its earlier steps are done and its material is reserved. In the [Tracker](help:production-tracker), the **Material** view shows what is still to reserve. Stores reserves and issues it ([Issuing material to production](help:stores-issuing)).

### 4. Run the floor
- Operators use the [Machine log](help:production-floor) on each machine's tablet: pick the machine, tap their name, **Start**, **Pause**, **Done**, and tell why the machine stopped.
- Keep [Operators](help:production-operators) and [Stop reasons](help:production-stop-reasons) up to date.
- Supervisors can **Start**, **Record** and hold steps in the Tracker **Steps** view, and see the piece tree in **Progress**.
- A breakdown: **Raise a fault** — the machine leaves the plan until maintenance closes the order ([Raise a fault](help:maintenance-raise-fault)).

### 5. Give work to contractors
On [a production order](help:production-order), **Give work to a contractor**: pick BOM rows × operations, the contractor and the rate per tonne, then **Raise contractor PO**. Management approves it; Accounts pays weekly ([Contractor work orders](help:production-contractor-work-orders)). Those steps show "with … (WO-…)".

### 6. Dispatch
When every step is done the production order shows **Dispatch**. Stores clicks **Dispatch**; it becomes **Closed**.

## Set up once
- [Operations](help:production-operations) — each with a machine type and times (setup and operation time both per quantity).
- [Flows](help:production-flows) — operations in order; activate them. Set the cut-plate flow on the Flows screen.
- [Machines](help:maintenance-machines) — each with shifts on [its page](help:maintenance-machine).
- [Planned downtime](help:maintenance-downtime) comes off the machines' shifts.

## Permissions
Releasing, planning, recording steps and changing operations, flows, machines, operators and stop reasons need the production manage permission. Operators need only the machine log (floor) permission. Dispatch needs the inventory manage permission. The Test login holds all of these in the testing phase.
