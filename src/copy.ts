export const COPY = {
  // App identity
  APP_NAME: 'Sales Control',
  COMPANY_TAGLINE: 'Detailing Excellence Platform',

  // Nav labels (must match userNav.tsx)
  NAV_OVERVIEW: 'Overview',
  NAV_START_DETAILING: 'Start Detailing',
  NAV_PERFORMANCE: 'My Performance',
  NAV_SESSION_LOG: 'Session Log',
  NAV_ANALYSES: 'Analyses',

  // Page headings
  PAGE_DASHBOARD: 'Overview',
  PAGE_ANALYSIS: 'Detailing Session Report',
  PAGE_PROGRESS: 'My Performance Overview',
  PAGE_CALL_HISTORY_REP: 'Session Log',
  PAGE_CALL_HISTORY_MANAGER: 'Team Session Log',
  PAGE_AUDIO_REVIEW: 'Session Playback',
  PAGE_PRACTICE_RESULTS: 'Session Complete — Detailing Report',
  PAGE_ADMIN_CONSOLE: 'Administration Console',

  // CTAs
  CTA_START_SESSION: 'Start Detailing Session',
  CTA_BEGIN_SESSION: 'Begin Detailing Session →',
  CTA_PRACTICE_AGAIN: 'Practice Again',
  CTA_VIEW_REPORT: 'View Detailing Report',
  CTA_RETURN_OVERVIEW: 'Return to Overview',
  CTA_GENERATE_TRAJECTORY: 'Generate Trajectory Analysis',

  // Empty states
  EMPTY_SESSIONS: 'No detailing sessions recorded yet. Start your first practice session.',
  EMPTY_ANALYSES: 'No analyses available. Complete a practice session to see your results.',
  EMPTY_CALL_HISTORY: 'No detailing sessions recorded yet. Complete a practice session to see your trajectory.',

  // Vocabulary
  RECORDING: 'Detailing Session',
  SCORE_LABEL: 'Compliance Score',
  ANALYSIS: 'Detailing Report',
  CUSTOMER: 'HCP',
  BRAND: 'Brand Message',
  TRAJECTORY: 'Performance Trajectory',
} as const;
