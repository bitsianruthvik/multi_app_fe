# Fab Flow Scheduler — Gantt Rendering Algorithm

> **Read this before editing any lane/bar layout logic in `PlanSchedule.tsx`.**

---

## 1. What the backend produces

`GET /plans/:planId/schedule` returns:
- `workAreas[]` — each has `id`, `name`, `maxParallelJobs`
- `tasks[]` — each has `startDate`, `endDate`, `scheduledHours`, `workAreaId`, `isCritical`, `isUnassigned`

`maxParallelJobs` is the hard capacity of the work area: the maximum number of tasks that may run **simultaneously** in that area. The backend scheduler already respects this when assigning dates, so the schedule should never violate it — but forced-placement edge cases can produce overlap (see §3).

---

## 2. `assignLanes(tasks, maxLanes)` — interval partitioning

**Goal:** assign tasks to the minimum number of visual swim-lanes, capped at `maxLanes = wa.maxParallelJobs`.

**Algorithm (greedy, O(n²) worst case):**
1. Sort tasks by `startDate` ascending.
2. For each task, find the first existing lane whose last task ends **strictly before** this task starts (`lane.last.endDate < task.startDate`). Strict `<` means same-day tasks are **never** sequential in the same lane — they run concurrently.
3. If found → append to that lane.
4. If not found and `lanes.length < maxLanes` → open a new lane.
5. If not found and lanes are full → **force** the task into the lane whose last task ends earliest (best-fit). This is the only case where a lane can contain overlapping tasks.

**Invariant to preserve:**
- The number of lanes produced ≤ `maxParallelJobs`.
- This means the number of visual horizontal rows on any given day ≤ `maxParallelJobs`.
- **Do not change this.** Adding sub-rows would make it look like there is more capacity than exists.

---

## 3. `groupByOverlap(tasks)` — overlap grouping within a lane

**Why this exists:** In the rare forced-placement case (step 5 above), two or more tasks end up in the same lane with overlapping date ranges. They must not draw on top of each other, but they also must not create extra visual rows (that would inflate the apparent capacity beyond `maxParallelJobs`).

**Algorithm (Union-Find):**
1. For each pair of tasks in the lane, check if their date ranges intersect: `a.start ≤ b.end AND b.start ≤ a.end`.
2. Union overlapping pairs. Result: connected components of mutually-reachable overlapping tasks.
3. Each component becomes a group. Non-overlapping tasks form singleton groups.

**Output:** `ScheduleTask[][]` — array of groups, each group sorted by `startDate` before rendering.

---

## 4. Rendering each lane

For each lane `li` within a work area:

```
laneTop = current y offset
LANE_H  = 80px  (total height of one lane row)
BAR_PAD = 6px   (top/bottom padding inside the lane)
```

**Singleton group (no overlap):**
- `bh = calcBarH(task.scheduledHours)` — proportional to hours, max = inner height, min = 10px.
- Bar is vertically centred: `top = laneTop + (LANE_H - bh) / 2`.

**Multi-task overlap group:**
- Total hours = sum of all tasks in the group.
- Inner height = `LANE_H - BAR_PAD * 2`.
- Each task's bar height = `max(10, round(task.hours / max(totalHrs, 8) * inner))`.
- Bars are stacked top-to-bottom with a 2px gap, starting at `laneTop + BAR_PAD`.
- Each task uses its own `taskLeft` / `taskWidth` (they may have different date ranges).
- If the stack overflows `laneTop + LANE_H`, remaining bars are clipped (break early).

**`calcBarH(hours)`:** maps `[0, 8]` hours → `[MIN_BAR_H, inner]` px. Tasks longer than 8 h are capped visually (one full workday = full bar height).

---

## 5. Key invariants — must not be broken

| Invariant | Why |
|---|---|
| Visual lane count per day ≤ `maxParallelJobs` | Lanes represent real parallel capacity |
| No sub-rows that add extra height to a lane | Same as above |
| Overlapping tasks in a lane are visually distinguishable | User must see all tasks |
| `assignLanes` places tasks sorted by `startDate` | Ensures greedy fill is deterministic |
| Same-day tasks always go to separate lanes (strict `<`) | They run concurrently, not sequentially |
| `groupByOverlap` only stacks within existing `LANE_H` | Does not grow the row height |

---

## 6. Files involved

| File | Role |
|---|---|
| `PlanSchedule.tsx` | All Gantt rendering: `assignLanes`, `groupByOverlap`, `GanttChart`, `TaskBar`, `DayDetailView` |
| `scheduleService.js` (backend) | Produces the schedule; `maxParallelJobs` comes from `fab_work_areas.max_parallel_jobs` |
| `fab_work_areas` table | Stores `max_parallel_jobs` per work area |
