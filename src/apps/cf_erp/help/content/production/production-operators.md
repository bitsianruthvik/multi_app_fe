---
id: production-operators
title: Operators
area: production
roles: [production, admin]
routes: ["/:company/cf_erp/operators"]
order: 50
---
The people who pick their name on the machine tablet. There are no passwords — the tablet stays signed in, and the operator taps their name. The production manager keeps this list.

## What you see
- Columns: **Name**, **Usual machines**, **Status**; hidden: **Code**.
- The pencil edits a person; the bin deletes one.

## How to add an operator
1. Click **New operator**.
2. Type the **Name** — as people know them. This is the button they tap.
3. Pick **Usual machines** (optional). They are listed first when this person picks their name at those machines.
4. Leave **Status** active and save.

## How to handle someone who left
1. Click the pencil and set **Status** to inactive. Inactive people are not offered at the machine.
2. Delete only a name added by mistake. Past entries keep their name either way.

## Good to know
- Adding and changing operators needs the production manage permission.
- If the tablet says "No operators yet", nobody has been added here.

## Related
- [Machine log](help:production-floor)
- [Stop reasons](help:production-stop-reasons)
