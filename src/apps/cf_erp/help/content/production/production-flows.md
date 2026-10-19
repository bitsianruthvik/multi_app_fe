---
id: production-flows
title: Flows
area: production
roles: [production, design, admin]
routes: ["/:company/cf_erp/flows"]
order: 80
---
A flow is the usual way to make something: operations in order, with what each step waits for. Items and templates name their flow; a BOM line can name another for one parent. Release refuses a row with no flow, so every made row needs one.

## What you see
- **Cut plates** card: **Cut plates are made by** — the flow every new cut plate gets. Pick one and **Save**. A cut plate that already has a flow keeps it.
- Figures: **Flows**, **Active**, **Drafts** (nothing can be made by a draft flow) and **Unused** (no item, template or BOM line names it).
- Status chips **All**, **Active**, **Drafts**, **Obsolete**, a **Contains operation…** filter and a search.
- Columns: **Code**, **Name**, **Steps in order** (steps that run alongside show with "+"), **Revision**, **Steps**, **Used by**, **Status**.

## How to make a flow
1. Click **New flow**. Type the **Code** (e.g. PLATE-PART), **Name** and **Description**, click **Create**. It starts as a draft.
2. On its page click **Edit steps**, add the operations in the order the work is done, then **Save**.
3. Click **Activate**.

## Good to know
- If the cut-plate flow is still a draft, activate it before a line is released.
- Changing flows needs the production manage permission.

## Related
- [A flow](help:production-flow)
- [Operations](help:production-operations)
