import { useState, type ReactNode } from 'react';
import { Box, MenuItem, TextField } from '@mui/material';
import { DetailTabs } from '../DetailLayout';
import { TimesPanel } from './TimesPanel';
import { AssignPanel } from './AssignPanel';

export interface ProductionTabLine { id: number; lineNo: number; label: string }

/**
 * The Production screen as three quiet tabs — Times, Contractors, Tracker.
 * The tracker is whatever the caller already draws (the release view); this
 * only puts the two planning screens beside it. When an order has several
 * lines and the caller does not fix one, a small picker chooses which line the
 * Times and Contractors tabs are about.
 */
export function ProductionTabs({ orderId, lines, lineId, released, tracker }: {
  orderId: number;
  lines: ProductionTabLine[];
  /** The line to show; omit to let the person pick from `lines`. */
  lineId?: number;
  released: boolean;
  tracker: ReactNode;
}) {
  const [tab, setTab] = useState<'times' | 'contractors' | 'tracker'>(released ? 'tracker' : 'times');
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = lineId ?? (lines.find((l) => l.id === picked) ?? lines[0])?.id ?? null;
  const showPicker = lineId === undefined && lines.length > 1;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <DetailTabs active={tab} onTab={(v) => setTab(v as typeof tab)}
          tabs={[{ value: 'times', label: 'Times' }, { value: 'contractors', label: 'Contractors' }, { value: 'tracker', label: 'Tracker' }]} />
        {showPicker && tab !== 'tracker' && (
          <TextField select size="small" label="Line" value={chosen ?? ''} onChange={(e) => setPicked(Number(e.target.value))} sx={{ minWidth: 220 }}>
            {lines.map((l) => <MenuItem key={l.id} value={l.id}>{l.lineNo} · {l.label}</MenuItem>)}
          </TextField>
        )}
      </Box>
      {tab === 'tracker' && tracker}
      {tab === 'times' && chosen != null && <TimesPanel key={chosen} orderId={orderId} lineId={chosen} />}
      {tab === 'contractors' && chosen != null && <AssignPanel key={chosen} orderId={orderId} lineId={chosen} />}
    </Box>
  );
}
