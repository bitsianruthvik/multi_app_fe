import { Typography } from '@mui/material';
import { Mono } from '@shared/ui';

/**
 * What a create or edit dialog shows where a code input used to be
 * (CF_HRMS_HIRING_SPEC.md §11): a code is issued by the server when the record
 * is created, from Setup › Code formats, and is never typed or changed.
 *
 * One component so the sentence reads the same for a department, a role, a
 * position, a location and an employee.
 */
export function CodeNote({ code, isNew }: { code?: string | null; isNew: boolean }) {
  return (
    <Typography data-code-note="" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
      {isNew ? (
        'The code is issued when you save.'
      ) : code ? (
        <>
          Code <Mono sx={{ fontSize: 13, color: 'var(--c-text)' }}>{code}</Mono>
        </>
      ) : (
        'This record has no code.'
      )}
    </Typography>
  );
}
