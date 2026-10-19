---
id: management-approvals
title: Approvals
area: management
roles: [management, admin]
routes: ["/:company/cf_erp/approvals"]
order: 10
---
One inbox for everything that waits for Management's yes: customer acceptances, rate changes, purchase orders, contractor POs, closing a PO short and re-baselines of the plan. You see only the kinds you are allowed to approve.

## What you see
- Filter chips: **Waiting** (with the count) and **Decided**. Next come **All kinds** and one chip per kind you approve, each with its own count.
- One card per request. The card shows its title, who asked and when, the amount, the requester's note and a badge with the kind.
- Inside the card, what is being decided:
  - **Customer acceptance** and **Rate change after acceptance**: the order (a link opens its Acceptance tab), the charges table (Charge, Operation, Basis, Rate, Billed, Amount), the material rate and lump sums. Then the milestones (Milestone, Share, When, Credit days, Amount), the post-production stages, the **Estimated value** and the **margin over material**. A rate change also shows **What changes** in a yellow box.
  - **Purchase order** and **Contractor PO**: the PO (a link), vendor, order and expected date. Each line shows Material, Quantity, Rate and Amount, the **Other quotes on its PR**, and how it **Compared** (for example *the lowest quote*).
  - **Close a PO short**: the reason, the amount that would not come, and Ordered / Received / Pending per line.
  - **Re-baseline**: what moves if the saved plan becomes the baseline, line by line, with the days gained or lost.

## How to approve or send back
1. Open **Management › Approvals**. The **Waiting** chip is on.
2. Read the card. Click any code to open the order or PO behind it.
3. Click **Approve**. Add a **Note (optional)** and click **Approve** again.
4. Or click **Send back**. Type **Why — the person who asked reads it** (you must type a reason), then click **Send back**.
5. To see past decisions, click **Decided**. Each card shows who decided, when and the note.

## What an approval sets off
- A customer acceptance confirms the order. Its billing cards appear in Accounts › Billing, and the advance moves to *Due to bill* by itself.
- An approved purchase order is placed. Stores can then receive goods against it.
- An approved contractor PO issues the work order to the contractor.

## Good to know
- **One approval type per permission.** Each kind needs its own permission (for example, approving purchase orders). A person may hold any mix of them, and the menu shows **Approvals** to anyone who holds at least one.
- **Four eyes.** You cannot decide what you asked for yourself. The card says *You asked for this one — somebody else in Management decides it*. An admin may decide their own.
- **Testing phase:** a company can switch on "approve own requests" in its settings, so one test login can approve its own requests. This is temporary. The admin sets it in the company settings in the database; there is no switch on this screen. Turn it off before going live.
- A request already decided cannot be decided again.

## Related
- [Management overview](help:management-overview)
- [Billing](help:accounts-billing)
- [Contractor work orders](help:accounts-contractor-work-orders)
