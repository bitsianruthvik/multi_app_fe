---
id: setup-cutting
title: Cutting and AI nesting rules
area: setup
roles: [design, production, admin]
routes: ["/:company/cf_erp/cutting"]
order: 40
---
**Setup › Cutting** says where cut pieces, raw stock and offcuts are filed, how a section is sawn, what scrap is worth, and the rules the AI nesting follows: the shop's spacing, grade and impact class, and plate sizes.

## What you see
- **Plate** and **Section** cards: **Cut pieces are filed under**, **Raw stock is under**, **Offcuts are filed under**, and **Flow for new cut pieces**.
- **Sawing a section**: **Saw kerf (mm)** (the width of the cut, lost at every cut), **End trim (mm)** (cut off each end of a bar before the first piece), and **Smallest offcut kept (mm)** (a shorter leftover is scrap, not stock). Click **Save cutting setup**.
- **Scrap rate (₹/kg)**.
- **AI nesting — the shop's cutting habits**.
- **AI nesting — grade, impact class and custom plate sizes**.

## Scrap rate
Type the **₹ per kg** and click **Save scrap rate**. Leave it empty if it is not decided; scrap is then valued at 0 and shows *not costed* in [Order costing](help:management-order-costing). Setting it needs the inventory manage permission.

## The shop's cutting habits
- The defaults come from the shop's ProNest files. Kerf is 3 / 4 / 5 mm for 10–16 / 20–25 / 36–45 mm plate, with 5 mm from the plate edge, 5 mm between parts, 13 mm between shared-line blocks, and leads of 6 mm in and 2 mm out.
- Switch on **Use the shop's spacing in AI nesting**. When it is off, the nesting uses one kerf at the edge and 5–8 mm between sequences.
- **Plate sizes per thickness, at most**: how many plate sizes the AI may buy per thickness. Blank = 2; 0 = no limit.
- To change one thickness, click **Add a thickness**. Type the thickness and only the fields that differ: Part gap, Block gap, Lead-in, Lead-out, Hole arc, CL in, CL out, and **Free turn °** (blank = only 0 / 90 / 180 / 270). A blank field keeps the default.
- Click **Save shop habits**.

## Grade, impact class and custom plate sizes
1. **Which plate may carry a piece**:
   - **Default — exact**: the plate must have exactly the grade and impact class the piece asks for. BR and BO never stand in for each other.
   - **Warn only (never refuse)**: mismatches are shown but nothing is refused.
   - **Refuse: the piece's grade; its impact class or a better one**: for example a BR piece may go on a BO plate, never the other way. The order is A < BR < BO / B0 < C.
   - **Refuse: a higher grade of the same family may stand in**: for example E350 for E250, with an equal or better impact class.
2. Switch on **Let the AI propose a custom plate size (one per steel) when it saves steel** if the mill can roll to size. Off means catalog sizes only.
3. Type the mill's limits: **Longest**, **Widest**, **Shortest**, **Narrowest** and **Step** (mm). Blank = the catalog's own range for that thickness.
4. Click **Save plate rules**.

## Good to know
- A custom size is added to the catalog only when someone uses that nesting.
- Which parts are cut from a plate or a section is set on each definition (**Cut from**), not here.
- Changing the cutting setup and nesting rules needs the catalog manage permission.

## Related
- [One definition](help:catalog-definition-detail)
- [Order costing](help:management-order-costing)
