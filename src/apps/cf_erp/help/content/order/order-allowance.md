---
id: order-allowance
title: Cutting allowance
area: order
roles: [design, sales]
routes: ["/:company/cf_erp/orders/:id"]
tab: allowance
order: 96
---
A cutting allowance cuts parts a little long, for welding shrinkage and trimming. Only the cut pieces get longer; the order weight stays as drawn. The allowance comes from the customer and can be changed for one order or one row. The design engineer checks it before freezing.

## What you see
- One row per plate part name on this order (for example *Web*, *Top flange*), with the allowance in force and where it comes from, or *Cut as drawn*.
- **Override** (or **Change** when the order already has its own) on each part name.
- **Rows with their own allowance**, each with **Change**.

## How to set an allowance for this order
1. Open the **Cutting allowance** tab.
2. Click **Override** beside the part name.
3. Type **mm at each end** (added at both ends) and, if needed, **mm a metre (optional)** (added for every metre of length).
4. Click **Save**. The cut pieces are worked out again.
5. To go back to the customer's figure, click **Change** and then **Use the customer's**.

## Good to know
- Every order of a customer starts from the allowance on their record (Customers › the customer › Cutting allowance). An override here applies to this order only.
- A frozen line keeps its cut pieces as they are. A change reaches it only through a revision of the order.
- The tab shows on customer orders with a built structure. Changes need the orders permission.
- An order with no customer has nothing to inherit; set an allowance here (the button is then **Remove**).

## Related
- [Customers, suppliers and contractors](help:sales-parties)
- [Freeze design](help:order-lock)
- [Nesting](help:order-nesting)
