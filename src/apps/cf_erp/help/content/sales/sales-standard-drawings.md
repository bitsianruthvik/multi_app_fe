---
id: sales-standard-drawings
title: Standard drawings
area: sales
roles: [sales, design]
routes: ["/:company/cf_erp/standard-drawings", "/:company/cf_erp/standard-drawings/:id"]
order: 40
---
Standard drawings are the drawings you build again and again, for example an RDSO girder span. Each one keeps its BOM, its values and its part drawings, so a new order line can copy it in one step. You find them under **Catalog › Standard drawings**. Sales and design use them.

## What you see on the list
- **Find by number or name**.
- The table: **Drawing** (number, *rev*, name, and an **Internal only** badge for RDSO property that must stay inside the company), **Span / description**, **Version** (or **No BOM yet**), **Parts**, **Weight**, **Drawings**, **Used on** (how many order lines) and **Source** (a link to the sheet).

## What you see on one standard
- The header: rows, parts, weight, part drawings, the sheet, the source and **Made from** (*Imported* or *An order line*). When there is more than one version, a **Version** picker shows them; the current one is marked *(current)*.
- **BOM and values**: every row with its **Mark**, **Qty**, **Per standard**, **T × W × L (mm)**, **Grade**, **Weight each** and a **View** button for its drawing. A row marked **To choose** is a selection: its catalog item is chosen on the order. A *Note:* line under a row is worth reading.
- **Drawings**: the sheet and each part drawing, with size and holes. **View** opens the drawing viewer.
- **Used on**: the order lines made from it, each with the version it copied.

## How to add a standard drawing
1. Click **New standard**.
2. Type the **Drawing number** as written on the sheet, the **Revision** and a **Name**.
3. Add a **Link to the sheet (optional)** or click **Attach the drawing (DXF or PDF)**.
4. Under **Who may see it**, choose **Internal only (not to be shared outside)** for RDSO drawings.
5. Click **Add standard**.
6. The BOM comes from an order line: build the line, fill its BOM and values, then on the line choose **Save this BOM to the standard**.

## How to use one on an order
On the order, **Add line › From a standard drawing**, then type its number. See [Add a line](help:order-add-line).

## Good to know
- A version never changes. Saving a line's changed BOM onto a standard makes its next version; the lines made earlier keep their own copy.
- A standard with **No BOM yet** cannot be added to an order.
- Adding standards needs the orders permission.

## Related
- [Add a line](help:order-add-line)
- [Structure & values](help:order-structure)
