---
id: maintenance-orders
title: Maintenance orders
area: maintenance
roles: [maintenance, management]
routes: ["/:company/cf_erp/maintenance-orders"]
order: 20
---
Every maintenance order (MO) — raised by a fault, by a preventive plan, or by maintenance itself.

## What you see
- **Status**: **Open (not done)** (the default), **Waiting for parts**, **Done**, **Cancelled**, **All**; and a **Search** box (key /).
- Columns: **MO**, **Machine**, **Job**, **From** (**Fault**, **Preventive** or **Raised by maintenance**), **Status** (**Open**, **In progress**, **Waiting for parts**, **Done**, **Cancelled**, or **False alarm**), **Machine** (**Down** while it holds the machine), **Raised**, **Downtime**; hidden: **MRs**.
- Click a row to open it.

## How to raise a job yourself
1. Click **New** (key N).
2. Pick the **Machine**, type **The job** (e.g. Replace the torch cable) and a **Note**.
3. Click **Raise**. The order opens.

## Good to know
- A job raised here does not stop the machine — it stays up until the work starts. A fault stops it at once.
- Preventive plans open orders by themselves when they fall due.
- Raising and moving orders needs the Maintenance permission.

## Related
- [A maintenance order](help:maintenance-order)
- [Raise a fault](help:maintenance-raise-fault)
- [Preventive plans](help:maintenance-plans)
