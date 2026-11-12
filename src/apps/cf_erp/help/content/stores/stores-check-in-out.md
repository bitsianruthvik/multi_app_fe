---
id: stores-check-in-out
title: Check-in / out — who has which machine or tool
area: stores
roles: [stores, maintenance, admin]
routes: ["/:company/cf_erp/machine-custody"]
order: 70
---
Machines and durable tools going out to people, contractors, orders and areas, and coming back. Received machines are also registered here.

## What you see
- Figures: **Out now**, **Overdue** and **To register**.
- **Out now** — each machine or tool that is out: **With** (whom or what, and the kind), **Taken by**, **Out since** and **Due back**. Overdue ones are listed first, in red.
- **To register** — machines and durable tools received on a GRN and still waiting for their serial and type.
- **History** — every check-out, with when each one came back and its note.

## How to check something out
1. Click **Check out**. On a machine's page, the **Check out** button does the same for that machine.
2. Pick the **Machine or tool**. Only live ones that are not already out are listed.
3. **To**: a person (a login), an employee (from HRMS), a contractor, an order or an area. Then pick which one.
4. **Taken by** — required for an order, an area or a contractor: the person who takes it.
5. Optionally enter **Due back** and a **Note** (site, job, condition), then click **Check out**.

## How to check it in
1. On **Out now**, click **Check in** (or **Check in** on the machine's page).
2. Pick where it goes back to and note its condition, then click **Check in**.

## How to register what arrived
1. On **To register**, click **Register** on the line.
2. For each unit, enter its name, serial number, code (optional) and machine type. Leave **Needs setup by Maintenance** ticked for a machine.
3. Click **Register**. A machine goes to setup with a ticket for Maintenance; a tool is ready at once.

## Good to know
- A machine in setup or condemned cannot be checked out, and one that is out cannot be moved — check it in first.
- A day a machine is out to an order, with no run hours on it that day, is charged to that order as machine use.
- Everything here is also on the machine's **Log** tab.

## Related
- [A machine's life](help:maintenance-machine-life)
- [Machines (the register)](help:maintenance-machines)
