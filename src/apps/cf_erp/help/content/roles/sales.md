---
id: sales
title: Getting started in sales
area: roles
roles: [sales]
routes: ["/:company/cf_erp/orders"]
order: 10
---
This guide walks a sales person through one order, from the customer's first inquiry to the moment production takes over, and then to closing. Each step links to the page that explains it in full.

## Your day
1. Open **Home**. **Waiting on you** shows inquiries to quote and orders past their date.
2. Open **Sales › Orders** for your open orders, or **Sales › Orders board** to see where every customer order stands.
3. Work the orders that need you, step by step as below.

## From inquiry to an accepted order

### 1. The customer
A new customer is added from **Sales › Customers › New customer**, or straight from the New order dialog. Fill the GSTIN (it sets the state), the GST registration and the address now: invoices check them later. See [Customers, suppliers and contractors](help:sales-parties).

### 2. The order
**Orders › New order**. Pick the customer, type the project title, their reference and the committed date. Choose **Material**: **We buy** or **Customer supplies**. Check **Values for the whole order** (coats, grade, impact class BO or BR); they are filled in from your last order. Click **Create order**: it starts as an inquiry. See [New order](help:sales-new-order).

### 3. The lines
On **Structure & values**, click **Add line**. For an RDSO girder, choose **From a standard drawing** and type the drawing number: its BOM, values and drawings are copied. Set the quantity and the rate per tonne. The header now shows the order value as an *estimate*. See [Add a line](help:order-add-line).

### 4. Hand over to design
The design engineer fills the missing values, saves the execution plan, freezes the design and nests the plates. You can follow along on the stage tabs. See the [design and planning guide](help:design).

### 5. Mark it quoted
When the quotation has gone out, click **Mark quoted** in the order header. If the customer goes elsewhere, **Mark lost** (it can be reopened later).

### 6. The material request
Once nesting is saved, open **Material request** and click **Raise MR**. Click **Share as PDF** or **Share as Excel** and send it with your offer. The MR waits: Purchase starts only after the acceptance is approved. See [Material request](help:order-buying).

### 7. The customer acceptance
Click **Customer acceptance** in the header. The charges, payment milestones and post-production stages come from the default templates. Change the rates to what the customer agreed, add **Scrap & offcuts** if you charge for them, and check the estimate and margin. Write a note for Management and click **Send for approval**. See [Customer acceptance](help:order-acceptance).

### 8. Management approves
The MD approves it in **Management › Approvals**. If it comes back, the reason shows on the step: change the terms and click **Save and send again**. Once approved the order is **Confirmed**, the terms are locked and the order value says *accepted*. Purchase starts on the MR, and Billing raises the advance when it falls due.

## After production starts
- Watch the order move across the **Orders board**: Material, In production, Dispatched.
- After dispatch, tick the **Post-production** stages on the board (for example *Inspection by the customer*, *Handover*) with the date and a note such as the RITES IC number. See [Orders board](help:sales-orders-board).
- The order closes by itself when every stage is done and it is fully paid.
- To change agreed rates later, change them on the acceptance and click **Send rate change for approval**.

## Things to remember
- A customer order is confirmed only by an approved acceptance, never by a button.
- Once a line is frozen, changing it means **Revise** (a new revision of the order). See [The order page](help:order-page).
- Keep good structures for next time: **Save line N as a standard drawing**. See [Standard drawings](help:sales-standard-drawings).
- Keep your usual terms as templates in **Setup › Templates**. See [Templates](help:sales-term-templates).

## Related
- [Orders](help:sales-orders)
- [Approvals](help:management-approvals)
- [Billing](help:accounts-billing)
