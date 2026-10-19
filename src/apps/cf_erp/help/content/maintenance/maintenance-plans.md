---
id: maintenance-plans
title: Preventive plans
area: maintenance
roles: [maintenance, management]
routes: ["/:company/cf_erp/maintenance-plans"]
order: 30
---
Regular servicing that opens its own maintenance order when it falls due — every N days, every N run hours, or every N tonnes. Run hours and tonnes come from the machine log.

## What you see
- Columns: **Machine**, **Job**, **Every** ("30 days / 500 run h"), **Since last done**, **Due** (a % with the next date, **Due** in red, or **Off** for an inactive plan) and **Open order** (click to open it).
- When you open the screen and plans have fallen due, a message says how many preventive orders were raised.

## How to add a plan
1. Click **New plan** (key N).
2. Pick the **Machine** and type **The job** (e.g. Lubricate the gantry rails).
3. Fill **Every … days**, **or … run hours**, **or … tonnes** — any one or more. An order opens when any of them is reached; leave a box empty to not count it.
4. **Last done on (optional)** — empty counts from today.
5. Click **Save**.

## How to change or stop a plan
1. Click its row. Change what you need; **Last done on** restarts the count from that date.
2. Untick **Active** to pause it.
3. **Remove** deletes it — no more orders are raised from it; orders already raised stay.

## Good to know
- Hours and tonnes count only what is recorded on the machine log, so keep the log up to date.
- Changing plans needs the Maintenance permission.

## Related
- [Maintenance orders](help:maintenance-orders)
- [Planned downtime](help:maintenance-downtime)
