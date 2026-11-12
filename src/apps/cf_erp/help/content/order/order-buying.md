---
id: order-buying
title: Material required
area: order
roles: [sales, design, stores, purchase]
routes: ["/:company/cf_erp/orders/:id"]
tab: buying
order: 60
---
Material required shows what the order needs (plates, sections, studs, consumables) and what the stores have of each item now. From here the material request (MR) is created and sent to Stores, once the customer has accepted and the MD has accepted the order.

## What you see
- One row per item: **Item**, the **Lines** that need it, **Needed**, **In store** and **Short** (in red when the store does not cover it).
- A badge saying what the MR waits for: *Waiting for the customer's acceptance* or *Waiting for the MD to accept the order*.
- **Download required materials**: an Excel file with every item, and a second sheet by line.
- **Create material request**: enabled once the order is confirmed. Hover over it to see why it is not yet.
- Once raised: one row per MR with its code, line, status, how much is locked and its purchase request; **MR as PDF**, **MR as Excel** and **Open in Stores**.
- For a line with no MR yet: its **Material** picker (**As the order**, **We buy**, **Customer supplies**) and **Create for this line**, or the reason it cannot be raised yet.

## How to create the material request
1. Freeze the design and save the nesting. Until then the items are not known yet, and the screen says so.
2. Mark the customer's acceptance with **Customer accepted** on the order. The MD then accepts the order.
3. Check **Material** for each line.
4. Click **Create material request**. If a line's material comes from the customer, the app asks **Promised by**: production waits for that date.
5. Stores take what is in stock and raise the purchase request for the rest.

## Good to know
- **In store** is free stock: not earmarked for anything else. The customer's own material for this order counts too. Looking at it holds nothing.
- Locked means earmarked for this order; nobody else can use it.
- With **Customer supplies**, the MR makes a purchase order to the customer at ₹0, and what arrives is kept as their stock.
- Who supplies the material can change until an MR is with Purchase.
- If the line's need changes after the MR was raised (for example after a new nesting), saving the MR in Stores brings it up to date.
- Creating the MR needs the orders manage permission (Sales) or the inventory manage permission (Stores); seeing it needs orders view or inventory view.

## Related
- [Nesting](help:order-nesting)
- [Customer accepted](help:order-acceptance)
- [Customer material](help:order-material)
