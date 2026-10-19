---
id: catalog-definition-detail
title: One definition
area: catalog
roles: [design, admin]
routes: ["/:company/cf_erp/definitions/:id"]
order: 40
---
One template or selection: what its items will carry, what it picks from, and its details.

## What you see
- The header: its short code and name, the status, and **Activate**, **Mark obsolete**, **New revision**, **Make a similar one**, **Edit** and **Delete**.
- Facts: Revision, Comes from, Made by, Cut from, **Picks from** (selections) and **Items created** (templates).
- Tabs: **Specifications**, **Selection** (selections only), **BOM** (for a selection: **Where used**), **History** and **Details**.

## A template
1. **Specifications** tab, **What its items will carry**: the rules from its classification plus its own. Values typed here are defaults for the items it creates.
2. **Rules this definition adds**: click **Add specification** to add a rule every item it creates must capture.
3. **BOM**: what each item made from it is built of.
4. **Details**: set **HSN / SAC** and **GST rate**, **Cut from** (plate or section, and the stock bar), and **Usually made by** (the flow). Click **Save details**.
5. **Procurement** (on Details): the method its items follow, unless an item overrides it.

## A selection
1. Open the **Selection** tab.
2. Under **Picks from**, add a branch with **Add branch** (everything filed under it) or a single item with **Add item**. Click the star on one entry to make it the default choice.
3. Optionally add **Spec filters**, for example THICKNESS ≥ 10. Filters on one specification are OR'ed; filters on different specifications must all match.
4. **Resolves to now** lists the active catalog items it would offer today, default first.

## Good to know
- Once an order line using it is frozen or released, its structure and values are fixed. A badge says why.
- Delete is refused while anything uses it. Mark it obsolete instead.

## Related
- [Definitions](help:catalog-definitions)
- [Classification](help:catalog-classification)
- [Specifications](help:setup-specifications)
