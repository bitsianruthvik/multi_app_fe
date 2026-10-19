---
id: setup-specifications
title: Specifications
area: setup
roles: [design, admin]
routes: ["/:company/cf_erp/specifications"]
order: 10
---
**Setup › Specifications** is the library of characteristics, such as thickness, grade, impact class, weight or length. Each one is defined once here. Rules then attach it to classification branches, definitions and items.

## What you see
- Figures: **Shown**, **Unused** (no rule attaches them yet) and **Pick-lists**.
- Chips by type: Number, Text, Yes / no, Date, Pick-list and Table.
- Columns: **Code**, **Name**, **Type**, **Unit**, **Rules** (how many rules use it), **Values** (how many values are stored) and **Status**.
- **New specification**, and a bin on each row to delete.

## How to add a specification
1. Click **New specification**.
2. Type the **Code** in capitals, digits and _, for example THICKNESS. It is permanent, because formulas and coding rules refer to it.
3. Type the **Name**.
4. Pick the **Data type**: Number, Text, Yes / no, Date, Pick-list or Table.
5. For a number, pick what it **Measures**, the **Unit** (every value is stored in this unit) and the **Decimals shown**.
6. For a pick-list, add each value with **Add an option**, for example E250 BR, E250 BO or E350. Give each a **Label (optional)**. An old option can be set to *Retired* instead of removed.
7. For a table (a chart such as cutting speed by thickness), name each axis, its unit, and how to read **between rows**: *the next row up* or *a straight line* between the two rows.
8. Tick **Can be set for a whole order** if the value can be given once for a whole order (for example the grade).
9. Click **Create** (or **Save** when editing).

## Good to know
- The **Data type** cannot change once values exist.
- **Inactive** keeps existing values but stops new use.
- A specification does nothing until a rule attaches it. Add rules in [Classification](help:catalog-classification) or on a definition.
- Grade and impact class values on plates are what the AI nesting checks against. See [Cutting](help:setup-cutting).

## Related
- [Classification](help:catalog-classification)
- [Value formulas](help:setup-formulas)
- [Coding rules](help:setup-coding-rules)
