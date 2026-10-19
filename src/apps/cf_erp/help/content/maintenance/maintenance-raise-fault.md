---
id: maintenance-raise-fault
title: Raise a fault (machine is down)
area: maintenance
roles: [maintenance, production]
routes: ["/:company/cf_erp/maintenance", "/:company/cf_erp/floor"]
order: 11
---
Anyone on the floor marks a machine down. The machine stops in the plan at once, and a maintenance order opens for the maintenance team.

## Where to raise it
- On the machine's tablet (Machine log): the red **Raise a fault** in the header.
- On the Maintenance board: **Raise a fault** on the machine's card, or the red button at the top (key F).

## How to raise it
1. Pick the **Machine** (already filled in from the tablet or a card).
2. Pick **What is wrong**.
3. Add a **Note** — some reasons need one, and the box then reads **Note (needed)**.
4. Click **Machine is down**.
5. The message names the new maintenance order. The board shows the machine as **Down**.

## What happens next
- The planner counts no capacity for the machine until the fault is closed (on the Planner it shows "down").
- Maintenance opens the order, starts the work, and closes it with **Close — machine up**. Closing brings the machine back and records the downtime and its cost.
- If it was nothing, maintenance marks it a **False alarm**: the machine is back up at once and the order is cancelled.

## Good to know
- Raising a fault is not the same as a stop on the Machine log. A stop (**Machine stopped?**) records why the machine stood still for a while; a fault takes it out of the plan until maintenance closes it.

## Related
- [Maintenance — the machines board](help:maintenance-board)
- [A maintenance order](help:maintenance-order)
- [Machine log](help:production-floor)
