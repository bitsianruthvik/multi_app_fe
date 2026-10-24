---
id: management-dashboard
title: Dashboard (by machine, by order, work orders)
area: management
roles: [management, production, admin]
routes: ["/:company/cf_erp/management"]
order: 30
---
**Management › Dashboard** is Management's glance at the plant. Production people find the same page as **Production › Dashboard**. It shows what the machines did, where every confirmed order stands and how far the contractors are, all for one period. It only reads; nothing is changed here.

## What you see
- **Period**: Today, This week (the default), This month, Last 30 days or Custom. Custom shows **From** and **To** dates and allows up to 92 days.
- **Refresh**. While the period includes today, the page also reads again every 3 minutes by itself.
- **Maintenance this week**: downtime and what maintenance cost.
- Three tabs. The tab and the period stay in the web address, so you can share a link to, say, *this month, by order*.

### By machine
- Figures: Utilisation, Machine hours run, Tonnes finished, Pace vs standard, Overtime, Stopped and Plant shift time.
- One row per machine shows where its shift time went: **Run in shift**, **Overtime**, **Stopped**, **Break / not yet** and **Not recorded**.
- Panels: **Why machines stopped** (stop time by reason), **Who ran it** and **Day by day**.
- Search with **Find a machine**, filter by type, and sort.
- A machine with no shifts shows *No shifts: utilisation cannot be worked out*.

### By order
- Figures: Confirmed orders, Order book (before tax), Tonnes made, Late or at risk, and Blocked now.
- One row per confirmed order: tonnes done, **Committed** date against **Forecast** / **Plan ships**, **Where it is**, and what is **Blocked**, such as *Material not reserved yet*.
- **Show lines** opens each order's lines.
- **Download** saves the tab, or an Excel / CSV file with every piece at all levels.

### Work orders
- Figures: Open work orders, Contractors active, Operations done, Overdue, and Work orders complete.
- One row per contractor work order: its sales order, contractor, operations done this period, and last activity. You can group the rows and filter by contractor.

## How to use it
1. Pick the period.
2. Start on **By order** and look at **Late or at risk** first.
3. Switch to **By machine** to see why: stops, missing shifts, or machine time not recorded in the machine log.

## Good to know
- *Not recorded* time means nobody entered that machine's time in the **Machine log**. Ask the shop floor to keep it up to date.
- You need production view or orders view to see this page.

## Related
- [Plan health](help:management-overview)
- [Contractor work orders](help:accounts-contractor-work-orders)
