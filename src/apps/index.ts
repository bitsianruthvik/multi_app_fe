export { audioIntelligenceApp } from './audio_intelligence';
export { salesControlApp } from './sales_control';
export { fabFlowApp } from './fab_flow';
export { fabErpApp } from './fab_erp';

import { audioIntelligenceApp } from './audio_intelligence';
import { salesControlApp } from './sales_control';
import { fabFlowApp } from './fab_flow';
import { fabErpApp } from './fab_erp';

const appRegistry = [audioIntelligenceApp, salesControlApp, fabFlowApp, fabErpApp];

export function getApp(slug: string) {
  return appRegistry.find((a) => a.slug === slug) ?? null;
}
