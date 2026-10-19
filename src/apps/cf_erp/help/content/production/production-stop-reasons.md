---
id: production-stop-reasons
title: Stop reasons
area: production
roles: [production, maintenance, admin]
routes: ["/:company/cf_erp/stop-reasons"]
order: 51
---
Why a machine stood still — the buttons operators tap on the machine log when a machine is idle. Keep the list short so the choice is quick.

## What you see
- Columns: **Order** (the position at the machine), **Reason**, **Asks for a note**, **Status**; hidden: **Code**.

## How to add a reason
1. Click **New reason**.
2. Type the **Reason** — the words on the button at the machine.
3. Set **Position in the list**; smaller numbers come first.
4. Tick **Ask for a few words when it is chosen** for reasons that need explaining, such as "Other".
5. Leave **Status** active and save.

## How to retire a reason
- Set **Status** to inactive to hide it from the machine. Delete it only if it was a mistake — stops already recorded keep it either way.

## Good to know
- Changing the list needs the production manage permission.

## Related
- [Machine log](help:production-floor)
- [Operators](help:production-operators)
