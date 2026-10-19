---
id: setup-formulas
title: Value formulas
area: setup
roles: [design, admin]
routes: ["/:company/cf_erp/formulas"]
order: 20
---
**Setup › Value formulas** holds reusable expressions that work out values, for example a plate's weight from length × width × thickness × density, or a girder's weight added up from its parts. Changing a formula recalculates every item that uses it.

## What you see
- Figures: **Shown**, **In use** and **Unused** (no rule uses it yet).
- Chips: **All**, **Value** and **Roll-up**.
  - **Value** reads the same record's values. It is used by *Calculated* rules.
  - **Roll-up** adds up the BOM children. It is used by *Roll-up* rules.
- Columns: **Code**, **Name**, **Expression**, **Kind**, **Version**, **Used by** and **Status**.
- **New formula**, and a bin on each row to delete.

## How to add a formula
1. Click **New formula**.
2. Type the **Code**, for example PLATE_WEIGHT, and the **Name**.
3. Build the **Expression** from the specification codes and operators the editor offers.
4. Under **Try it**, type sample values and check the result.
5. Add a **Description** and click **Create** (or **Save** when editing).
6. Use it: in [Classification](help:catalog-classification) or on a definition, add a rule with **How the value is obtained** set to *Calculated* (or *Roll-up*) and pick this **Formula**.

## Good to know
- Editing the expression makes a new version (v1 → v2), and the items using it are worked out again.
- **Inactive** stops new use.
- Operation times are not set here. They are typed on the operation's timing rule under Production › Operations.

## Related
- [Specifications](help:setup-specifications)
- [Classification](help:catalog-classification)
