---
id: sales-term-templates
title: Templates for customer acceptance
area: sales
roles: [sales, management, accounts]
routes: ["/:company/cf_erp/term-templates"]
order: 50
---
**Setup › Templates** holds the rows a customer acceptance starts from: charges, payment milestones and post-production stages. The default of each kind fills every new acceptance, so sales only changes what differs. Sales and management keep them up to date.

## What you see
- Three chips: **Charges**, **Payment milestones** and **Post-production stages**, each with how many templates it has.
- One card per template, with a one-line summary (for example *Fabrication ₹65,000/t · material ₹75,000/t*, or *10 % When the order is accepted · 80 % On each dispatch*). The default carries a **Default** badge.
- On each card: **Make default**, **Edit** and **Delete**.

## The three kinds
- **Charges**: one row per operation, the material rate and lump sums. A template may leave the operation or the rate for the order to fill.
- **Payment milestones**: when each part of the order value is billed, and the credit days.
- **Post-production stages**: what happens after dispatch, in order (inspection, erection, load test, handover).

## How to make a template
1. Pick the chip for the kind.
2. Click **New template**. It starts from a short starter.
3. Type a **Name**.
4. Tick **Default — fills every new acceptance** if it should be the default.
5. Fill the rows the same way as on the order's Customer acceptance step (see [Customer acceptance](help:order-acceptance)). Use **Charge**, **Lump sum**, **Scrap & offcuts**, **Milestone** or **Stage** to add rows.
6. Click **Save**.

## Another way
On an order's Customer acceptance step, **Save as template** keeps that order's charges, milestones or stages as a new template. **Fill from template** puts a template's rows on an order.

## Good to know
- Deleting a template does not touch acceptances already made from it: they keep their own rows.
- A milestone billed on a post-production stage names the stage by its key (s1, s2 …) from the stages template.
- Changing templates needs the orders permission.

## Related
- [Customer acceptance](help:order-acceptance)
- [Orders board](help:sales-orders-board)
