---
id: accounts-company-tax
title: Company tax details
area: accounts
roles: [accounts, admin, management]
routes: ["/:company/cf_erp/company-tax"]
order: 50
---
**Setup › Company tax details** holds who is selling, as printed on every tax invoice, the GST rates your items can carry, and the HSN and GST rate of whole catalog families at once. Accounts or the admin sets it up once, before the first invoice.

## What you see
- **Who is selling**: **Legal name**, **Trade name** (if different), **GSTIN**, **State** (where goods leave from), **Address**, **Address, line 2**, **City** and **Pincode**.
- **Invoices**: **Invoice prefix**, **LUT number** and the switch **E-invoice required — our turnover is above the government threshold**.
- **GST rates**: the list of rates on offer, as chips.
- **HSN and GST by catalog family**: one row per family, with **HSN**, **GST rate**, **Overwrite** and **Set**.

## How to set up the company
1. Type the **Legal name**.
2. Type the **GSTIN** (15 characters). The **State** is filled in from it; check it.
3. Fill in **Address**, **City** and **Pincode**. An invoice cannot be raised until line 1, city and PIN code are complete.
4. Set the **Invoice prefix**. Numbers read PREFIX/26-27/0001.
5. Fill in the **LUT number** only if you export or supply to SEZs.
6. Switch on **E-invoice required** if your turnover is above the government limit.
7. Under **GST rates**, type a rate in **Add a rate (%)** and press Enter or **+**. Click the × on a chip to drop a rate.
8. Click **Save tax details**.

## How to give a whole family its HSN and GST
1. Read the line at the top of the card: *N catalog items · N without an HSN code · N without a GST rate.*
2. On each family row, read what it holds now and the *suggested* HSN and rate. A suggestion is only filled in; it is not saved.
3. Check or type the **HSN** (for example 7308 for structures), pick the **GST rate** and click **Set**.
4. Only the gaps are filled. Tick **Overwrite** to replace values already there.

## Good to know
- The company **State** against the customer's ship-to state decides CGST + SGST (same state) or IGST (another state).
- An item with no GST rate shows GST ₹0 on purchase orders and stops invoices. A made part reads its template's HSN and rate, and setting a family sets the templates in it too.
- Changing these details needs the orders manage or the accounts manage permission. Setting a family needs the catalog manage or the accounts manage permission.
- Rates are not built into the software. When the government changes a rate, change this list.

## Related
- [Billing](help:accounts-billing)
- [One invoice](help:accounts-invoice-detail)
- [Items](help:catalog-items)
