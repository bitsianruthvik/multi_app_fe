import { useEffect, useState } from 'react';
import { orgChartApi, type PositionCard } from '../api/orgchart';

/** "Day", not "Day shift": the label beside it already says Shift. */
export function shiftWord(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n.replace(/\s+shift$/i, '') || n;
}

/**
 * The position's card read (`/orgchart/positions/:id/card`): reporting, direct
 * reports, qualifications, open points. `refreshKey` re-reads it — the views
 * pass something that changes when the chart reloads. A null id reads nothing.
 */
export function usePositionCard(positionId: number | null, asOf: string, refreshKey: string) {
  const [loaded, setCard] = useState<PositionCard | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (positionId == null) return;
    let live = true;
    setLoading(true);
    setError(null);
    orgChartApi
      .card(positionId, asOf)
      .then((c) => {
        if (live) setCard(c);
      })
      .catch((e) => {
        if (live) setError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [positionId, asOf, refreshKey]);
  // A card from the previous position must never sit under this one's title.
  const card = loaded && loaded.positionId === positionId ? loaded : null;
  return { card, error, loading };
}
