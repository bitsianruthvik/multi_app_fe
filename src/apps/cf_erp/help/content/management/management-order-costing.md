---
id: management-order-costing
title: Order costing
area: management
roles: [management, accounts, admin]
routes: ["/:company/cf_erp/order-costing"]
order: 40
---
**Accounts › Order costing** shows the margin of every accepted order. The margin is what the order has been charged so far, less the material and consumables it used, plus credits for scrap and offcuts. Management and Accounts read it.

## What you see
- A line of totals for **All orders**: charged, material, consumables, credits and margin. It also shows the general (overhead) issues this month.
- One row per order whose customer acceptance is approved. The columns are **Order**, **Customer**, **Charged so far**, **Material**, **Consumables**, **Credits**, **Not costed** and **Margin** (with a coloured %). Use the column menu to show the hidden ones: **Contract**, **Contractor**, **Scrap / offcuts** (kg) and **Scrap charged**.
- **Search orders** and a full-screen button.

## How to read one order's cost sheet
1. Click the order's row (not its code, which opens the order). The **Cost sheet** opens.
2. The top block reads like a sum:
   - **Charged so far**: what the order has earned by its charges and milestones.
   - **− Material issued (at cost)**
   - **− Consumables issued**
   - **− Contractor work (later)**
   - **+ Credits: scrap and offcuts**
   - **= Margin**, in ₹ and %.
3. The small line under it shows the contract value, what was invoiced and what was received.
4. **What is charged so far** lists each charge, for example tonnes fabricated out of the total.
5. **Scrap and offcuts** shows the scrap kg and its value, the offcut lots kept and their value, and what the acceptance charges the customer for them.
6. **Items** lists every item used: Material, Consumable, the Customer's (₹0), Scrap (credit) and Offcut (credit).

## Good to know
- An order appears only once its customer acceptance is approved.
- The material share counts for the work done or dispatched, even when the order is billed on dispatch.
- Offcuts kept from the order's plates are credited at their value, even while they still sit in the WIP area.
- **Not costed** counts figures valued at nothing because a rate is missing. The sheet says what is missing and links to the fix. Scrap shows *not costed* until a **Scrap rate (₹/kg)** is set in [Cutting](help:setup-cutting). Stock rows with no cost are left out, and the sheet says how many.
- The customer's own material is used at ₹0.

## Related
- [Billing](help:accounts-billing)
- [Receipts](help:accounts-receipts)
- [Cutting setup](help:setup-cutting)
