---
id: home-cockpit
title: Home
area: home
roles: [sales, management, accounts, purchase, stores, production, maintenance, design, admin]
routes: ["/:company/cf_erp/home", "/:company/cf_erp"]
order: 10
---
Home is the first screen after you sign in. It answers one question: what needs me today? Everyone uses it; each person sees only the figures and queues their permissions allow.

## What you see
- **Welcome back, (your name)** and a **Refresh** button at the top right.
- **The figures strip**: Open orders, Confirmed orders, Steps in progress, Machines active and Stock lines. Click a figure to open its screen.
- **The money strip** (only if you may see orders or stock):
  - **Stock value (ours)**: all our stock at cost. It shows *not costed* when stock has no cost yet.
  - **Customer material held**: lots a customer sent us. They are not ours, so they are not in the value.
  - **Open purchase orders**: the total before tax. Lines with no price are left out, and the tile says how many.
  - **Order book**: every confirmed order, before tax. It uses the accepted terms where they exist, else the line rates.
- **Waiting on you**: one card per queue that has work in it. Each card names the count, says why it matters and has one button that opens the screen that clears it. Examples: **Orders past their date** (Review them), **Inquiries to quote** (Open inquiries), **Purchase orders to approve** (Open Approvals), **Deliveries to book in** (Receive against PO), **Material to reserve**, **Steps on hold** (See why), **Lines to release**, **Drafts to finish** (Finish them), **Machines without shifts** (Set shifts), **Stock on hold** (Open batches).
- **Open orders**: the six newest open orders, with a **Past date** badge when late. **All orders** opens the full list.
- **Setup**: how far the catalog setup has got, in the usual order. The steps are Classification, Specifications, Value formulas, Coding rules, Catalog items and Definitions. A green tick means the step has something in it. Click a row to go there.

## How to use it each morning
1. Open **Home** (top menu, first item).
2. Read **Waiting on you** from left to right. Click the button on a card, clear the work, then come back.
3. Click **Refresh** to read the numbers again.

## Good to know
- When nothing is waiting, the page says **Nothing is waiting on you**.
- A missing tile is not a zero. It means you lack the permission to read that number.
- A money figure you see as *not costed* or *not priced* means rates are missing in the catalog or on purchase orders. It is not ₹0.

## Related
- [Search and moving around](help:home-search-and-nav)
- [Approvals](help:management-approvals)
- [Billing](help:accounts-billing)
