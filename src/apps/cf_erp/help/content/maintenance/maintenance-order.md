---
id: maintenance-order
title: A maintenance order — start, parts, close
area: maintenance
roles: [maintenance, stores, management]
routes: ["/:company/cf_erp/maintenance-orders/:id"]
order: 21
---
One maintenance order, full screen: what happened, the machine's state, the moves (start, waiting for parts, close, false alarm, cancel), its material requests and its history.

## What you see
- The code, the job, the status badge and **Machine down …** while the machine is held. Under it: where it came from, the machine, and when and by whom it was raised.
- **What happened**: **Machine**, **Reason**, **Note**, **Machine stopped** (from → to, or "still down"), **Downtime**, **Cost**, **Work done**, **Started**, **Done**.
- **Material requests** and **History** (every status change, with notes and who).

## How to work an order
1. Click **Start work** (S) when you begin.
2. Need spares? Click **Material request** (M). The machine's tools, spares and consumables are filled in — change the quantities, remove or add (**Add an item**). Pick **For sales order (optional)** when the spares are for a project; add a **Note**. Click **Send to Stores**.
3. While parts are awaited, click **Waiting for parts**; click **Start work** again when they come.
4. Click **Close — machine up** (C). Write **What was done**, any **Other cost (₹)** and **What it was for**, then **Done — machine is back up**.

## Other moves
- **False alarm** — the machine is back up at once and the order is cancelled. Say what it was.
- **Cancel** — say why. If the machine was down, it is brought back up.

## Good to know
- The MR goes to Stores like every MR: Stores issues what is in stock, Purchase buys the rest. Its cost lands on the machine's maintenance, or on the sales order you named.
- Parts issued against the order are added to its cost by Stores.
- The keys S, M and C work when no box is being typed in. The buttons need the Maintenance permission.

## Related
- [Maintenance orders](help:maintenance-orders)
- [A material request](help:purchase-material-request)
- [A machine — tools and spares](help:maintenance-machine)
