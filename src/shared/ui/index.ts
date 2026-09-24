/**
 * @shared/ui — the platform component kit.
 *
 * This is the implementation of DESIGN_SYSTEM.md. An app imports from here:
 *
 *   import { PageHeader, DataTable, StatusBadge } from '@shared/ui';
 *
 * If a component is missing, it is added HERE, not to the app. See README.md.
 */

// ── Contracts ───────────────────────────────────────────────────────────────
export {
  screenKey,
  appPath,
  resolveNav,
  allScreens,
  labelForPath,
  countKeys,
  type BadgeTone,
  type StatusTone,
  type NavScreen,
  type NavSection,
  type CountMeta,
  type CountMetaMap,
  type NavCounts,
  type Can,
  type ResolvedNav,
} from './types';

export {
  registerStatusTones,
  registerStatusLabels,
  statusTone,
  statusLabel,
  chipColorForStatus,
} from './statusRegistry';

export { errorMessage, errorProblems } from './errorMessage';
export { enterSubmits } from './dialogKeys';
export { setUiStorageNamespace, uiStorageNamespace, readPref, writePref } from './storage';

// ── Primitives ──────────────────────────────────────────────────────────────
export { Surface } from './Surface';
export { GlassBar } from './GlassBar';
export { Mono, CapsLabel } from './Mono';
export { PageHeader } from './PageHeader';
export { SectionCard, StickyActionBar } from './SectionCard';
export { StatusBadge, ToneBadge } from './StatusBadge';
export { StatStrip, type Stat } from './StatStrip';
export { EmptyState } from './EmptyState';
export { Callout } from './Callout';
export { StageIcon, type StageState } from './StageIcon';
export {
  SkeletonBlock,
  SkeletonRows,
  ListSkeleton,
  StatSkeleton,
  DetailSkeleton,
  ChartSkeleton,
  CardGridSkeleton,
} from './Skeletons';

// ── Collections ─────────────────────────────────────────────────────────────
export { EntityList, EntityRow, type SortableField, type SortDirection } from './EntityList';
export { DataTable, type DataColumn } from './DataTable';
export { FilterBar, FacetChip } from './FilterBar';
export { SortableTableHead, type SortableColumn } from './SortableTableHead';
export { NumberCell, QtyCell, DateCell } from './Cells';

// ── Records ─────────────────────────────────────────────────────────────────
export {
  DetailLayout,
  DetailTabs,
  DetailHeader,
  CrossLink,
  FactItem,
  type DetailTab,
} from './DetailLayout';
export { RunPanel, type RunState } from './RunPanel';
export { PipelineBoard, PipelineCard, type PipelineStage } from './PipelineBoard';

// ── Overlays ────────────────────────────────────────────────────────────────
export { FormDialog, DialogHeader, DialogCloseButton } from './FormDialog';
export { ConfirmDialog } from './ConfirmDialog';
export { PromptDialog } from './PromptDialog';
export { ErrorNotice } from './ErrorNotice';
export { SideSheet } from './SideSheet';
export { ToastProvider } from './Toast';
export { useToast, type ToastApi, type ToastTone } from './toastContext';
export { ShortcutsHelp, type ShortcutGroup } from './ShortcutsHelp';
export {
  CommandPaletteProvider,
  type PaletteAction,
  type PaletteRecord,
  type CommandPaletteProviderProps,
} from './CommandPalette';
export { useCommandPalette } from './commandPaletteContext';

// ── Shell ───────────────────────────────────────────────────────────────────
export { AppShell } from './shell/AppShell';
export { TopNav, type BrandMark, type QuickCreate } from './shell/TopNav';
export { SectionNav } from './shell/SectionNav';
export { MobileNavSheet } from './shell/MobileNavSheet';
export { ThemeScope } from './shell/ThemeScope';
export { createPlatformTheme, type ThemeMode } from './shell/theme';
export { useDetailTitle, DetailTitleContext } from './shell/detailTitle';

// ── Hooks ───────────────────────────────────────────────────────────────────
export { useCountUp } from './hooks/useCountUp';
export { useSortableData } from './hooks/useSortableData';
export { useIsPermitted } from './hooks/useIsPermitted';
export { useCompanySlug } from './hooks/useCompanySlug';
export { useShortcutsHelp } from './hooks/useShortcutsHelp';
