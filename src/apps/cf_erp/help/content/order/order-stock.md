---
id: order-stock
title: Stock (on the order)
area: order
roles: [stores, production, sales]
routes: ["/:company/cf_erp/orders/:id"]
tab: stock
order: 90
---
The **Stock** tab lists what has gone to this order from stock: every issue made against it. Stores and production use it to see what the order has already drawn.

## What you see
- **Stock for this order**: the issues made against this order, newest first, with the item, quantity, area and who posted it. The tab shows how many there are.
- An **Issue** button, for people who may move stock, while the order is open.

## How to issue stock to the order
1. Open the **Stock** tab.
2. Click **Issue**.
3. Pick the item, the area it comes from and the quantity. The order is filled in already.
4. Post it. The new issue appears in the list.

## Good to know
- Receipts and transfers do not name an order, so they are not listed here. See Stores › Movements for them.
- When nothing has gone to the order yet, the tab says *Nothing has been issued to this order yet.*
- A closed, lost or cancelled order cannot take new issues.
- The tab is shown to people with the inventory view permission; issuing needs inventory manage.

## Related
- [The order page](help:order-page)
- [Material request](help:order-buying)
