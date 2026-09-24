# Fab ERP — Design System Appendix

> The platform rules live in `multi_app_fe/DESIGN_SYSTEM.md` — principles, archetypes, tokens,
> recipes, accessibility, the decision procedure. **Read that first.** This file holds only what is
> true of Fab ERP specifically: how its world is shaped, which entities link to which, and which
> archetype each of its routes is.
>
> It was split out of the main document when the design system was promoted to platform level, so
> that CF_HRMS and every app after it inherit the rules without inheriting a factory.
>
> These are the old §2 and §8. Their numbering is kept (A2, A8) so existing references still land.

---

## A2. Information architecture — how Fab ERP fits together

### A2.1 The two worlds

```
┌─────────────────────────────  CONFIGURE  ───────────────────────────────┐
│  (build the factory model — relatively static, Engineering/Admin)         │
│   Plants ──┬── Stock Locations                                            │
│            └── Shift Calendars ── Shifts / Working days                   │
│   Resource Types ── Resources (machines/labor)   ◄── use Calendars        │
│   Item Taxonomy:  Category ─ Group ─ Sub-group                            │
│        └ Item Catalog (parts)                                             │
│             ├── Material BOM ── BOM Items      (what goes into what)      │
│             ├── Operation Flows ── Steps ── deps/inputs/outputs/formulas  │
│             ├── Stock policy / batches                                    │
│             └── Suppliers ── Supplier×Item (lead time, cost, MOQ)         │
│   Item fields / Constants / Operations / Templates (formula inputs)       │
└───────────────────────────────────────────────────────────────────────────┘
                                   │  feeds
                                   ▼
┌──────────────────────────────  OPERATE  ─────────────────────────────────┐
│  (run production — daily flow, PM / Planner / Stores)                     │
│   Sales Order ──► Order wizard ──► Production orders ──► Plan Board        │
│        (demand)   (BOQ, nesting,   (cutting + fabrication)                 │
│                    flows)        ──► Purchase Orders ──► GRN ──► Stock     │
│   Order lifecycle:  Capture ─ Planned ─ Scheduled ─ In production ─ Shipped│
└───────────────────────────────────────────────────────────────────────────┘
```

**Key teaching:** items, BOMs and flows are **not a parallel flow to orders** — they are the *fuel*
the order flow burns. Planning reads an item's BOM and stock to decide what to make or buy; the
board reads flows, resources and calendars to place work in time. So the UI must let a planner
glance "sideways" into the model mid-operation (open the BOM behind a production order) and let an
engineer see "is the model complete enough to run?" (the Readiness archetype, §4.8).

This two-world split is Fab ERP's own. It is not a platform rule — CF_HRMS's worlds are
*definition* (roles, positions, content) and *people* (employees, assignments, attendance), which
is a different shape with the same lesson: group by mindset, not by table.

### A2.2 The entity relationship web

This is what drives the cross-links on every detail screen (§4.3). Always render them.

| From | Links to (render as clickable chips/rows) |
|---|---|
| **Item (catalog)** | its BOM(s) · Operation Flow(s) · Stock balance/batches · Suppliers · Orders containing it · Taxonomy |
| **Material BOM** | parent Item · component Items · Flows built on it |
| **Operation Flow** | its BOM → Item · each step's Resource Type · formulas |
| **Resource Type** | its Resources · Plant · Shift Calendar · flow steps using it |
| **Order** | its Lines (→Item) · BOM/flows used · child/parent orders · Schedule entries · Supplier (PO) |
| **Supplier** | Supplier×Item rows (→Item) · GRNs · POs |
| **GRN** | Supplier · Lines (→Item + Batch) · resulting Stock ledger entries |
| **Plant** | Stock Locations · Resources · Calendars |

### A2.3 Roles → flow

| Role | Lives in | Primary actions |
|---|---|---|
| **PM / Sales** (`fab_erp_projects_*`) | Operate · Orders | capture/confirm orders, watch due dates & exceptions, ship |
| **Planner** (`fab_erp_planner_*`) | Operate · Board → Month → Actuals | plan work, resolve conflicts, watch what fits |
| **Operator** (`fab_erp_taskqueue_*`) | Operate · Queue · Machines | start/stop work, log time, report output |
| **Stores / Buyer** (`fab_erp_grn_*`, `fab_erp_inventory_*`) | Operate · Procurement | raise POs for shortages, receive (GRN), watch low stock |
| **Engineering / Admin** (`fab_erp_items_*`, `_resources_*`, `_operations_*`, `_calendars_*`) | Configure | define items/BOMs/flows/resources/calendars; check readiness |

Gate with `usePermission(tag)` for one tag, or the `useIsPermitted()` predicate when filtering a
list. A role simply sees fewer cockpit cards and fewer nav entries — the same components,
filtered.

---

## A8. Route → archetype map

Every live Fab ERP route and the archetype (§4 of the platform document) it is built as. `/mrp`,
`/workbench`, `/scheduler` and `/routing-plans` were removed from the product in 2026-07-14
(EU-15); don't reintroduce rows for them.

| Route | Archetype | Notes |
|---|---|---|
| `/home` | **Cockpit** (4.1) | Factory Pulse: KPI row → exception feed → role work queues. One `GET /pulse` |
| `/setup` | **Readiness** (4.8) | Setup hub; the config screens as cards with live counts |
| `/orders` | **Pipeline** (4.4) default + **List** (4.2) toggle | board is the headline; keep list for power users |
| `/orders/:id` | **Detail** (4.3) | header + cross-links + tabs; lines table is a `DataTable` |
| `/customers` | **List** (4.2) | |
| `/grn` | **Run/Form** (4.6) | receive flow; NOT a `DataTable` candidate — it's an entry form |
| `/grn-detail` | **Detail** (4.3) | expandable lines; NOT a `DataTable` candidate |
| `/item-batches` | **List** (4.2) | expandable stock rows; NOT a `DataTable` candidate |
| `/task-queue` | **Cockpit-of-work** (4.1 variant) | operator-facing, live |
| `/task-engine` | **Canvas** (4.5) | React Flow swimlanes + docked inspector |
| `/plan-board` | **Board** (4.4 variant) / **Canvas** (4.5) | machine lanes + agenda panel; week/month roll up |
| `/month` | **Analytical dashboard** (4.9) + **Run** (4.6) | what fits this month; auto-fill and what-if |
| `/actuals` | **Analytical dashboard** (4.9) | the board's mirror — what actually happened |
| `/machine-board` | **Board** (4.4 variant) | machine cards by state, live |
| `/machine-timeline` | **Analytical dashboard** (4.9) | Gantt/utilisation over a time window |
| `/people` | **List** (4.2) + **Sheet** | crew, contractors; `SideSheet` per person |
| `/shift-log` | **Run/Form** (4.6) | back-entry of a past shift, machine tabs |
| `/reconciliation` | **Run** (4.6) | resolve unaccounted machine time |
| `/critical-chain` | **Analytical dashboard** (4.9) | fever charts, drum strip, chain Gantt |
| `/analytics` | **Analytical dashboard** (4.9) | touch vs wait, machine-state distribution |
| `/item-catalog` | **List** (4.2) | Items tab is a virtualized grid — see §4.2's note; taxonomy tabs are tables |
| `/item-catalog/:id` | **Detail** (4.3) | custom-field tables are inline-editable forms, NOT `DataTable` |
| BOM designer (in item detail) | **Canvas** (4.5) / **Tree** (4.7) | structural editor |
| `/bom-templates` | **List** (4.2) | |
| `/operations` | **List** (4.2) + **Detail** | Details · Variables · Resource Types tabs |
| `/operation-flows` | **List** (4.2) + **Canvas/Sheet** | flow list → editable step sheet |
| `/progress-templates` | **List** (4.2) + **Detail** | template → ordered stages |
| `/plants` | **List** (4.2) → **Detail** | plants · stock locations · stock levels tabs |
| `/resource-types` | **List** (4.2) / **Detail** | types → resources + machines tab |
| `/shift-calendars` | **List** (4.2) + **Detail** | calendar → shifts, working days |
| `/suppliers`, `/suppliers/:id` | **List** + **Detail** | supplier → supplier×item |
| `/item-metrics`, `/constants` | **List** (4.2) | simple reference tables |
| `/buffer-config` | **Settings** (4.10) | per-machine buffer setup |
| `/codegen-settings` | **Settings** (4.10) | prefixes and sequences |

---

## A-note: Fab ERP's components predate the kit

`@shared/ui` is the platform kit, and every new app builds on it. Fab ERP's components in
`src/apps/fab_erp/components/` are the ones the kit was generalised *from*: it is in production,
its copies have drifted, and migrating it is separate work. Until then:

- **Inside fab_erp**, keep importing from `./components`. Do not mix the two kits in one screen —
  two `DataTable`s with different storage keys on one page is worse than either alone.
- **Improvements are made in the kit first**, then back-ported here if fab_erp needs them now.
- `src/theme/tokens.css` (scoped `[data-app='fab_erp']`) is fab_erp's token copy; the kit's is
  `src/shared/ui/tokens.css` (scoped `[data-ui='platform']`). They hold the same values. A change
  to one is a change to both until fab_erp migrates.
