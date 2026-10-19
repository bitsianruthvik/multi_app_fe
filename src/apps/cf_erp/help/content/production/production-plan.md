---
id: production-plan
title: Plan by month (what ships when)
area: production
roles: [production, management]
routes: ["/:company/cf_erp/plan"]
order: 25
---
What ships when, this month and the next two. Management and the production manager use it to set monthly goals in tonnes and move whole units (girder lines, segments) between weeks. The step-by-step machine plan is the Planner.

## What you see
- The scoreboard: each month's goal in tonnes and the progress towards it. Click a goal to change it.
- The plan as a tree: order › line › the units it schedules › what is inside them, with the weeks to the right. Use the level menu, **Collapse to orders** / **Expand everything**.
- The machine-area usage at the bottom; click a bar there to light up its units.
- "N cards wait for stock" at the top when material is not in yet.

## How to move work
1. Drag a bar to another week, or drag its left edge to stretch it.
2. Drag a unit's grip to change its place in its line.
3. Shift- or Ctrl-click to pick several and move them together, or use the arrow keys.
4. Every move is scored at once; warnings show beside the pointer.
5. **Undo** (Ctrl+Z) and **Redo** (Ctrl+Y) step through your moves.
6. Click **Save**, or **Discard** to drop them. Nothing is stored until you save.

## How to let the system suggest a plan
1. Click **Auto-plan**.
2. A banner says **Here is the suggested plan** and lists the changes (or "Nothing would change.").
3. Click **Apply** to take it into your unsaved plan, or **Discard**. Then **Save**.

## Good to know
- If material does not allow a move, saving is refused: "Not saved — the material does not allow it yet. The cards were put back."
- A blue note asks you to tick **Ships as one unit** on the template that leaves the gate (for example Girder segment) in Definitions, so lines can be counted as shipped.
- Editing needs the production manage permission.

## Related
- [Planner](help:production-planner)
- [Production orders](help:production-orders)
