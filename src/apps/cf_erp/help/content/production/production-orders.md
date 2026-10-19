---
id: production-orders
title: Production orders
area: production
roles: [production, management, stores]
routes: ["/:company/cf_erp/production-orders"]
order: 10
---
Every production order, grouped by sales order. A production order is one piece of work made from the sales order's execution plan — for example "SO260014 · Span 2 of 3". The production manager releases them to the floor and follows them to dispatch.

## The states
1. **Yet to plan** — made, not released. Nothing is on the floor yet.
2. **Planned** — released: its steps exist and the planner places them on the machines.
3. **In production** — work has started.
4. **Dispatch** — every step is done; it waits to ship.
5. **Closed** — dispatched.

## What you see
- One block per sales order (click its head to fold it): the order code (it opens the order's Production tab), the customer and how many production orders it has.
- One row per production order: its code, what it makes, its state, a progress bar, and when it was released.
- State chips: **Open**, **Yet to plan**, **Planned**, **In production**, **Dispatch**, **Closed**, **All**. Search **order, production order or customer**.
- **Released before production orders** at the foot: older lines, read-only, each with a **Tracker** link.

## How to release
1. Click **Release all yet to plan (N)** to release every Yet to plan one on the page, or open one and click **Release**.
2. The toast says it is on the floor, and what the release took from the material request.

## Good to know
- Production orders are created on the sales order's Production step ("Create the production order") from the saved execution plan.
- Release is refused when a row has no flow — the message names the row. Give it a flow on the order (a frozen line may still get a flow for a row that has none), save, and release again.
- Releasing needs the production manage permission.

## Related
- [The order's Production step](help:order-production)
- [A production order](help:production-order)
- [Planner](help:production-planner)
- [Tracker](help:production-tracker)
