---
id: order-page
title: The order page
area: order
roles: [sales, design, management, purchase, stores, production, accounts]
routes: ["/:company/cf_erp/orders/:id"]
order: 10
---
One sales order is one project. Its page walks it from inquiry to dispatch: the tabs are the order's stages, in order. Everyone who works on the order works here.

## What you see
- **The header**: order number, title, customer and their reference, badges (*rev 2*, Customer/Stock, the status, **Past committed date** when late), and the facts **Received**, **Committed**, **Confirmed**, **Lines** and **Order value**.
- **The stage tabs**: usually **Structure & values › Execution plan › Freeze design › Nesting › Material request › Customer acceptance › Production**, then **Stock**, **Customer material**, **Cutting allowance** and **Details**. Each tab carries a mark: *To do*, *Part done*, *Done* or *Not needed*. The next stage that needs work is marked.
- **Working on**: on Freeze design, Nesting and Production, which work one line at a time, pick the line here. The other steps are for the whole order.
- **The foot of each stage**: **Back**, how this stage stands, and **Next: …**. When the stage is not finished the button says **Skip for now: …**. Nothing is ever shut: every tab stays one click away.
- A yellow note at the top of a stage says what it waits for, with a **Go to …** button.

## The order value
The header shows ONE value. Before terms exist it is the *estimate* from the line rates. Once the acceptance is sent it is *terms awaiting approval*; after Management approves, *accepted*. If the line rates say something else you also see *estimate ₹…*. Billing and costing use the accepted terms.

## Buttons in the header
- **Customer acceptance**: on an inquiry or quoted order. A customer order is confirmed only by an approved acceptance, never by a button.
- **Mark quoted**, **Back to inquiry**, **Mark lost**, **Reopen as inquiry**, **Cancel order**, **Close**: the moves allowed from the current status. Lost, Cancel and Close ask you to confirm. A confirmed order can only be closed or cancelled.
- **Revise**: once a line is frozen. Rev 2 starts as a copy of rev 1 (every line, structure and value); rev 1 is kept read-only. Nothing in the new revision is frozen; freezing again gives the same codes wherever nothing changed.
- **Discard revision**: takes a later revision back while none of its lines is frozen. The revision before it becomes current again.
- **Edit** opens **Details**. The bin deletes a draft, inquiry, lost or cancelled order.

## Good to know
- A cancel is refused while a line is released to production. Take the release back first.
- A closed, lost, cancelled or revised order no longer changes.
- A revised order shows *Revised — kept as it was* with a link to the newer revision.
- Buttons appear only with the orders permission.

## Related
- [Structure & values](help:order-structure)
- [Customer acceptance](help:order-acceptance)
- [Details](help:order-details)
- [Orders](help:sales-orders)
