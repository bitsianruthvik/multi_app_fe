export interface RawEdge { source: number; target: number; isInferred: boolean }

export interface CriticalPathResult {
  stepIds: Set<number>;
  totalMinutes: number;
}

function toMinutes(value: number | null | undefined, unit: string | null | undefined): number {
  if (!value) return 0;
  const u = (unit ?? 'min').toLowerCase();
  return u === 'hr' || u === 'hrs' || u === 'hour' || u === 'hours' ? value * 60 : value;
}

export function computeCriticalPath(
  steps: { id: number; estimatedTimeValue: number | null; estimatedTimeUnit: string | null }[],
  edges: { source: number; target: number }[],
): CriticalPathResult {
  if (steps.length === 0) return { stepIds: new Set(), totalMinutes: 0 };

  const adj: Record<number, number[]> = {};
  const weights: Record<number, number> = {};
  const inDeg: Record<number, number> = {};

  for (const s of steps) {
    adj[s.id] = [];
    weights[s.id] = toMinutes(s.estimatedTimeValue, s.estimatedTimeUnit);
    inDeg[s.id] = 0;
  }
  for (const e of edges) {
    if (adj[e.source] !== undefined) adj[e.source].push(e.target);
    inDeg[e.target] = (inDeg[e.target] ?? 0) + 1;
  }

  // Topological sort (Kahn's algorithm)
  const queue = steps.filter((s) => !inDeg[s.id]).map((s) => s.id);
  const topo: number[] = [];
  while (queue.length > 0) {
    const v = queue.shift()!;
    topo.push(v);
    for (const w of adj[v] ?? []) {
      inDeg[w]--;
      if (inDeg[w] === 0) queue.push(w);
    }
  }

  // DP: longest weighted path
  const dist: Record<number, number> = {};
  const prev: Record<number, number | null> = {};
  for (const s of steps) {
    dist[s.id] = weights[s.id];
    prev[s.id] = null;
  }
  for (const v of topo) {
    for (const w of adj[v] ?? []) {
      const candidate = dist[v] + weights[w];
      if (candidate > dist[w]) {
        dist[w] = candidate;
        prev[w] = v;
      }
    }
  }

  // Find end of critical path
  let maxDist = 0;
  let endId = steps[0].id;
  for (const s of steps) {
    if ((dist[s.id] ?? 0) > maxDist) {
      maxDist = dist[s.id];
      endId = s.id;
    }
  }

  // Trace back
  const cpIds = new Set<number>();
  let cur: number | null = endId;
  while (cur !== null) {
    cpIds.add(cur);
    cur = prev[cur] ?? null;
  }

  return { stepIds: cpIds, totalMinutes: maxDist };
}
