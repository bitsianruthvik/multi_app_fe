---
id: stores-batch
title: A batch — hold, release, reject
area: stores
roles: [stores, production, management]
routes: ["/:company/cf_erp/batches/:id"]
order: 61
---
One batch: what it records, where it is, what happened to it, and whether it may be issued.

## What you see
- The header: the batch code, its item, its status and, when held or rejected, why.
- Facts: **On hand**, **Owner** (a customer's, and for which order), **Unit cost**, **Received**, **Supplier**, **Supplier's lot**.
- Tabs: **Overview** — **What this batch records** (its values, such as the heat number) and **Where it is** (each area, what it **Counts as**, **Quantity**); **Movements** — every receipt, issue, transfer and count that touched it; **History** — every change to a value, who, when, from what to what.

## How to hold, release or reject a batch
1. Click **Put on hold** and give **Why** — held stock is not issued until the batch is released.
2. Click **Reject** and give **Why** — a rejected batch is never issued; it can be moved or scrapped.
3. Click **Release** to make it available again ("Released — it can be issued again.").

## How to correct a value
1. On **Overview**, change the value in **What this batch records** and save. Corrections keep their history (see **History**).
2. **Edit** (top right) changes the batch's own details.

## Good to know
- Required values were entered when the batch was received.
- Holding, releasing, rejecting, editing and changing values need the inventory manage permission; others only see the batch.

## Related
- [Batches](help:stores-batches)
- [Movements](help:stores-movements)
