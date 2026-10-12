import type { DataType } from '../api/types';

/** A specification's data type, in words. */
export const TYPE_LABEL: Record<DataType, string> = { number: 'Number', text: 'Text', boolean: 'Yes / no', date: 'Date', option: 'Pick-list', table: 'Table' };
