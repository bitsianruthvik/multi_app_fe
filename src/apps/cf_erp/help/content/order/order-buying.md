---
id: order-buying
title: Material request
area: order
roles: [sales, design, stores, purchase]
routes: ["/:company/cf_erp/orders/:id"]
tab: buying
order: 60
---
The material request (MR) is the material the order uses but does not make: plates, sections, studs, consumables. It is raised from what nesting says the lines need, for the whole order at once. It goes to Stores: Stores take what is in stock and raise the purchase request for the rest. For a customer order it is raised before the customer accepts, and shared with them.

## What you see
- **Raise MR** (or **Raise MR for the other lines** once some lines have one).
- One row per MR: its code (for example *MR-SO260014-1*), the line, **Customer supplies** when the customer sends the steel, **Shared — waits for the acceptance**, its status, how much is locked, and its purchase request when there is one.
- **Share as PDF** and **Share as Excel**, to send the MR to the customer.
- **Open in Stores**: the MR inbox, filtered to this order.
- For each line without an MR: *Line N has no material request yet*, a **Material** picker (**As the order**, **We buy**, **Customer supplies**) and **Raise MR**, or the reason it cannot be raised yet.

## How to raise and share the MR
1. Freeze the design and save the nesting first. Until then the stage says *Waiting for nesting — N cut plates have no plate yet*.
2. Check **Material** for each line.
3. Click **Raise MR**. If a line's material comes from the customer, the app asks **The customer's promised date** (**Promised by**): production waits for that date.
4. Click **Share as PDF** or **Share as Excel** and send it to the customer with the terms.
5. The stage is done for now. Purchase starts once the customer acceptance is approved.

## Good to know
- Locked means earmarked for this order; nobody else can use it.
- With **Customer supplies**, raising the MR makes a purchase order to the customer at ₹0, and what arrives is kept as their stock.
- Who supplies the material can change until the MR is raised. After the acceptance is approved it is part of the accepted terms.
- If the line's need changes after the MR was raised (for example after a new nesting), saving the MR in Stores brings it up to date.
- Raising the MR needs the inventory manage permission; seeing it needs inventory view.

## Related
- [Nesting](help:order-nesting)
- [Customer acceptance](help:order-acceptance)
- [Customer material](help:order-material)
