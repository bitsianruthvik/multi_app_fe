---
id: order-acceptance
title: Customer accepted and Acceptance & terms
area: order
roles: [sales, management, accounts]
routes: ["/:company/cf_erp/orders/:id"]
tab: acceptance
order: 70
---
When the customer says yes, Sales clicks **Customer accepted** on the order. The MD then accepts the order; that confirms it and opens its material request. The customer's acceptance is a button on the order, not a step of the flow.

## Customer accepted
The button sits at the top of an inquiry or a quoted order. It opens a pop-up with three tabs. Only the first one needs filling.
- **Acceptance**: **Accepted on** (today unless you change it), **Customer PO / reference** and a **Note for the MD**.
- **Accounting**: the charges, the payment milestones and the post-production stages. It is off at first. Switch on **Fill the accounting now** to set them here, or leave them for later.
- **Inventory**: who supplies the material, for the order and each line. A change is saved as soon as you make it.

Click **Mark accepted — send to MD**. The order then shows **Customer accepted · waiting for the MD**, and the button changes to **Waiting for the MD**.

## The MD accepts
- The request appears on the MD's Home page under **Orders to accept**, and in Management › Approvals. It says when the customer accepted, their PO number and, when the accounting is still to come, *Charges and payment terms to follow*.
- **Approve**: the order is **Confirmed**, and **Create material request** opens in **Material required**.
- **Send back** with a reason: the order shows **Sent back by the MD**. Change what is needed and send it again.

## Acceptance & terms
The order's **Acceptance & terms** tab holds everything the acceptance carries, so the rest can be filled in later.
- The state: **Not sent yet**, **Waiting for Management**, **Sent back**, **Accepted** or **Accepted · rate change waiting**.
- The estimate: **Order value (these terms)**, **Material we buy** and **Margin over material**.
- **Material**: who supplies the steel. It can change until a material request is with Purchase.
- **Charges**: one row per operation. **Basis** is **Weight — as per drawing**, **Weight — actual** or **Formula…**; **Billed** is **Pro-rata (weekly)** or **On completion**. Add the **Material (we supply)** rate when we buy the steel.
- **Scrap & offcuts** charges the steel the nesting leaves over, by kg or as a % of the material.
- **Payment milestones**, for example 10 % when the order is accepted and 80 % on each dispatch with 30 credit days. Given milestones must make 100 %.
- **Post-production stages**, for example *Inspection by the customer*, and their checklist once the order is confirmed.
- **History**: every version sent.

A change after the MD has accepted is a rate change: it goes to the MD again, and the accepted terms stay in force until it is approved.

## Good to know
- The order needs its lines, a customer and a committed date before it can be sent. The pop-up says what is missing.
- Approving needs the Management acceptance approval permission.
- **Fill from template** and **Save as template** work in the Acceptance & terms tab.
- A material cost shown as *not costed* means the plates have no rate yet.

## Related
- [Material required](help:order-buying)
- [Templates](help:sales-term-templates)
- [Approvals](help:management-approvals)
- [Billing](help:accounts-billing)
