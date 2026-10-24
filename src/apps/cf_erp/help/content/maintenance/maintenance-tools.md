---
id: maintenance-tools
title: Tools and tool life
area: maintenance
roles: [maintenance, stores, production]
routes: ["/:company/cf_erp/tools"]
order: 60
---
Tools are stock items like any other: received and issued under Stock. The page is **Stores › Tools**, and the same page is **Maintenance › Tools**. Give a tool item a life (uses, hours or metres) and every piece issued is counted until it is worn out.

## The two tabs
- **Issued pieces** — every tool piece out: **Tool** (code, name, piece no.), **Issued**, **Used for** (a sales order or General), **On machine**, **Life** (a bar that turns red past 80%) and **State**. Pick **In use**, **Worn out**, **Retired** or **All**.
- **Tool items** — each tool in the catalog: **Life per piece**, **In use**, **Worn out**.

## How to give a tool a life
1. Open **Tool items**.
2. In **Life per piece** pick the unit — **uses**, **hours** or **metres** (or **Not tracked**) — and type the limit. It saves on Enter or when you leave the box.
3. The life is copied onto each piece when it is issued; pieces already out keep theirs.

## How to issue a tool and record its use
1. Issue it from Stock with **Issue**. **Used for** is required — a sales order or General (overhead).
2. The piece appears under **Issued pieces**.
3. Type the use in its box (for example 3 uses, 2.5 hours) and press Enter. When the life is used up it is marked worn out.
4. **Retire** takes a piece out of use early.

## Good to know
- Tool items are made in the catalog under the Tools family (codes TL-…).
- Recording use and retiring need the inventory manage permission; setting the life needs the catalog manage permission.

## Related
- [Stock](help:stores-stock)
- [A machine — tools and spares](help:maintenance-machine)
