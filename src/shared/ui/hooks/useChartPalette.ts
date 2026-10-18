import { useEffect, useState } from 'react';
import { useThemePreference } from '@core/contexts/ThemeContext';

const FALLBACK = ['#6D28D9', '#0891B2', '#DB2777', '#CA8A04', '#4338CA', '#0F766E', '#C2410C', '#64748B'];

/**
 * The chart palette (`--c-chart-1` … `--c-chart-8`, DESIGN_SYSTEM.md §5.1) as
 * hex strings, for chart libraries that cannot take a CSS variable. Re-read
 * when light/dark changes. Use the colours in order; never reorder per chart.
 */
export function useChartPalette(): string[] {
  const { resolvedMode } = useThemePreference();
  const [colors, setColors] = useState<string[]>(FALLBACK);
  useEffect(() => {
    // After paint: the theme scope sets data-ui/data-theme on <html> first.
    const id = requestAnimationFrame(() => {
      const css = getComputedStyle(document.documentElement);
      const read = FALLBACK.map((f, i) => css.getPropertyValue(`--c-chart-${i + 1}`).trim() || f);
      setColors(read);
    });
    return () => cancelAnimationFrame(id);
  }, [resolvedMode]);
  return colors;
}
