---
id: stores
title: Getting started in Stores
area: roles
roles: [stores]
routes: ["/:company/cf_erp/material-requests"]
order: 50
---
Stores is the hinge of the material chain. Every material request (MR) is a request to you; every purchase request (PR) is yours to Purchase. You give what is in stock, send the rest to Purchase, book deliveries in, keep stock in the right areas, and hand material to the floor.

## The chain
**Need → MR → Stores (take from stock, raise the PR) → Purchase (quotes → PO) → Management approval → Stores GRN → stock**

## Your day
### 1. Clear the MR inbox
Open the [MR inbox](help:purchase-material-requests). Filter by **For**: **Sales order**, **Maintenance order**, **Stock**, **General**.

Open each MR ([a material request](help:purchase-material-request)):
1. **In stock (free)** shows what you can give. **Take from stock** is filled in with a suggestion — change it if needed.
2. Click **Save**. What you take is locked for that order; the rest goes on one purchase request for Purchase.
3. If you see "The line's need changed since the MR was raised", just **Save** again.
4. For customer-supplied material, saving asks the customer for the rest on a ₹0 PO.

When Stores itself needs something bought, click **New PR** — for **Stock** or **General** (overhead, or charged to a sales or maintenance order). It goes straight to Purchase and is not listed in the inbox. **New MR** is for departments asking you for material.

### 2. Refill stock
Open [To reorder](help:purchase-to-reorder). Items bought to min / max or periodically appear when they need buying. Untick what you do not want, adjust **Order**, and click **Raise PR**. It goes straight to Purchase. An item gets onto this list from its **Procurement** card in the catalog.

### 3. Book deliveries
Open [Receive against PO](help:purchase-receive). Only Management-approved POs are listed.
1. Click **Receive** on a line, then tick every line that came on the same truck.
2. **Into** — a storage area (the only kind offered).
3. **Supplier invoice no.** and **Invoice date**, or tick **Invoice to follow**.
4. Check the quantity, price, discount, HSN and GST; add freight. For plates kept in batches, type the heat number (**Supplier lot number** and the batch values).
5. Click **Receive**. What arrives is locked for its order, and the PO closes when everything is in.

### 4. Feed the floor
- Cutting takes plates only from storage or WIP areas — never from a dispatch yard.
- In the [Tracker](help:production-tracker) **Material** view, **Reserve** free stock for released work and **Issue** it to the order. See [Issuing material to production](help:stores-issuing).
- Consumables and tools: **Issue** on [Stock](help:stores-stock), with **Used for** a sales order or General.
- Tools that have a life are followed on [Tools](help:maintenance-tools).
- MRs from maintenance orders carry the machine's spares; their cost goes to the machine (or the sales order they name).

### 5. Keep stock right
- [Stock](help:stores-stock) — everything, by area, owner and what it counts as. **Transfer** between areas, **Count** to correct, **Check ledger** to verify.
- [Movements](help:stores-movements) — the ledger. A mistake is undone with **Reverse** on [the movement](help:stores-movement), never edited.
- [Batches](help:stores-batches) — find a heat; **Put on hold** or **Reject** a doubtful batch and **Release** it when cleared ([a batch](help:stores-batch)).
- [Work in progress](help:stores-wip) and [Offcuts](help:stores-offcuts) — material on the floor and what is left of cut plates.
- [To return to customers](help:stores-customer-returns) — customer material to send back.

## Set up once
[Stocking areas](help:stores-areas): at least one **Storage** area for raw material (for example RM-STORE), a **Work in process** area beside each cutting machine, a **Quarantine** area for doubtful stock, a **Dispatch** yard and a **Scrap** area. Without a storage area a GRN has nowhere to go.

## Permissions
The Stores permission (or the older inventory manage permission) saves MRs and raises **New PR** and **Raise PR**. **New MR** is also open to maintenance and to whoever manages orders; a sales order's **Raise MR** needs orders manage or inventory manage. Posting movements and booking GRNs need inventory manage. Reserving and issuing material to production need inventory manage or production manage, so PPC can do them too. Quotes and purchase orders are Purchase's (the Purchase permission) — except the customer's own PO that an MR raises: Stores may move its dates, close it short or cancel it. In the testing phase the Test login holds all of these.
