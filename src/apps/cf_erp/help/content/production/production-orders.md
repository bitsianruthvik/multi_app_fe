---
id: production-orders
title: Production orders
area: production
roles: [production, management, stores]
routes: ["/:company/cf_erp/production-orders"]
order: 10
---
Planning › Production orders: every production order, grouped by sales order. A production order is one piece of work made from the sales order's execution plan — for example "SO260014 · Span 2 of 3". It is made when the plan is saved, gets its times on the order's Production setup, is sent to planning, and is released from here.

## The states
1. **Setting times** — made from the execution plan; its times are being set on the order's Production setup.
2. **Planning** — its times are checked (**Send to planning**). It waits to be released.
3. **Released** — its steps exist and the planner places them on the machines.
4. **In production** — work has started.
5. **Dispatch** — every step is done; it waits to ship.
6. **Closed** — dispatched.

## What you see
- One block per sales order (click its head to fold it): the order code (it opens the order's Production tab), the customer and how many production orders it has.
- One row per production order: its code, what it makes, its state, a progress bar, and when it was released.
- State chips: **Open**, **Setting times**, **Planning**, **Released**, **In production**, **Dispatch**, **Closed**, **All**. Search **order, production order or customer**.
- **Released before production orders** at the foot: older lines, read-only, each with a **Tracker** link.

## How to release
1. Click **Release all in planning (N)** to release every one in Planning on the page, or open one and click **Release**. The order must be confirmed (the customer and the MD accepted it), the design frozen and the line nested.
2. The toast says it is on the floor, and what the release took from the material request.

## Good to know
- Production orders are made when the sales order's execution plan is saved; their times are set, and they are sent to planning, on the order's Production setup.
- **Take back** sends a released one back to Planning while nothing has started.
- Release is refused when a row has no flow — the message names the row. Give it a flow on the order (a frozen line may still get a flow for a row that has none), save, and release again.
- Releasing needs the production manage permission.

## Related
- [The order's Production setup](help:order-production)
- [A production order](help:production-order)
- [Planner](help:production-planner)
- [Tracker](help:production-tracker)
