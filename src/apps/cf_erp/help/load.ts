/**
 * Every help topic, read once. This module is only ever reached through a dynamic import (the help drawer and the
 * Help page are lazy), so the topics' text never sits in the main bundle: Vite puts the glob below — all the
 * Markdown, as strings — in the same lazy chunk, one download for the whole manual (search needs every topic).
 */
import { buildIndex, type HelpIndex } from './registry';

const files = import.meta.glob('./content/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

let index: HelpIndex | null = null;
export function helpIndex(): HelpIndex {
  if (!index) index = buildIndex(files);
  return index;
}
