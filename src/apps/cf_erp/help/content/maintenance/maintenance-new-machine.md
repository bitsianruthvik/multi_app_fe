---
id: maintenance-new-machine
title: Buying a new machine
area: maintenance
roles: [maintenance, production, stores, purchase, management, admin]
routes: ["/:company/cf_erp/machines"]
order: 51
---
A machine you want to buy is asked for on **Request a new machine**. Production (planning) or Maintenance asks for it. Stores raises the purchase request, Maintenance approves it with a comment, and then the MD approves it. Only after that does Purchase take quotes and raise the PO, and the MD approves the PO like any other. The PO then waits for its GRN.

**New machine** is a different button. It adds a machine you already have to the register, and only Maintenance uses it.

## How to ask for one
1. Open **Maintenance › Machine register** and click **Request a new machine**. It is also in the **+** menu at the top.
2. Under **Model**, pick **A model in the catalog**, or choose **A new model** and type its name (for example *Plasma cutter — Hypertherm XPR300*). A new model is added to the catalog as a draft under Capital equipment › Machinery › Machines.
3. Optionally pick the **Machine type**. Then fill in **How many**, **Needed by**, **What is it for?** (required) and **Notes**.
4. Click **Send to Stores**. A material request **For: New machine** goes to the Stores MR inbox.

## What happens next
1. **Stores** opens the MR (the inbox has a **New machine** chip) and saves it. This raises its purchase request.
2. The PR shows **Waiting for Maintenance**. Purchase cannot add vendors or raise a PO yet.
3. **Maintenance** finds it under **Maintenance › New machine approvals**, or on Home under *New machines to review*. A comment is required to approve: say what you checked, such as the foundation, power or space. The MD reads that comment.
4. **The MD** finds it under **Management › Approvals**, or on Home under *New machines to approve*.
5. Once the MD approves, the PR says *approved*. Purchase collects quotes and raises the PO, which goes to the MD for approval and then waits for the GRN.

## If it is sent back
- The PR shows **Sent back**, and the reason is on the approval in Approvals.
- When it is sorted out, Stores clicks **Ask again** on the PR. Maintenance reviews it again first, then the MD.

## Good to know
- Asking needs production manage or Maintenance. Maintenance's step needs the Maintenance permission. The MD's step needs *Approve a new machine purchase*.
- Four eyes: the person whose step sent the request on does not decide the next step.
- When it arrives, Stores registers it from the GRN. It goes to setup with a ticket for Maintenance — see [A machine's life](help:maintenance-machine-life).

## Related
- [Machines (the register)](help:maintenance-machines)
- [A purchase request](help:purchase-request)
- [Approvals](help:management-approvals)
