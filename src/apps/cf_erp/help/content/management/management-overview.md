---
id: management-overview
title: Management overview
area: management
roles: [management, admin]
routes: ["/:company/cf_erp/management-overview"]
order: 20
---
Management's own dashboard page. For now it holds one card, **Plan health**, which compares the saved production plan with its baseline. More dashboards will be added here later.

## What you see
- **Plan health**: whether the plan is slipping against the baseline.
  - **Slipping most**: the production orders that have moved furthest.
  - **Slip by reason**: why they moved, for example a machine that is busy.
- **Open the planner** takes you to the planner to act on it.
- If no plan has been saved as a baseline yet, the card says **No baseline yet**.

## How to use it
1. Open **Management › Overview** once a day, or before the production meeting.
2. Look at **Slipping most**. For each late order, click **Open the planner** and see what is holding it up.
3. If the plan must move for good, the planner asks for a **re-baseline**. That request comes to [Approvals](help:management-approvals) as a *Re-baseline* card.

## Good to know
- Approvals are not on this page. They have their own screen, **Approvals**.
- For machine use, order progress and contractors, use the [Dashboard](help:management-dashboard).
- For margins, use [Order costing](help:management-order-costing).

## Related
- [Approvals](help:management-approvals)
- [Dashboard](help:management-dashboard)
