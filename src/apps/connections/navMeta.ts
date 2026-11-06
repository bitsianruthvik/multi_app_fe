import type { NavSection } from '@shared/ui';

/** The single source of connections navigation. routes.tsx must use the same paths. */
export const SECTIONS: NavSection[] = [
  {
    key: 'connections',
    label: 'Connections',
    screens: [{ label: 'Connections', path: 'list', keywords: ['onedrive', 'sharepoint', 'files', 'data source'] }],
  },
];
