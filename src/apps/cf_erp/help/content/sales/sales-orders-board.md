---
id: sales-orders-board
title: Orders board
area: sales
roles: [sales, management, accounts]
routes: ["/:company/cf_erp/orders-board"]
order: 20
---
The Orders board shows every customer order as a card in a swim lane, so you see at a glance where each project stands. Sales and management use it every day; it is also where the post-production stages are ticked off.

## What you see
- Seven lanes, left to right: **Inquiry / draft**, **Pending approval**, **Material**, **In production**, **Dispatched**, **Post-production** and **Closed**. Each lane shows how many cards it holds.
- Each card shows the order number (click it to open the order), the customer and title, *Due* date and number of lines, and the order value.
- Badges: **Late** when the committed date has passed, **Rate change waiting** when changed terms wait for Management.
- What each lane adds to the card:
  - **Inquiry / draft**: *Sent back: …* with Management's note, if the acceptance was returned.
  - **Pending approval**: *Acceptance v2 waits for Management*.
  - **Material**: how much MR material is locked, or *All material in place*.
  - **In production** and **Dispatched**: how much is released and dispatched.
  - **Post-production**: the order's stages as a checklist, how many are done, and the payment position.
- **Search orders** at the top right.

## How a card moves
Nothing is dragged. A card moves by itself when something real happens: the acceptance is sent or approved, material is locked, a line is released, a dispatch goes out.

## How to tick a post-production stage
1. Find the card in **Post-production**.
2. Tick the stage, for example *Inspection by the customer*.
3. In the dialog, set **Done on** (today or earlier) and a **Note**, for example the RITES IC number.
4. Click **Mark done**. This is recorded, and Billing uses it.
5. To undo, untick the stage.

## How an order closes
- When every stage is done and everything is dispatched, the order closes by itself, but only once it is fully paid. Until then the card says *— it closes once fully paid* (for example while a retention is still to come).
- **Close the order** appears on a Post-production card once every stage is done and the order is fully paid (or has no accepted terms to bill). It closes the order by hand.

## Good to know
- Ticking stages and closing need the orders permission.
- The board shows open customer orders and those closed in the last 90 days. Stock orders are not on it.

## Related
- [Orders](help:sales-orders)
- [Customer acceptance](help:order-acceptance)
- [Templates](help:sales-term-templates)
