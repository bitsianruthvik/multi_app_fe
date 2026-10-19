---
id: sales-orders
title: Orders
area: sales
roles: [sales, design, management]
routes: ["/:company/cf_erp/orders"]
order: 10
---
The Orders list is every sales order. Each order is a project, from the first inquiry to delivery. Stock orders make standard products for stock. Sales opens orders here; design and management use it to find one.

## What you see
- **The figures strip**: **Inquiries** (being designed), **Quoted** (waiting for the customer), **Confirmed** and **Past committed date** (still open). Click a figure to filter the list to it.
- **The search box**: search by order number, title or customer.
- **Status chips**: **Open** (the default), **Past date**, **Inquiry**, **Quoted**, **Confirmed**, **Draft**, **Closed**, **Lost**, **Cancelled** and **All**. Each chip shows how many orders it holds.
- **Customer** and **Stock** chips to see only one kind of order.
- **Show earlier revisions**: an order is shown at its latest revision. Tick this to see the older revisions too.
- **The table**: **Order** (with a *rev 2* badge once an order has been revised), **Project** (title and customer, with their reference), **Lines**, **Value**, **Committed** (with a red **Past date** badge when late) and **Status**. **Type** and **Received** are hidden columns; open them from the column menu.

## How to start a new order
1. Click **New order** at the top right.
2. Fill the dialog (see [New order](help:sales-new-order)) and click **Create order**.
3. The order opens on its first step, **Structure & values**.

## How to find an order
1. Type part of the number, title or customer name in the search box.
2. Pick a status chip if you know where the order is, or **All** if you do not.
3. Click the row to open the order.

## Good to know
- The **Value** column shows ONE order value. Before the customer acceptance it is the *estimate* from the line rates. Once terms are sent it says *terms awaiting approval*. After Management approves it says *accepted*. When the accepted value differs from the line rates you also see *estimate ₹…* beside it.
- A list you filter is kept in the address, so you can bookmark or share it.
- Only people with the orders permission see **New order**.
- You can export the table from its menu.

## Related
- [New order](help:sales-new-order)
- [Orders board](help:sales-orders-board)
- [The order page](help:order-page)
- [Getting started in sales](help:sales)
