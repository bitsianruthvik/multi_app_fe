---
id: order-acceptance
title: Customer acceptance
area: order
roles: [sales, management, accounts]
routes: ["/:company/cf_erp/orders/:id"]
tab: acceptance
order: 70
---
The customer acceptance is the customer's yes: the charges, the payment milestones and the post-production stages, sent to Management. Its approval confirms the order, releases the MR to Purchase and locks the terms. Sales prepares it; Management (the MD) approves it.

## What you see
- **Customer acceptance** with its state: **Not sent yet**, **Waiting for Management**, **Sent back**, **Taken back**, **Accepted (v1)** or **Accepted · rate change waiting**.
- The MR note with **MR as PDF** and **MR as Excel**.
- The estimate: **Order value (these terms)**, **Material we buy** and **Margin over material**.
- **Note for Management (optional)**.
- **Material**: who supplies the steel, for the order and each line.
- **Charges**: **Charge**, **Operation the work passes**, **Basis**, **Rate (₹)**, **Billed**, and the quantity and amount worked out.
- **Payment milestones**: **Milestone**, **% or ₹**, **Value**, **When**, **Pro-rata**, **Credit days**. The subtitle says what they add up to.
- **Post-production stages**: what happens after dispatch, in order, and which milestone bills each.
- **History**: every version sent.

## How to prepare and send it
1. Each block starts from the default template. **Fill from template** picks another one.
2. **Charges**: one row per operation. **Basis** is **Weight — as per drawing**, **Weight — actual** or **Formula…**; **Billed** is **Pro-rata (weekly)** or **On completion**. Add the **Material (we supply)** rate when we buy the steel. Add rows with **Charge** or **Lump sum**.
3. **Scrap & offcuts** adds a charge for the steel the nesting leaves over: **Scrap — kg × rate**, **Offcuts — kg × rate** or **Scrap & offcuts — % of material**. The kilograms come from the saved nesting.
4. **Payment milestones**: for example 10 % **When the order is accepted**, 80 % **On each dispatch** with 30 credit days, and a retention released 12 months later. Add with **Milestone**.
5. **Post-production stages**: for example *Inspection by the customer*, *Handover*. Add with **Stage**.
6. Write a **Note for Management** if useful, then click **Send for approval**.

## After sending
- **Take back** pulls it back so you can change it; **Save and send again** sends the new version.
- If Management sends it back, the reason shows. Change the terms and send again.
- Once approved: *Accepted on … by …. These terms are locked.* The order is confirmed, and Billing raises the milestones as they fall due.
- To change a rate later, change it and click **Send rate change for approval**.

## Good to know
- Raise and share the MR first: the stage waits for it.
- Changing **Material** needs the orders manage permission (a line's **Material** also takes the inventory manage permission).
- Approval needs the Management acceptance approval permission. It is done in Management › Approvals.
- **Save as template** keeps this order's rows for the next one.
- A material cost shown as *not costed* means the plates have no rate yet.

## Related
- [Material request](help:order-buying)
- [Templates](help:sales-term-templates)
- [Approvals](help:management-approvals)
- [Billing](help:accounts-billing)
