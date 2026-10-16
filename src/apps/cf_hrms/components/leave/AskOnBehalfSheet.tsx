/**
 * "Ask on behalf" (CF_HRMS_HIRING_SPEC.md §22.5, §22.6): HR picks a person, then
 * fills the same form the person would, answered by the HR preview route. The
 * request is marked as raised by HR and goes to the person's approver like any
 * other.
 *
 * The person list comes from the balances grid (`GET /leave/balances?q=`): it
 * needs only the leave right, and each row already carries that person's
 * balances for the form.
 */
import { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { ErrorNotice, SideSheet } from '@shared/ui';
import {
  hrLeaveApi, personLine,
  type BalanceGridRow, type LeaveRequest,
} from '../../api/leaveRequests';
import { AskLeaveForm } from './AskLeaveForm';
import { BalanceCards } from './LeaveParts';

const SEARCH_DELAY_MS = 300;

export function AskOnBehalfSheet({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: (r: LeaveRequest) => void;
}) {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<BalanceGridRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [picked, setPicked] = useState<BalanceGridRow | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      hrLeaveApi.balances({ q: text.trim() || undefined })
        .then((g) => { if (live) { setOptions(g.rows.slice(0, 50)); setError(null); } })
        .catch((e) => { if (live) setError(e); })
        .finally(() => { if (live) setLoading(false); });
    }, SEARCH_DELAY_MS);
    return () => { live = false; window.clearTimeout(timer); };
  }, [text, open]);

  const close = () => {
    setPicked(null);
    setText('');
    onClose();
  };

  const balances = picked?.balances ?? [];
  const employeeId = picked?.person.employeeId;

  return (
    <SideSheet open={open} onClose={close} width={780} title="Ask for leave on someone's behalf" subtitle="It goes to their manager like any other request.">
      <Autocomplete
        options={options}
        value={picked}
        onChange={(_, v) => setPicked(v)}
        inputValue={text}
        onInputChange={(_, v, reason) => { if (reason !== 'reset') setText(v); }}
        getOptionLabel={(o) => [o.person.name, o.person.employeeCode].filter(Boolean).join(' · ')}
        isOptionEqualToValue={(a, b) => a.person.employeeId === b.person.employeeId}
        filterOptions={(x) => x}
        loading={loading}
        renderOption={(props, o) => (
          <li {...props} key={o.person.employeeId}>
            <Box>
              <Typography sx={{ fontSize: 14 }}>{o.person.name}{o.person.employeeCode ? ` · ${o.person.employeeCode}` : ''}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {[o.person.positionTitle, o.person.departmentName].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          </li>
        )}
        renderInput={(params) => <TextField {...params} size="small" label="Person" placeholder="Search by name or code" />}
        sx={{ mb: 2 }}
      />
      <ErrorNotice error={error} />

      {picked && employeeId != null && (
        <Box key={employeeId}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>{personLine(picked.person)}</Typography>
          {balances.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>No leave policy applies to this person yet.</Typography>
          ) : (
            <>
              <Box sx={{ mb: 2 }}><BalanceCards balances={balances} /></Box>
              <AskLeaveForm
                balances={balances}
                preview={(b) => hrLeaveApi.preview({ ...b, employeeId })}
                submit={(b) => hrLeaveApi.submit({ ...b, employeeId })}
                submitLabel="Send for approval"
                onSubmitted={(r) => {
                  onSubmitted(r);
                  close();
                }}
              />
            </>
          )}
        </Box>
      )}
    </SideSheet>
  );
}
