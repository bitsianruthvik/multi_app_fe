---
id: setup-coding-rules
title: Coding rules
area: setup
roles: [design, admin]
routes: ["/:company/cf_erp/coding-rules"]
order: 30
---
**Setup › Coding rules** decides how items, definitions, orders, machines, batches and stock documents get their codes, and how items and definitions get their names. A rule applies when its conditions hold and builds text from its pattern. Running numbers never repeat.

## What you see
- One card per kind of record, with its rules. Each rule shows its **Pattern**, **Applies when** and **Counters** (hover to see the next number for each prefix).
- A kind with no rule says *No rule — these are typed in by hand.*
- **New rule**. Click a rule to edit it; the bin deletes it.

## How to make a rule
1. Click **New rule**.
2. Type the **Code** and **Name**. Pick what it **Codes** (items, orders, batches…), what it **Makes** (**Their code** or **Their name**) and the **Status**.
3. In **Try it on a record**, choose a sample record. Each piece then shows what it would print for that record, and **This rule would make** shows the result.
4. Build the **Pattern** from **Add a piece**:
   - **From the record** or **Specifications**: for example the thickness or grade. **Options** on a piece sets its number format (*At least 3 digits — 7 prints 007*) or letters (*CAPITALS*).
   - **Fixed text**: a dash, a slash, a dot, a space, or letters such as PL.
   - **Running number**: pick the digits and click **Add running number**. A pattern holds only one.
   - **Date**: the day the code is made, as YYMM, YYYYMMDD, YYMMDD, YYYY or YY.
   - Use the up and down arrows on a part to move it.
5. Under **Applies when**, add conditions, for example *Variant is Plate* or *Template definition is …*. All conditions must hold. With none, the rule applies to every record of that kind.
6. Click **Create rule** (or **Save rule** when editing).

## Which rule wins
When several rules apply, the one whose conditions score the most points wins. The **which rule wins** panel shows each rule for the sample record: *This record gets it*, *Applies, beaten* or *Does not apply*.

## Good to know
- A code is fixed once the record is active, so check the preview before activating.
- Order pieces get their codes when the line's design is frozen.
- Typing a code by hand on a new item overrides the rule for that item.

## Related
- [Items](help:catalog-items)
- [Specifications](help:setup-specifications)
