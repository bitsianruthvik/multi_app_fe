---
id: production-flow
title: A flow — steps, lanes and waits
area: production
roles: [production, design, admin]
routes: ["/:company/cf_erp/flows/:id"]
order: 81
---
One flow: its steps in lanes, what each waits for, how long each takes, and what is made by it.

## What you see
- The header with **Revision**, **Steps**, **Waits** and **Made by it**.
- Tabs: **Steps** and **Made by it** (catalog items and templates usually made this way; order rows are shown on each order).
- **Steps** reads top to bottom. Steps side by side are lanes and run at the same time: inside a lane a step waits for the one above it; where lanes meet, the step waits for the last step of each. A piece waits for all its child pieces, unless a wait rule on a step names which children.

## How to change the steps
1. Click **Edit steps**. Nothing changes until you save.
2. Point at a gap for **Add**, **Split** (open a lane beside) or **Merge** (lanes meet). Drag a step by its handle, or use its arrows, to move it.
3. Replace or remove a step from its card. Removed steps show **Removed** until you save.
4. **Undo** takes back the last change; **Cancel** drops the draft.
5. Click **Save**. Every lane you open must meet another again. Saving re-checks every definition and open order row made by this flow.

## Other actions
- **Activate** (a draft, once it has steps), **Mark obsolete**, **New revision**, **Edit details**, and the bin (refused while anything is made by it).

## Good to know
- An operation's time saves on its own — it belongs to the operation, not to the flow.
- When a step's operation is replaced, time overrides and contractor assignments of orders not yet released move to the new operation; released steps keep theirs.

## Related
- [Flows](help:production-flows)
- [An operation](help:production-operation)
