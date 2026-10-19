---
id: order-material
title: Customer material
area: order
roles: [stores, sales, accounts]
routes: ["/:company/cf_erp/orders/:id"]
tab: material
order: 95
---
When the customer sends the steel, it stays theirs. The **Customer material** tab records what they sent for this order, what was used, and what is owed back to them: offcuts as the actual pieces, scrap by weight. Stores uses it; sales and accounts read it.

## What you see
- **Customer material**: *What (customer) sent for this order. It is theirs — it is not in our stock value and costs us nothing.*
- Totals, including **With us** (their stock still on our shelves) and **Owed back** (offcuts and scrap still with us).
- **By item**: received, less used, scrapped and returned, is what is still with us.
- **Offcuts and scrap**: their offcut pieces and their scrap.
- **Receive material** and **Return to customer**.

## How to receive their material
1. Click **Receive material**.
2. Pick the **Item** (for example the plate), the **Quantity**, the **Batch / plate number** as they marked it, and **Into** (the storage area).
3. Add a **Reference value per unit (₹, optional)**, the values the item asks for (those marked * are needed) and **Their delivery note (optional)**.
4. Click **Receive**.

## How to give material back
1. Click **Return to customer**.
2. Tick the **Offcut pieces** that go back (or **Select all**).
3. Type the **Scrap handed back (kg)**. The helper shows how much scrap is with us now.
4. Tick any of **Their lots on our shelves** that go back and set the quantity.
5. Add a **Note (optional)** and click **Return**.

## Good to know
- Choose **Customer supplies** under **Material** on the order (or a line) when the customer sends the steel. Raising the MR then makes a ₹0 purchase order to them.
- The tab shows only on customer orders, to people with the inventory view permission.

## Related
- [Material request](help:order-buying)
- [New order](help:sales-new-order)
