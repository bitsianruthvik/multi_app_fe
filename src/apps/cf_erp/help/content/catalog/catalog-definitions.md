---
id: catalog-definitions
title: Definitions (templates and selections)
area: catalog
roles: [design, sales, admin]
routes: ["/:company/cf_erp/definitions"]
order: 30
---
**Catalog › Definitions** holds the blueprints used while designing an order. A **template** creates order-specific (temporary) items, such as a girder, a web plate or a diaphragm made for one order. A **selection** picks an existing catalog item, such as a stud of the right size or a bolt grade.

## What you see
- The same layout as Items: figures, **Search code or name**, the chips **All**, **Templates** and **Selections**, and the status chips.
- Columns: **Code**, **Name**, **Kind**, **Classification**, **Picks from** (for selections: Items, Branches, or Branches + items), **BOM** and **Status**.
- Buttons: **Classification** and **New definition**.

## How to add a definition
1. Click **New definition**.
2. Choose **Template — creates order-specific items** or **Selection — picks a catalog item**.
3. Pick its classification Variant. Leave **Name** empty to use the naming rule.
4. Fill in **Short name**, which codes are built from.
5. Click **Create and activate** or **Save as draft**.
6. After creating a template, add the specification rules every item it creates must capture, and any defaults. After creating a selection, fill in what it picks from; it can be activated once it has entries.

## How temporary items work
- When a designer adds a template to an order line, the template makes a *temporary* item for that order. It sits where its template sits in the classification and carries the template's rules, defaults, HSN and GST rate.
- Its pieces get their codes when the line's design is frozen.
- On the Items list, the **Temporary (one order)** chip shows them.

## Good to know
- Rules on a definition override the classification's rules for the same specification.
- A template's **Procurement** card (Details tab) sets how its items are procured unless an item sets its own.
- Set HSN and GST on templates. Invoices for made parts read the template's.

## Related
- [One definition](help:catalog-definition-detail)
- [Items](help:catalog-items)
- [Classification](help:catalog-classification)
