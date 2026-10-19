---
id: stores-area
title: A stocking area
area: stores
roles: [stores, production]
routes: ["/:company/cf_erp/stocking-areas/:id"]
order: 71
---
One stocking area: what it holds now and what moved through it, with the buttons to move stock in and out of it.

## What you see
- The header: code, name, what its purpose means, and its status.
- Facts: **Items held**, **Stock lines**, and **Beside machine** for a machine's WIP area.
- Tabs: **Inventory** — **Its inventory**, what the area holds now by item and batch; **Movements** — **Latest movements** that came in, went out or were counted here, newest first.

## How to move stock here
1. Use the buttons at the top — the area is already filled in:
   - a normal area: **Receive**, **Issue**, **Transfer**, **Count**;
   - a quarantine area: **Transfer**, **Count**, **Scrap** (nothing is issued straight from quarantine — transfer it to storage first).
2. Fill the form and click **Post**.

## How to change or remove the area
1. Click **Edit** to change its name, purpose, machine, status or notes.
2. The bin deletes it — only an area that never held stock can be deleted. One with history is made inactive instead.

## Good to know
- The buttons show only with the inventory manage permission.

## Related
- [Stocking areas](help:stores-areas)
- [Stock](help:stores-stock)
