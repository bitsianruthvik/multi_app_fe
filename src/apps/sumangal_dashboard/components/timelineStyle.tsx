import { Box } from '@mui/material';

/** Colours and legend swatches shared by the timelines. */
export const TL = { wait: 'var(--c-surface-3)', make: 'var(--c-primary-500)', post: '#eb6834', due: 'var(--c-danger-600)', ship: 'var(--c-text)', ready: '#f0a800', grid: 'var(--c-border)', mute: 'var(--c-text-3)', text: 'var(--c-text-2)' };
export const Swatch = {
  bar: (c: string, h = 8) => <Box sx={{ width: 16, height: h, borderRadius: 0.5, background: c }} />,
  tick: (c: string) => <Box sx={{ width: 2, height: 12, background: c }} />,
  dot: (c: string) => <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: c }} />,
  ring: (c: string) => <Box sx={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${c}` }} />,
  diamond: (c: string) => <Box sx={{ width: 8, height: 8, transform: 'rotate(45deg)', background: c }} />,
};
export const SKIP_LEGEND = [
  { label: 'Shipment (bigger = more tonnes)', swatch: Swatch.dot(TL.make) },
  { label: 'Missed slot: nothing due, nothing ready', swatch: Swatch.ring('var(--c-text-3)') },
  { label: 'Missed slot: orders late, nothing ready', swatch: Swatch.ring(TL.due) },
  { label: 'Missed slot: castings were ready', swatch: Swatch.dot(TL.ready) },
];
export const ORDER_LEGEND = [
  { label: 'Order to start', swatch: Swatch.bar(TL.wait, 4) },
  { label: 'Making and pouring', swatch: Swatch.bar(TL.make) },
  { label: 'After pouring until all passed inspection', swatch: Swatch.bar(TL.post) },
  { label: 'Due date', swatch: Swatch.tick(TL.due) },
  { label: 'Shipped (part or all)', swatch: Swatch.diamond(TL.ship) },
];
