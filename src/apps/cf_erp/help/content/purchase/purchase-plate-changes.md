---
id: purchase-plate-changes
title: Plate changes
area: purchase
roles: [purchase, management]
routes: ["/:company/cf_erp/plate-changes"]
order: 60
---
A change to a line's plates asked for after a purchase order already covers that line. The MD approves or rejects it; the buyer then changes the purchase orders by hand and ticks each change off.

## What you see
- Chips: **Waiting for approval**, **Open**, **Done**, **All**.
- One card per request, with its code, the line, what changes and why. Open a card to see the before / after figures and the material table (**Need now**, **Need after**, **Ordered**, **Received**, **Held**).

## How the MD decides
1. Open the card under **Waiting for approval**.
2. Read the figures, then click **Approve** (an optional note; **Approve and save**) or **Reject** (say why).
3. The person who asked can **Withdraw** it.

## How the buyer finishes an approved change
1. Open the card. Its checklist reads **For the buyer** with progress.
2. Change each purchase order as listed — "The purchase orders are not changed by themselves."
3. Tick each line as it is done.

## Good to know
- This screen is not in the menu while the nesting plate-change approval is switched off (it is off for now). A customer's substitute plate still comes here, linked from the MR and from To return to customers.
- A red note "cannot be approved" means the line's plates or buying changed after the request. Withdraw it and ask again.
- Opening it needs the plate change approval permission or the inventory manage permission.

## Related
- [A purchase order](help:purchase-order)
- [To return to customers](help:stores-customer-returns)
