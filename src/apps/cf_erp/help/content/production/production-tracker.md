---
id: production-tracker
title: Tracker
area: production
roles: [production, stores, management]
routes: ["/:company/cf_erp/tracker"]
order: 30
---
Every released piece and step, what it waits for, and the material it needs. Supervisors use it as the shop's work queue; Stores uses its Material view to reserve and issue.

## The views
- **Progress** (the default) — every released piece as a tree of its codes, its operations on the right, and how much is done higher up.
- **Steps** — every released step and what it waits for.
- **Material** — what the steps need, and what is still to reserve.
- **3D** — pick a sales order (and, to narrow it, one of its production orders): its lines in 3D, each piece coloured by the step it is at. Pieces not released yet are grey.

## What you see in Steps
- Figures: **Ready** (everything it waits for is done and its material is reserved), **In progress**, **Waiting** (for earlier steps, other pieces or material) and **Material short**. Click one to filter.
- Chips: **Open**, **Ready**, **In progress**, **Waiting**, **On hold**, **Done**.
- Columns: **Step** (operation and piece), **Order**, **Status**, **Do**, **Waiting for / on** (one reason per line, or the machine), **Line** (hidden).
- Running steps come first, then ready, held, waiting, done.

## How to record work from the Tracker
1. On a **Ready** step click **Start**, pick **On machine (optional)**, click **Start**.
2. On an **In progress** step click **Record**: type **Good** and **Scrapped** (and a note), click **Record**. Scrapped pieces are made again.
3. The pause button puts a step on hold (say **Why**); **Resume** brings it back.

## How to reserve material
1. Open **Material**. **Still to reserve** shows what is short for work not yet run.
2. Click **Reserve** where free stock exists, or **Issue** on a reserved row.

## How to set an opening position (work done before the system)
For an order whose work had already moved on before it was released here: most of it stands at one stage — the girders cut, fitted and welded, say.
1. On **Progress**, pick the order (or one of its lines) and click **Set opening position**.
2. Pick the **Line** (when the order has several), the stage the **Work has reached**, and — if it is not today — the day it stood there (**As of**; it may be before the release).
3. Choose **The whole line**, or **The pieces I tick** — a span, a girder or a segment, each with everything under it, cut plates included. A line of several units can be set unit by unit.
4. Click **Preview**: it says how many steps it would mark done, per stage and on which pieces. Then **Apply**.

What it does:
- Every step up to the stage is **done**, tagged **Opening** (striped on the operations lane). Nothing is posted: no plate is used up, no stock moves, nothing goes to finished stock and no billing milestone falls due.
- "Up to a stage" is everything of a piece's flow up to its **last** step of that stage or an earlier one — so a girder at **Drill** has every fit-up and weld pass before its last drilling done too. An operation in no stage counts with the step before it.
- Steps the floor has already started or finished are left as they are. The next step after the opening position becomes ready as usual — its own material still has to be reserved.
- A lower stage (or **None**) takes opening steps back — only while nothing real has been recorded after them; otherwise it says which pieces stop it.
- The stages and their operations are set on **Setup › Settings › Production: stages**, one line per stage: `Name: CODE, CODE`.
- Plates reserved for cuts that are now opening steps stay reserved; the answer says how many — let them go on **Material** when that stock is really free.

## Good to know
- A refusal lists every reason — read them all; usually a step waits for two or three things at once.
- Start, Record, Hold and Set opening position need the production manage permission; Reserve and Issue need the production manage or the inventory manage permission.
- Operators normally record on the Machine log; the Tracker is for supervisors and catching up.

## Related
- [Machine log](help:production-floor)
- [Issuing material to production](help:stores-issuing)
- [A production order](help:production-order)
