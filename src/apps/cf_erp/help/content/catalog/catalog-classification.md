---
id: catalog-classification
title: Classification
area: catalog
roles: [design, admin]
routes: ["/:company/cf_erp/items", "/:company/cf_erp/definitions", "/:company/cf_erp/classification"]
order: 50
---
The classification is the family tree everything is filed in: **Family › Subfamily › Variant**. Rules set on a branch decide which specifications the items and definitions under it must carry. Click **Classification** on the Items or Definitions screen to open it. The old Setup › Classification link lands on Items with it open.

## What you see
- On the left, the tree, with **Search the classification**, **Expand all** and **Collapse all**. Each screen shows its own part: Items shows the branches that hold items; Definitions shows those that hold definitions and every branch a selection picks from.
- On the right, the chosen branch: its level, name, code, path, and *Holds…*. Buttons: **Add (next level)**, **Rename**, **Move to…** and **Retire**.
- **Specification rules set here**, with **Add rule**, and **Everything that reaches this node**: the rules from this branch and above, merged, where you set default values.

## How to add a branch
1. Choose the parent on the left, for example a Family.
2. Click **Add subfamily** (or **Add variant**).
3. Type the **Code** (used in generated codes) and the **Name**. Choose **Offered for** (Items and definitions, Items, or Definitions) and the **Status** (Active, or Inactive — hidden from pickers).
4. Click **Create**.

## How to make every plate carry thickness and grade
1. Choose the plate branch.
2. Click **Add rule** and pick the **Specification**, for example THICKNESS. A missing one can be made with **New specification**.
3. Choose **Captured at**: Item, Batch or Individual unit.
4. Choose **How the value is obtained**:
   - **Entered**: typed in on each item.
   - **Fixed**: one value set here or above; items cannot change it.
   - **Defaulted**: items start with it and may override it.
   - **Calculated**: worked out by a **Formula** from the item's other values.
   - **Roll-up**: added up from BOM children.
   - **Inherited**: taken from the BOM parent, for example a web takes its girder's grade.
5. Click **Add rule**.
6. In **Everything that reaches this node**, type the defaults. They take effect wherever a rule is Fixed or Defaulted, and everything below is updated.

## Good to know
- Rules apply to everything below the branch. A lower level can override a rule or switch it off.
- A branch moves only while it is empty — re-file what is in it first.
- **Retire** removes the branch from every screen, with its own rules and defaults.
- New items can be filed only on a Variant.

## Related
- [Specifications](help:setup-specifications)
- [Value formulas](help:setup-formulas)
- [Items](help:catalog-items)
