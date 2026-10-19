---
id: order-nesting
title: Nesting
area: order
roles: [design, purchase, production]
routes: ["/:company/cf_erp/orders/:id"]
tab: nesting
order: 50
---
Nesting lays a line's cut pieces out on the plates they are cut from, and its sections on stock bars. What you save here is what the shop cuts and what the order buys. It comes after Freeze design and is done one line at a time.

## What you see
- Two doors: **Upload your nesting** (**Upload nesting files**) and **Nesting by AI** (**Nest by AI**).
- **What to nest** (**Choose pieces and plates**): step 1 **Pieces**, untick a piece to leave it out; step 2 **Plates**, the catalog plates the packer may use. A customer's plate is marked **Customer's — used first**.
- **Cut pieces (N)**: the list of cut pieces, made automatically from the parts and values.
- **Sections**: section parts cut to length on stock bars (**Propose**, **Accept**, **Take back**, **Download sheet**, **Upload sheet**).
- Once saved: the figures (**Steel bought**, **Waste**, **Cut pieces nested**), one card per steel with **Draw the N plates**, and **Offcuts (N)**: the leftovers that are kept.

## How to upload the customer's or your own nesting
1. Click **Upload nesting files**, or drop the files on the page.
2. Give the ProNest job files (.nif, one per thickness) or one DXF per plate. AI matches the parts to this line's cut pieces.
3. **Check the nesting files** lists each file: plate found, pieces, **N to fix**, **N to check**. Name the plate with **Which plate?** when none was found.
4. Tick **Replace everything with these files** only to start over; otherwise each file replaces its own saved plate.
5. Click **Save N plates**. With warnings it asks **Save with these warnings?** — **Save anyway** or **Go back**.

## How to nest by AI
1. Click **Nest by AI**. Under **How hard should it try?** pick **Quick** (5 min), **Standard** (10 min), **Deep** (20 min) or **Long** (1 hour). These are ceilings; a long run keeps going on the server if you close the page.
2. Under **Plates to use**, pick **Standard plates only** or **Standard and custom**.
3. Click **Start nesting**. When it finishes, nothing is written yet.
4. Read the proposal and its plates. Click **Use this nesting** to save it, **Discard**, or **Nest again**.

## Pieces left over
A yellow box *N cut pieces are not nested yet* offers **Upload more files**, **Nest the rest by AI** and **Mark the rest as cut from offcuts**. The last one is for pieces cut from loose yard offcuts: no plate, no heat number, charged at the plate rate per kg, and it can be undone.

## Good to know
- **Use this nesting** makes each plate a lot this line will draw from stock, writes every piece where it sits in cut order, and replaces the earlier automatic plates. Imported plates stay.
- The **More** menu: **Upload nesting files**, **Download CNC files (zip)**, **Download AI DXFs for ProNest (zip)**, **Download nesting sheet**, **Start again**.
- A piece is nested only on a plate of its grade and impact class. By default this is exact: BO and BR do not stand in for each other. See [Compare with AI](help:order-nesting-compare).
- **This layout is out of date** means the structure changed after the layout was saved. Use **More › Start again** so the plates bought match what is cut.
- A part no catalog plate can hold is listed under *could not be placed*. Leave it out, or add a long enough plate to the catalog.
- Saving needs the orders permission.

## Related
- [Compare with AI](help:order-nesting-compare)
- [Freeze design](help:order-lock)
- [Material request](help:order-buying)
