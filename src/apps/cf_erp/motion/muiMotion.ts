import type { ThemeOptions } from '@mui/material/styles';
import { duration, easing, pressScale, transition } from './tokens';

/**
 * MUI transition timings from the motion tokens. Goes in the FIRST argument of
 * createTheme (theme.transitions.create() closes over it), see ../theme.ts.
 * Dialog / Snackbar use enteringScreen / leavingScreen, Tooltip `shorter`,
 * Collapse `standard`.
 */
export const motionTransitions: ThemeOptions['transitions'] = {
  duration: {
    shortest: duration.fast,
    shorter: duration.base,
    short: duration.slow,
    standard: duration.slow,
    complex: duration.panel,
    enteringScreen: duration.slow,
    leavingScreen: duration.base,
  },
  easing: {
    easeInOut: easing.standard,
    easeOut: easing.standard,
    easeIn: easing.exit,
    sharp: easing.exit,
  },
};

const PRESSED = '&:active:not(.Mui-disabled)';
/** Press feedback: scale 0.98 while held. Re-declares `transition` because each button sets its own. */
const press = {
  transition: transition(['background-color', 'box-shadow', 'border-color', 'color'], duration.fast) + `, transform ${duration.fast}ms ${easing.standard}`,
  [PRESSED]: { transform: `scale(${pressScale})` },
  '@media (prefers-reduced-motion: reduce)': { [PRESSED]: { transform: 'none' } },
};

/** Hover elevation, only for cards/papers that are clickable. Non-interactive ones never move. */
const INTERACTIVE_HOVER = '&[role="button"]:hover, a&:hover, &.cfm-interactive:hover';
const hoverLift = { boxShadow: 'var(--e-2)' };

/**
 * Component overrides, deep-merged by createTheme as its SECOND argument, so
 * the existing theme.ts overrides stay untouched (MUI merges styleOverrides).
 */
export const motionComponents: ThemeOptions = {
  components: {
    MuiButton: { styleOverrides: { root: press } },
    MuiIconButton: { styleOverrides: { root: press } },
    MuiToggleButton: { styleOverrides: { root: press } },
    MuiFab: { styleOverrides: { root: press } },
    MuiCard: {
      styleOverrides: {
        root: { [`${INTERACTIVE_HOVER}, &:has(> .MuiCardActionArea-root):hover`]: hoverLift },
      },
    },
    MuiPaper: { styleOverrides: { root: { [INTERACTIVE_HOVER]: hoverLift } } },
    MuiDialog: {
      styleOverrides: {
        // A 6px rise on top of the backdrop fade (the keyframes are in motion.css).
        paper: { animation: `cfm-rise-in ${duration.slow}ms ${easing.standard} both` },
      },
    },
    MuiDrawer: { defaultProps: { transitionDuration: { enter: duration.panel, exit: duration.slow } } },
    MuiMenu: { defaultProps: { transitionDuration: { enter: duration.base, exit: duration.fast } } },
    MuiPopover: { defaultProps: { transitionDuration: { enter: duration.base, exit: duration.fast } } },
    MuiSnackbar: { defaultProps: { transitionDuration: { enter: duration.slow, exit: duration.base } } },
    MuiCollapse: { defaultProps: { timeout: duration.slow } },
  },
};
