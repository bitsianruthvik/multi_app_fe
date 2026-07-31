import { useEffect, useState } from 'react';

/**
 * Resolve the chart tokens to literal colours.
 *
 * Hand-rolled SVG can use `var(--c-chart-1)` directly, but charting libraries
 * (@mui/x-charts) need real colour strings — they compute gradients, legend
 * swatches and tooltip borders in JS. So we read the computed values off the
 * root element once, and re-read whenever the theme flips, because the same
 * token resolves to a different hex in dark mode.
 *
 * This is the only place in fab_erp that is allowed to read a design token at
 * runtime. Everything else references `var(--…)` in CSS, per DESIGN_SYSTEM §5.
 */

export interface ChartColors {
  series: string[];
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipText: string;
  text: string;
  textMuted: string;
}

const SERIES_TOKENS = [
  '--c-chart-1', '--c-chart-2', '--c-chart-3', '--c-chart-4',
  '--c-chart-5', '--c-chart-6', '--c-chart-7', '--c-chart-8',
];

function read(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (token: string, fallback: string) => cs.getPropertyValue(token).trim() || fallback;
  return {
    // Fallbacks matter: if a chart renders before tokens.css applies (or outside
    // a fab_erp route), an empty string would make every series invisible.
    series: SERIES_TOKENS.map((t, i) => v(t, ['#6D28D9', '#0891B2', '#DB2777', '#CA8A04', '#4338CA', '#0F766E', '#C2410C', '#64748B'][i])),
    grid: v('--c-chart-grid', '#ECEDF5'),
    axis: v('--c-chart-axis', '#8A8EA8'),
    tooltipBg: v('--c-chart-tooltip-bg', '#1A1C2E'),
    tooltipText: v('--c-chart-tooltip-text', '#FFFFFF'),
    text: v('--c-text', '#1A1C2E'),
    textMuted: v('--c-text-2', '#5A5E78'),
  };
}

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read);

  useEffect(() => {
    // ThemeContext toggles data-theme on <html>; re-resolve when it changes so
    // charts follow light/dark without a remount.
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-app'],
    });
    // One deferred re-read covers the first paint, when the stylesheet may not
    // have been applied at the time of the initial useState call.
    const raf = requestAnimationFrame(() => setColors(read()));
    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return colors;
}
