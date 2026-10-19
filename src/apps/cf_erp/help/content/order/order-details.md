---
id: order-details
title: Details
area: order
roles: [sales, accounts, management]
routes: ["/:company/cf_erp/orders/:id"]
tab: details
order: 99
---
The **Details** tab holds the order's own facts: number, title, customer, dates, delivery address and notes. On a customer order it also shows the costs so far and the invoices. **Edit** in the order header opens it.

## What you see
- **Details**: **Order number**, **Title**, **Customer**, **Customer's reference**, **Received on**, **Committed date**, **Delivery address**, **Notes** and **Material** (**We buy** / **Customer supplies**), then **Save details**.
- **Costs**: what stock has cost on this order so far, at cost (material issued, scrap, steel bought, wastage, offcuts, pieces from offcuts). Labour is not in it.
- **Invoices**: one tax invoice for each dispatch, once the order is past draft.

## How to change the details
1. Click **Edit** in the header, or open **Details**.
2. Change what you need, for example the **Committed date**.
3. Click **Save details**.

## Good to know
- The **Order number** can change only until the first line is added. After that it is fixed, because item codes are built from it.
- The **Committed date** (on the order, or on every line) is needed before the order can be confirmed.
- **Material** can change until the MR is raised; once the acceptance is approved it is part of the accepted terms.
- A closed, lost, cancelled or revised order does not change, and **Save details** is hidden.

## Related
- [The order page](help:order-page)
- [Material request](help:order-buying)
