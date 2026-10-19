---
id: order-add-line
title: Add a line
area: order
roles: [sales, design]
routes: ["/:company/cf_erp/orders/:id"]
tab: structure
order: 25
---
A line is one thing the customer buys, for example *Composite girder span ×2*. You add lines on **Structure & values** with **Add line**. One button, three ways in.

## The three choices
Press **1**, **2** or **3**, or use the arrows and Enter.
1. **Build from parts**: pick a template (its parts are laid out at once) or a catalog item.
2. **From a standard drawing**: type the drawing number. Its BOM, values and part drawings are copied.
3. **From a new drawing**: upload a DWG or DXF. AI builds the line at once; rows to check are marked.

A stock order only has **Build from parts**, with catalog items.

## How to add a line from a standard drawing
1. Click **Add line**, then **From a standard drawing**.
2. Type the **Drawing number**, for example *B-11753*, and pick it. The helper says what is copied: *Copies version 1: 47 rows with their values and drawings.*
3. Set **Quantity** (identical copies) and, if it differs from the order, **Committed date**.
4. Type the **Rate (₹, before tax)** and pick **Priced**. A custom line is priced *Per tonne (usual)* unless you change it.
5. Add a **Description (optional)** in the customer's words.
6. Click **Add line**.

## How to build from parts
1. Choose **Build from parts** and pick **What it sells**. A template lays its whole Template BOM out as this line's rows; nothing is coded until the design is frozen. A catalog item is a standard line, sold as it is.
2. Fill quantity, date, rate and description as above.
3. For a template, **Upload its drawing (optional)** takes a DXF or PDF. Tick **This is a standard drawing** to also save it under Standard drawings, with its **Standard drawing number**.
4. Click **Add line**.

## How to add a line from a new drawing (AI)
1. Choose **From a new drawing** and click **Choose the drawing (DWG or DXF)**.
2. Fill quantity, date and rate, then click **Build the line**. The button says *AI is reading the drawing…* while it works.
3. The line opens with a banner: *Built by AI from …*, the number of parts and the rows to check. Rows AI was unsure of carry an amber **AI** chip with the reason.
4. Check those rows, then click **Mark all checked**. If the structure is way off, click **Remove line** and build it from parts.

## Good to know
- PDF scans cannot be read by AI yet: upload the DWG or DXF, or build from parts.
- **Other ways** takes you back to the three choices.
- What a line sells cannot change later. To change it, remove the line and add another. Quantity, date and price change with the pencil (**Change quantity, date or price**); after release only the price can change.
- A line cannot move up or down once it is frozen, released or has cut pieces: its number is in their codes.

## Related
- [Structure & values](help:order-structure)
- [Standard drawings](help:sales-standard-drawings)
