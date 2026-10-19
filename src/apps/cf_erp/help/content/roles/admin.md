---
id: admin
title: Getting started as Admin
area: roles
roles: [admin]
routes: []
order: 90
---
This guide is for the person who sets CF_ERP up for the company and keeps it in shape. You build the catalog's foundations, the codes, the tax setup and the cutting rules that everyone else works on. Users, roles and permissions are managed in the platform's admin screens, not inside CF_ERP.

## Your path through setup
Home has a **Setup** card listing these steps in order, with a tick when each has something in it. Click a row to go there.

1. **Classification**: open **Catalog › Items** and click **Classification**. Build the tree: Family › Subfamily › Variant, for example Plates › Structural plates › E250 BR. See [Classification](help:catalog-classification).
2. **Specifications**: in **Setup › Specifications**, add the characteristics — THICKNESS, GRADE, IMPACT_CLASS, LENGTH, WIDTH, WEIGHT. Use pick-lists for grades. See [Specifications](help:setup-specifications).
3. **Rules**: back in Classification, add rules on each branch so every item there carries the right specifications. Set defaults where a value is the same for the whole branch.
4. **Value formulas**: in **Setup › Value formulas**, add the formulas such as plate weight, and roll-ups such as girder weight. Use them in *Calculated* and *Roll-up* rules. See [Value formulas](help:setup-formulas).
5. **Coding rules**: in **Setup › Coding rules**, decide how items, orders, batches and documents are numbered. Test each rule on a real record before activating items. See [Coding rules](help:setup-coding-rules).
6. **Catalog items**: add the raw material and bought-out items. Set **Tracked by** (plates by batch for heat numbers), **Comes from**, HSN and GST, and the **Procurement** method. See [Items](help:catalog-items) and [One item](help:catalog-item-detail).
7. **Definitions**: add the templates the designers use on orders (girder, web, flange, stiffener) and the selections (studs, bolts). Set **Cut from** and the flow on each template. See [Definitions](help:catalog-definitions).

## Then the company settings
1. [Company tax details](help:accounts-company-tax): legal name, GSTIN, address, invoice prefix, GST rates, and HSN / GST by family.
2. [Cutting](help:setup-cutting): where cut pieces, raw stock and offcuts are filed; saw kerf; the scrap rate; the shop's nesting habits; and the plate rules (grade and impact class — exact by default — and custom plate sizes within the mill's limits).
3. Production setup (machines, shifts, operations, flows) and Sales setup (processes, templates) have their own guides.

## Keeping it clean
- On Home, **Drafts to finish** lists items and definitions left as drafts.
- On Items, **Without a code** shows items that cannot be activated.
- **Specifications** shows **Unused** ones, and **Value formulas** shows **Unused** formulas.
- Use **Mark obsolete** rather than delete. Delete is refused while anything uses a record.

## Approvals and testing
- Each approval kind is its own permission. Give Management only the kinds each person should decide.
- Four eyes is the rule: nobody approves their own request, except an admin. For testing, a company setting ("approve own requests") lets one login approve its own requests. It is set in the database, not on a screen. Switch it off before going live.

## Related
- [Home](help:home-cockpit)
- [Search and moving around](help:home-search-and-nav)
- [Approvals](help:management-approvals)
