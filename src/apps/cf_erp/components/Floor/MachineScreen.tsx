import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, ButtonBase } from '@mui/material';
import { getDay, getQueue, getReasons } from '../../api/floor';
import type { FloorDay, FloorMachine, FloorOperator, FloorQueue, FloorReason } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { Calm } from './floorUi';
import { addDays, dateKey, inShift, TOUCH } from './floorModel';
import { NowTab } from './NowTab';
import { DayTab, SavedNote } from './DayTab';
import { LoadState } from './Pickers';

/** A second tablet at the same machine sees changes within this long. */
export const POLL_MS = 20_000;

type Tab = 'now' | 'day';

/**
 * The machine screen: Now and My day over one shared copy of the queue and the
 * day, polled so two tablets at one machine agree. The queue and the day are
 * loaded together; a failed poll keeps the last good picture on screen.
 */
export function MachineScreen({ machine, operator }: { machine: FloorMachine; operator: FloorOperator }) {
  const [tab, setTab] = useState<Tab>('now');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [queue, setQueue] = useState<FloorQueue | null>(null);
  const [day, setDay] = useState<FloorDay | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [savedText, setSavedText] = useState<string | null>(null);
  const reasons = useLoad<FloorReason[]>(() => getReasons(), []);
  const seq = useRef(0);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 300); return () => window.clearTimeout(t); }, [search]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [q, d] = await Promise.all([getQueue(machine.id, debounced), getDay(machine.id, date)]);
      if (mine !== seq.current) return; // a newer load is on its way; do not paint an older one
      setQueue(q); setDay(d); setFailed(null);
    } catch (e) {
      if (mine === seq.current) setFailed(e instanceof Error ? e.message : 'Could not reach the server.');
    }
  }, [machine.id, debounced, date]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const t = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Early in the morning the shift that is running started yesterday: open on that day.
  useEffect(() => {
    const now = new Date();
    if (now.getHours() >= 12) return;
    let alive = true;
    getDay(machine.id, dateKey(addDays(now, -1))).then((d) => { if (alive && inShift(d, new Date())) setDate(d.date || dateKey(addDays(now, -1))); }).catch(() => {});
    return () => { alive = false; };
  }, [machine.id]);

  const say = useCallback((m: string) => setNotice(m), []);
  const saved = useCallback((note?: string | null) => {
    setNotice(null); setSavedText(note ?? null); setSavedFlash(true);
    window.clearTimeout(flashTimer.current);
    // A reopened job is worth a longer look than a plain "Saved".
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), note ? 6000 : 2500);
  }, []);

  const common = { machine, operator, reasons: reasons.data ?? [], queue, day, refresh, say, saved };
  const tabButton = (t: Tab, label: string) => (
    <ButtonBase key={t} onClick={() => setTab(t)} role="tab" aria-selected={tab === t} sx={{
      flex: 1, minHeight: TOUCH + 8, fontSize: 20, fontWeight: 700, borderBottom: '4px solid', borderColor: tab === t ? 'var(--c-primary-600)' : 'transparent',
      color: tab === t ? 'var(--c-primary-700)' : 'var(--c-text-2)',
    }}>{label}</ButtonBase>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box role="tablist" sx={{ display: 'flex', borderBottom: '1px solid var(--c-border)' }}>
        {tabButton('now', 'Now')}
        {tabButton('day', 'My day')}
      </Box>
      <SavedNote show={savedFlash} text={savedText} />
      {notice && <Calm tone="warning">{notice}</Calm>}
      {failed && <Calm tone="warning">Not up to date — {failed}</Calm>}
      <LoadState loading={reasons.loading && !reasons.data} error={reasons.error} onRetry={reasons.reload} />
      {tab === 'now'
        ? <NowTab {...common} search={search} setSearch={setSearch} />
        : <DayTab {...common} date={date} setDate={setDate} setDay={setDay} />}
    </Box>
  );
}
