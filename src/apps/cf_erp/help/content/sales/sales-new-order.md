---
id: sales-new-order
title: New order
area: sales
roles: [sales, management]
routes: ["/:company/cf_erp/orders"]
order: 15
---
The **New order** dialog creates a sales order. A customer order starts as an inquiry; a stock order starts as a draft. Sales opens it from **Orders › New order**.

## What you see
- **Customer order / Stock order**: pick the kind first. A stock order makes catalog items only and has no customer.
- **Customer**: search by code or name. **New customer** next to it opens the customer form, so you can add one without leaving the dialog.
- **Project title** (for example *ROB at km 60*).
- **Customer's reference**: their PO or letter number.
- **Committed date**: the date you promised. It is needed before the order can be confirmed.
- **Material**: **We buy** or **Customer supplies**.
- **Values for the whole order** (customer orders only): coats, grade, impact class and the other values your setup marks "Can be set for a whole order".
- **Order number (optional)**.

## How to create a customer order
1. Keep **Customer order** selected.
2. Pick the **Customer**, or click **New customer** and fill the form.
3. Type the **Project title** and the **Customer's reference**.
4. Set the **Committed date**.
5. Choose **Material**: **We buy** when we earmark our stock and buy the rest; **Customer supplies** when the customer sends the steel.
6. Check **Values for the whole order**. They are filled in from your last order ("As on SO…") or from what the templates use. Change only what differs, for example the impact class (BO or BR).
7. Leave **Order number** empty to take the next number, or type one.
8. Click **Create order**.

## Good to know
- **Create order** stays grey until a customer is picked.
- With **Customer supplies**, raising the material request makes a purchase order to the customer at ₹0, and what arrives is kept as *their* stock, not ours.
- **Material** can still change until the material request is raised, and each line can differ later on the Material request step.
- Every line takes the order's values. A line, or a single row, can still have its own value. A row's own value wins, then the line's, then the order's.
- The order number can be changed on the **Details** tab until the first line is added. After that it is fixed, because item codes are built from it.

## Related
- [Orders](help:sales-orders)
- [Customers, suppliers and contractors](help:sales-parties)
- [Values for the whole order](help:order-values)
- [Structure & values](help:order-structure)
