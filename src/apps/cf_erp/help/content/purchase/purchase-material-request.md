---
id: purchase-material-request
title: A material request — take from stock, buy the rest
area: purchase
roles: [stores, purchase]
routes: ["/:company/cf_erp/material-requests/:id"]
order: 11
---
One MR, line by line. Stores decides how much of each material comes from stock; saving earmarks that stock for this order and puts the rest on one purchase request (PR) for Purchase.

## What you see
- The header: the MR number, what it is for (for example "SO260014 · line 1", "For stock", "Maintenance order #12"), badges **For: …**, **We buy** or **Customer supplies**, and the facts **Sales order**, **Line**, **Customer**, **Purchase request**.
- The **Lines** table: **Material**, **Required**, **In stock (free)**, **Take from stock**, **To buy**, **PO raised**, **Received** (hidden at first) and **Locked for this order** (or **Locked for this MR**).
- A **Purchase orders** card once POs serve this MR.
- **Stores' own purchase**: the MR under a PR Stores raised itself (**Raise PR** on To reorder, or **New PR**). It is not a request to Stores and is not in the MR inbox; you reach it from its PR.

## How to take stock and send the rest to Purchase
1. Look at **In stock (free)** for each line. When nothing has been chosen yet, **Take from stock** is filled in with a suggestion (the smaller of required and free) and says "Suggested — save to earmark".
2. Change **Take from stock** where you want. **To buy** updates as you type.
3. Click **Save**. The toast says "Saved. The rest is on PR-…" or "Saved. Nothing to buy."
4. Open the PR from the **Purchase request** fact if you want to follow it.

## Customer-supplied material
When the badge says **Customer supplies**, the columns read **In the customer's stock** and **Ask the customer**. Saving asks the customer for the rest on a ₹0 purchase order. If the line and order have no committed date, a box asks **The customer's promised date** first.

## Good to know
- The box refuses a negative number, more than the line needs ("The line needs …"), or more than is free now ("At most … now").
- An MR **for stock** takes nothing from stock — everything on it is bought.
- **Locked** means earmarked: nobody else can use it. It grows as goods arrive against the POs; the page reads it again every 30 seconds while open.
- "The line's need changed since the MR was raised" means the order changed. Click **Save** to bring the PR up to date.
- When the MR cannot be changed, a blue note says why. Changing it needs the Stores permission.

## Related
- [The order's Material request step](help:order-material)
- [MR inbox](help:purchase-material-requests)
- [A purchase request — the quote grid](help:purchase-request)
- [Receive against PO (GRN)](help:purchase-receive)
