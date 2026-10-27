---
id: maintenance-downtime
title: Planned downtime
area: maintenance
roles: [maintenance, production, management]
routes: ["/:company/cf_erp/planned-downtime"]
order: 40
---
Hours a machine is planned to be off — a monthly service, a shutdown, a holiday. Saved, it is written into the machine's calendar and the plan gives the machine no work in those hours.

## What you see
- **Machine** picker (**All machines** or one).
- Columns: **Machine**, **When** (in words, e.g. "Every 1st Sunday, 08:00 for 8 h"), **Reason**, **From – until** and **Next** (the coming dates, or "None coming").

## How to add planned downtime
1. Click **New** (key N).
2. Pick the **Machine**.
3. Use a quick button — **Every 1st Sunday, 8 h**, **Every Sunday, 4 h** or **Once, a whole day** — or fill it yourself.
4. Type the **Reason**.
5. Choose **Once**, **Weekly** or **Monthly**:
   - **Weekly**: tick the days and **Every … weeks**.
   - **Monthly**: **On** a day of the month (**Day of month**) or a weekday (**Which** — 1st, 2nd, 3rd, 4th, last — and **Day**), and **Every … months**.
6. Set **Date** (once) or **From** and **Until (optional)**, **Starts at** and **Hours down**. The next dates show as you type.
7. Click **Save**.

## How to change or remove it
- Click the row, change it and **Save — from today on**. The past stays as it was.
- **Remove** gives the machine's calendar those hours back from today on.

## Good to know
- For a single day's change to a machine's shifts (a holiday, overtime) you can also use **Change a day** on the machine's **Shifts** tab.
- Changing planned downtime needs the Maintenance permission. With production view the list is read only.

## Related
- [Planner](help:production-planner)
- [A machine](help:maintenance-machine)
- [Preventive plans](help:maintenance-plans)
