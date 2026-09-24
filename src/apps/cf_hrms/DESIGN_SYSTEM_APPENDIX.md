# CF_HRMS — information architecture

> The app-specific half of `multi_app_fe/DESIGN_SYSTEM.md` §2. The platform doc says how a screen
> should look; this says how **this app's world divides**, which is most of the design work.
>
> **Written late, 2026-09-24, after the first build got it wrong** — the nav was organised around the
> database (Organisation · People · Roles · Workforce · Leave · Documents · Setup) and Home was a
> stub, so the app opened onto an empty page and then a menu of tables. That is principle #1
> inverted: *flow over inventory*. This file exists so the second pass has something to build against.

## A1. The three worlds

HRMS is not two worlds like an ERP. It is three, and they belong to different people on different
days.

```
┌── DEFINE ────────────────────────────────────────────────────────────┐
│  what work exists, and what the organisation looks like              │
│  (HR + management, changes slowly, the model everything else reads)  │
│    Locations · Departments · Work contexts                           │
│    Roles ── KRAs · Responsibilities · KPIs · Skills · Quals · Authority │
│    Positions ── formal reporting · sanctioned headcount              │
└──────────────────────────────────────────────────────────────────────┘
                              │ the model
                              ▼
┌── STAFF ─────────────────────────────────────────────────────────────┐
│  who is doing that work, right now                                   │
│  (HR, changes whenever somebody joins, moves or leaves)              │
│    Employees ── documents · identifiers · history                    │
│    Work assignments ── allocation · contexts · ACTUAL reporting      │
│    Job descriptions · responsibility profiles                        │
└──────────────────────────────────────────────────────────────────────┘
                              │ the people
                              ▼
┌── RUN ───────────────────────────────────────────────────────────────┐
│  the daily operation                                                 │
│  (supervisors and HR, changes every day)                             │
│    Roster · Attendance · Regularisation · Manpower gaps              │
│    Leave requests · balances                                         │
└──────────────────────────────────────────────────────────────────────┘
```

**The teaching this carries:** DEFINE is not settings and RUN is not reporting. A vacancy is a DEFINE
fact (a sanctioned seat with nobody in it) that RUN feels every day (nobody on the machine tonight).
The app should make that connection visible, because it is the thing an SME actually loses money on.

## A2. The entity relationship web

**This table is not documentation — it is the source for the cross-link chips every Detail screen
renders (§4.3). A row missing here is a link missing from the product.**

| From | Links to (render as clickable chips) |
|---|---|
| **Employee** | their Work assignments (→ Role, Position) · Contractor · Documents · Employment events · Attendance · Leave · their Responsibility Profile |
| **Work assignment** | Employee · Role · Position · Work contexts · **its managers** (→ Employee, and which of the manager's own assignments) · people who report to it · its overlays |
| **Role** | Positions using it · Work assignments using it · KRAs · Responsibilities · KPIs · Skills · Qualifications · Authorities · Department · its Role JD |
| **Position** | Role · Department · Location · Work contexts · **occupants** (→ Employee) · who it reports to · who reports to it · its overlays · its manpower requirements |
| **Work context** | Positions covering it · Work assignments on it · Location · Department · its manpower requirements |
| **Department** | parent/child Departments · Positions · Roles defaulting to it · Employees via their assignments |
| **KRA / Responsibility / KPI** | Roles that assign it · the KRA it groups under · positions/assignments that override or suppress it |
| **Shift** | Positions defaulting to it · Assignments defaulting to it · Roster entries · Manpower requirements |
| **Leave request** | Employee · Leave type · Approver · the Attendance days it produced |
| **Open point** | the entity it hangs off (Position / Role / Assignment / Context) |

## A3. Roles → flow

A role sees **fewer cockpit cards and fewer nav entries — never different components.**

| Role | Lives in | Lands on | Primarily does |
|---|---|---|---|
| **HR admin** | all three worlds | Home | hires, assigns, answers open points, generates JDs |
| **HR executive** | STAFF + RUN | Home | attendance, leave, documents, regularisation |
| **Line manager / supervisor** | RUN | Home, filtered to their own reports | marks attendance, approves leave, sees their team's gaps |
| **Management** | DEFINE, read-only | Org chart | looks at structure, vacancies and manpower |
| **Employee** (future) | self only | their own profile | their JD, their leave, their attendance |

## A4. Home — the cockpit (§4.1), and what it must not be

**It is a to-do surface, not a dashboard.** Work-queue cards, each a real pending queue with a count
and one primary action, each from a real query, each permission-gated. Ordered by what goes wrong if
it is ignored.

For Karni's actual data, these are the cards that would have content on day one:

| Card | Query | Action |
|---|---|---|
| **Open points** | 111 unresolved organisation questions | "Resolve" |
| **Roles with no purpose** | 63 of 63 — a role with no purpose cannot produce a usable JD | "Write purpose" |
| **Vacant seats** | 156 of 169 sanctioned | "See the chart" |
| **People with no assignment** | anyone doing no recorded work | "Assign" |
| **Leave awaiting approval** | pending requests | "Review" |
| **Attendance not marked** | today, by shift | "Mark" |
| **Documents expiring** | within 30 days | "Check" |

**Don't** put charts here. Analytics is §4.9 and a different screen. If a number here needs acting
on, it links to the screen that acts.

## A5. Nav grouping

The current `navMeta.ts` lists tables. It should list the three worlds, with Setup as the quiet
fourth. Same screens, grouped by mindset:

```
Home │ Organisation │ People │ Work │ Setup
        (DEFINE)      (STAFF)  (RUN)
```

- **Organisation** — Org chart · Positions · Roles · Departments · Locations · Work contexts
  (Roles moves here: a role is part of what the organisation *is*, not a separate world.)
- **People** — Employees · Work assignments · Documents (JDs and profiles)
- **Work** — Attendance · Roster · Leave · Manpower
- **Setup** — the six content masters, Shifts, Holidays, Leave types, Reporting types, Contractors,
  Open points, Import

Row 2 keeps the screens of the active section, as today. The masters (KRAs, Responsibilities, KPIs,
Skills, Qualifications, Authorities) move **out** of the top nav and into Setup — they are
vocabulary, edited rarely, and six of the eleven row-2 entries under Roles today are vocabulary
lists nobody visits daily.
