---
id: catalog-item-detail
title: One item
area: catalog
roles: [design, stores, purchase, accounts, admin]
routes: ["/:company/cf_erp/items/:id"]
order: 20
---
Everything about one catalog item: its values, its BOM, its stock, its history, and its details, including tax and how it is procured.

## What you see
- The header: code, name (click it to rename), badges such as **No code yet** or a lock when its order line is frozen. Buttons: **Activate** (drafts), **Reactivate** (obsolete), **Mark obsolete**, **New revision**, **Make a similar one**, **Edit** and the bin (**Delete**, refused while anything uses it).
- Facts: Short name, Revision, Tracked by, Comes from, Made by, Cut from and Updated.
- Tabs: **Specifications**, **BOM**, **Stock**, **History** and **Details**.

## The tabs
- **Specifications**: every rule that reaches this item and where each value comes from. Fixed and calculated values cannot be typed. **Why these values** explains why each one is asked. **Rules on this item only** is rarely needed; rules usually belong on the classification.
- **BOM**: what it is made of.
- **Stock**: **Where it is** (by batch or by area), **Claimed by a job** (held for an order; **Let go** releases a hold) and **Latest movements**.
- **History**: every change to a value — who, when, and from what to what.
- **Details**: **Name**, **Code** (editable while draft), **Description**, **Tracked by**, **Unit of measure**, **Comes from**, **List price (₹)**, **Priced**, **HSN / SAC**, **GST rate**, **This is a service (SAC, not HSN)**, **Cut from** (with the **Section** stock bar), and **Usually made by** (the flow). Click **Save details**.

## How to set how it is bought (Procurement)
On the **Details** tab, the **Procurement** card is read by Stores and the **To reorder** list.
1. Pick the **Method**: Make (in-house), Buy on requirement, Buy to min / max, Buy periodically, Customer supplies or Subcontract.
2. For min / max, fill in **Minimum stock** and **Maximum stock**. For periodic, fill in **Every … days**.
3. For buying, fill in **Lead time**, **Minimum order**, **Order multiple** and the **Preferred vendors**.
4. Click **Save**. **Follow the definition** or **Use the default** clears your own setting.

## Good to know
- The badge on the Procurement card says where the setting comes from: the item itself, its definition, or the default.
- Without an **HSN / SAC** and a **GST rate**, the item shows GST ₹0 on purchase orders and blocks invoices. Fix many at once in [Company tax details](help:accounts-company-tax).
- **New revision** keeps the same record and moves only the label (A → B). Documents keep the revision they were made with.

## Related
- [Items](help:catalog-items)
- [Definitions](help:catalog-definitions)
