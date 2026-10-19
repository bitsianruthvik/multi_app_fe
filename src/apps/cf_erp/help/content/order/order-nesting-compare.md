---
id: order-nesting-compare
title: Compare with AI, grades and custom plates
area: order
roles: [design, purchase, management]
routes: ["/:company/cf_erp/orders/:id"]
tab: nesting
order: 55
---
When a line's nesting came from uploaded files, AI nests the same pieces too and keeps its result beside them. The **Compare with AI** tab puts the two side by side, so you can see whether AI's plates would save steel, and make AI's the main nesting if they do.

## What you see
- Two tabs on Nesting: **Nesting** and **Compare with AI** (only once a nesting was uploaded).
- **The customer's nesting beside AI's**: a table of figures (plates, steel bought, net steel with offcuts kept, waste and more) with columns **Customer's**, **By AI** and **AI vs customer**.
- A badge: *The customer's nesting is the main one* or *AI's nesting is the main one*.
- **Grade and impact class**: whether each side's plates match the pieces.
- **By thickness**, and **The plates**: open a plate to see its drawing.
- **Run AI again** when you want a fresh AI run.

## How to make AI's nesting the main one
1. Open **Compare with AI** and read the figures.
2. Click **Make AI's nesting the main one**.
3. The confirm box lists what changes: plates, steel bought, net steel, plate sizes, pieces left over and any custom sizes.
4. Click **Make it the main one**.
5. To go back, click **Switch back to the customer's nesting** and confirm **Switch back**.

## Grade and impact class
- A piece is nested only on a plate of its grade and impact class. The default rule is exact: a BO piece is never put on a BR plate, nor a BR piece on a BO plate.
- The badge says **Matches**, **N mismatches** or **Impact class not stated** (the plate's code does not say its class). Hover it for the list.
- An upload with a piece on the wrong class is refused with the piece, the plate and the classes named. Nest it on a plate of that class or name another plate.
- The rule is set in Setup › Cutting. **Warn only (never refuse)** shows mismatches without refusing.

## Custom plate sizes
When Setup › Cutting allows it, AI may propose one custom plate size per steel that saves steel. Such a plate shows **Custom size — not in the catalog yet**; it is added to the catalog when that nesting is used.

## Good to know
- The customer's nesting is kept when AI's becomes the main one. You can switch back until the line has a production order.
- If a purchase order already covers the line, the confirm box says so. The swap changes the plates the line needs (and may go to the MD for approval first); the buyer changes the PO by hand.
- When the two sides do not hold the same pieces, the tab warns you to read the figures with care.

## Related
- [Nesting](help:order-nesting)
- [Material request](help:order-buying)
