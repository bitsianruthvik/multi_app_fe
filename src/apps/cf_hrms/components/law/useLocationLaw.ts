/** The law facts of every location (state, minimum-wage zone), read once; `save` writes one when it changed. (Spec §36.1.) */
import { useCallback, useEffect, useState } from 'react';
import { lawApi, type LocationLaw } from '../../api/law';

export interface LocationLawDraft { stateCode: string; zone: string }

export function useLocationLaw(enabled: boolean) {
  const [rows, setRows] = useState<LocationLaw[]>([]);
  const [states, setStates] = useState<{ code: string; name: string }[]>([]);
  const [zones, setZones] = useState<{ code: string; name: string }[]>([]);
  const load = useCallback(() => {
    if (!enabled) return;
    lawApi.locations().then((r) => { setRows(r.locations); setStates(r.states); setZones(r.zones); }).catch(() => { /* the fields stay empty */ });
  }, [enabled]);
  useEffect(load, [load]);
  const draftOf = (id: number | null): LocationLawDraft => {
    const r = id ? rows.find((x) => x.locationId === id) : null;
    return { stateCode: r?.stateCode ?? '', zone: r?.zone ?? '' };
  };
  const save = async (id: number, d: LocationLawDraft) => {
    const before = draftOf(id);
    if (before.stateCode === d.stateCode && before.zone === d.zone) return;
    await lawApi.putLocation(id, { stateCode: d.stateCode || null, zone: d.zone.trim() || null });
    load();
  };
  const stateOf = (id: number) => rows.find((x) => x.locationId === id)?.stateCode ?? null;
  return { rows, states, zones, draftOf, save, stateOf, ready: rows.length > 0 || states.length > 0 };
}

