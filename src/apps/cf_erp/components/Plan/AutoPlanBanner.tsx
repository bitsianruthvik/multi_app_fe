import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';

const BUY_LIST = 'see the Buy list'; // the planner's own words; the link goes to the Purchase board

/** A note that sends the reader to the Buy list gets the link in place of the words. */
function noteText(line: string, buyListPath?: string): ReactNode {
  const at = buyListPath ? line.indexOf(BUY_LIST) : -1;
  if (at < 0) return line;
  return <>{line.slice(0, at)}see the <Link to={buyListPath!}>Buy list</Link>{line.slice(at + BUY_LIST.length)}</>;
}

/** What auto-plan would do, in plain lines, with the two choices. Nothing is saved until Apply. */
export function AutoPlanBanner({ lines, buyListPath, onApply, onDiscard }: { lines: string[]; buyListPath?: string; onApply: () => void; onDiscard: () => void }) {
  const shown = lines.slice(0, 6);
  return (
    <Box role="status" sx={{ p: 1.5, borderRadius: '10px', background: 'var(--c-primary-50)', border: '1px solid var(--c-primary-200)', display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Box sx={{ flex: 1, minWidth: 240 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'var(--c-primary-900)' }}>Here is the suggested plan</Typography>
        {shown.length === 0
          ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nothing would change.</Typography>
          : <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 13, color: 'var(--c-text)' }}>{shown.map((l, i) => <li key={i}>{noteText(l, buyListPath)}</li>)}</Box>}
        {lines.length > shown.length && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>and {lines.length - shown.length} more</Typography>}
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" onClick={onApply}>Apply</Button>
        <Button variant="text" onClick={onDiscard}>Discard</Button>
      </Box>
    </Box>
  );
}
