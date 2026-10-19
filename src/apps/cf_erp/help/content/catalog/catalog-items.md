---
id: catalog-items
title: Items
area: catalog
roles: [design, stores, purchase, sales, admin]
routes: ["/:company/cf_erp/items"]
order: 10
---
**Catalog › Items** lists the real things that are bought, made, stored and issued: plates, angles, studs, paint, consumables and finished girders kept in stock. What an order makes only for itself lives on the order, as a *temporary* item made from a template.

## What you see
- Figures: **Matching**, **Active**, **Draft** (not usable yet) and **Without a code** (cannot be activated).
- **Search code or name**, the chips **All**, **Catalog** and **Temporary (one order)**, and the status chips **Any status**, **Draft**, **Active** and **Obsolete**.
- Columns: **Code**, **Name**, **Kind**, **Classification**, **BOM** and **Status**. The column menu adds **Short name**, **Tracked by**, **Comes from** and **Rev**.
- Buttons: **Classification** (the family tree, see [Classification](help:catalog-classification)) and **New item**.
- On each row, a copy icon: **Make a similar one**.

## How to add an item
1. Click **New item**. The dialog **New catalog item** opens. Nothing is saved until you create it.
2. Pick its classification Variant. That decides which specifications it must carry. If the Variant is not there, create it from the list.
3. Leave **Name** and **Code** empty to use the naming and coding rules. The dialog previews *Code it will get* and *Name it will get*.
4. Choose **Tracked by**: Quantity (a total only), Batch (separate balances per batch, such as heat numbers) or Individual unit.
5. Type the **Unit of measure** (nos, kg, m…).
6. Choose **Comes from**: **Stock** (always drawn from stock), **Made on the order** (needs a flow) or **Either — stock first**.
7. Fill in the specification values asked for.
8. Click **Create and activate**, or **Save as draft** if values are still missing. The dialog lists what is *Required before activating*.

## How to copy one
Click the copy icon on a row (or **Make a similar one** on the item). The values are copied; the name and code are generated new.

## Good to know
- A draft cannot be used on orders or stock until it is activated, and it cannot be activated without a code.
- The code is fixed once the item is active.
- Temporary items are made by templates on an order. You do not create them here.

## Related
- [One item](help:catalog-item-detail)
- [Definitions](help:catalog-definitions)
- [Coding rules](help:setup-coding-rules)
- [Specifications](help:setup-specifications)
