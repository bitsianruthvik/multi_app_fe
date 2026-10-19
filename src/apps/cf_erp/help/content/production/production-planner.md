---
id: production-planner
title: Planner — baseline and re-baseline
area: production
roles: [production, management]
routes: ["/:company/cf_erp/planner"]
order: 20
---
Every production order, step by step, placed on the machines' shifts, day by day. The production manager saves the plan; the first saved plan is the baseline every later plan is measured against.

## How the plan is worked out
- Each step waits for the steps before it and for its material; material goes first come, first served.
- Capacity per machine type = the machines' shifts, less planned downtime, less machines down with an open fault.
- **Automatic (AI)** — committed dates first, then the money each production order unlocks, then your priority. Pin a production order to keep its rank.
- **Manual** — your **Rank** and **Earliest start** for each production order. A higher rank takes what it can; a lower one stretches.

## What you see
- Figures: **Production orders**, **Late against committed**, **Steps that cannot be planned** (material with no date, or no machine time) and **On time vs baseline**.
- **By production order (1)**: one row each — rank, name, **Late**, "ends …", "due …", the slip against the baseline, "unlocks ₹…", and what slowed it. The bar runs from its first planned step to its last; the grey tick is its baseline end, the red line its committed date.
- **By machine type (2)**: each type's machines (marked "down" or "No shifts") and each day's load in %, coloured from light to over-full. Hover a day for the orders on it.

## How to plan and save
1. Pick **Automatic (AI)** or **Manual**. **Look at manual / automatic** shows the other mode without storing it.
2. In Manual, type **Rank** and **Earliest start** on a row, or select a row and press Alt+↑ / Alt+↓. In Automatic, click the pin.
3. Click **Re-plan** (R) to work it out again.
4. Click **Save plan** (S). The first save sets baseline v1.
5. Double-click a row, or press Enter, to see its steps with start, end and minutes.

## How to re-baseline
1. Save the plan first if you changed it.
2. Click **Re-baseline…** (B), write **Why should the baseline move?** and click **Ask Management**.
3. Until Management approves it in Approvals, a line says "Re-baseline v… waits for Management".

## Good to know
- There is no frozen window — every save can move any step.
- Keys: A, M, S, B, R, 1, 2, ↑ ↓, P (pin), Enter, F (full screen).
- Changing the plan needs the production manage permission; approving a re-baseline needs the re-baseline approval permission.

## Related
- [Management approvals](help:management-approvals)
- [Production orders](help:production-orders)
- [Planned downtime](help:maintenance-downtime)
- [Plan by month](help:production-plan)
