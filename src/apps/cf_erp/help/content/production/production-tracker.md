---
id: production-tracker
title: Tracker
area: production
roles: [production, stores, management]
routes: ["/:company/cf_erp/tracker"]
order: 30
---
Every released piece and step, what it waits for, and the material it needs. Supervisors use it as the shop's work queue; Stores uses its Material view to reserve and issue.

## The three views
- **Progress** (the default) — every released piece as a tree of its codes, its operations on the right, and how much is done higher up.
- **Steps** — every released step and what it waits for.
- **Material** — what the steps need, and what is still to reserve.

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

## Good to know
- A refusal lists every reason — read them all; usually a step waits for two or three things at once.
- Start, Record and Hold need the production manage permission; Reserve and Issue need the production manage or the inventory manage permission.
- Operators normally record on the Machine log; the Tracker is for supervisors and catching up.

## Related
- [Machine log](help:production-floor)
- [Issuing material to production](help:stores-issuing)
- [A production order](help:production-order)
