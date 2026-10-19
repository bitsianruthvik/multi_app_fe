---
id: sales-parties
title: Customers, suppliers and contractors
area: sales
roles: [sales, purchase, accounts, production, management]
routes: ["/:company/cf_erp/customers", "/:company/cf_erp/customers/:partyId", "/:company/cf_erp/suppliers", "/:company/cf_erp/contractors"]
order: 30
---
One list holds everyone you deal with: customers who order from you, suppliers you buy from and contractors who do job work. One record can hold several roles: a stockist who sells you steel and buys your scrap is one record, not two. **Sales › Customers** opens it on customers, **Purchase › Suppliers** on suppliers and **Production › Contractors** on contractors.

## What you see
- **Active**, **Inactive** (not offered on new orders) and **No contact** (no email or phone on record) figures.
- On **Customers**, chips to switch between **Customers**, **Suppliers**, **Contractors** and **All**.
- The table: **Code**, **Name**, **Roles**, **Contact**, **Status**, and a hidden **Tax number** column. The pencil edits a record; the bin deletes it.

## How to add a customer
1. Click **New customer** (or **New supplier** / **New contractor**).
2. Type a short **Code** and the **Name**. Both are required.
3. Under **Roles**, tick **Customer**, **Supplier** and/or **Contractor (job work)**. At least one is needed.
4. Fill **Contact**, **Email** and **Phone**.
5. Type the **GSTIN**. It is checked, and the **State** is filled from it.
6. Pick the **GST registration**: **Registered (regular)**, **Composition scheme**, **Not registered**, **SEZ** or **Overseas**. It decides how tax is shown on their invoices.
7. Fill **Address**, **City**, **Pincode**. If they have no GSTIN, pick the **State** yourself: it decides CGST + SGST or IGST.
8. Click **Create**.

## How to add a ship-to address or a cutting allowance
1. Open the saved record (click its row).
2. Under the addresses, click **Add address**. Give the **Name of the place**, **Address**, **State** (required) and, if the site is registered on its own, **GSTIN here (optional)**. Tick **Ship here by default** if most dispatches go there.
3. For a customer, the **Cutting allowance** block sets how much longer their plate parts are cut. Click **Add part name**, pick the **Part name**, type **mm at each end** and, if needed, **mm a metre (optional)**, then **Save**. Every order of theirs starts from it; an order can override it.
4. Click **Save** on the party form.

## Good to know
- Delete is refused while an order names the party. Set **Status** to **Inactive** instead: old orders keep their customer, and new orders no longer offer it.
- Adding or changing parties needs the parties permission.
- Invoices check the customer's GSTIN, state and address. Missing details block **Raise invoice** later, so fill them now.

## Related
- [New order](help:sales-new-order)
- [Cutting allowance](help:order-allowance)
