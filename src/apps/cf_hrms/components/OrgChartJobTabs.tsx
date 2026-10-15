/**
 * The job inside the org chart panel, in two tabs (CF_HRMS_HIRING_SPEC.md §16.4):
 *
 *   Job      a filled position opens on the PERSON's job — the position's, with
 *            anything changed for them alone marked "for this person" — edited
 *            for this person (employees edit). One click switches to the
 *            position's own job (position-level edits, `OrgChartJobSection`).
 *            A vacant position has only the position's job.
 *   History  the dated list of changes, for whichever of the two is shown.
 *
 * The chart's "As on" date is passed down: on any other day than today the job
 * is the one that stood then, read-only.
 */
import { useState } from 'react';
import { Box, Button, Tab, Tabs } from '@mui/material';
import { useCan } from '../access/can';
import { OrgChartJobSection } from './OrgChartJobSection';
import { SeatJobContentEditor } from './SeatJobContentEditor';
import { JobHistoryList } from './JobDating';

export function OrgChartJobTabs({
  positionId,
  employeeId = null,
  roleId,
  asOf,
  company,
  onChanged,
  onOpenRole,
}: {
  positionId: number;
  /** The person in it, when their own job is the one to show first. */
  employeeId?: number | null;
  roleId: number | null;
  asOf: string;
  company: string;
  onChanged?: () => void;
  onOpenRole?: (roleId: number, title: string) => void;
}) {
  const can = useCan();
  const [tab, setTab] = useState<'job' | 'history'>('job');
  const personPossible = employeeId != null && can.employees.view;
  const [forWhom, setForWhom] = useState<'person' | 'position'>(personPossible ? 'person' : 'position');
  const person = personPossible && forWhom === 'person';
  const switchStyle = { textTransform: 'none', fontSize: 12.5, mt: 0.75, px: 0.5 } as const;

  return (
    <Box data-jobtabs="">
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ minHeight: 34, mb: 1, '& .MuiTab-root': { minHeight: 34, py: 0.5, textTransform: 'none', fontSize: 13 } }}
      >
        <Tab value="job" label="Job" />
        <Tab value="history" label="History" />
      </Tabs>

      {tab === 'job' && person && employeeId != null && (
        <>
          <SeatJobContentEditor
            key={`person-${employeeId}-${asOf}`}
            embedded
            employeeId={employeeId}
            company={company}
            canManage={can.employees.edit}
            asOf={asOf}
            onOpenRole={onOpenRole}
            onChanged={() => onChanged?.()}
          />
          {can.positions.view && (
            <Button size="small" onClick={() => setForWhom('position')} sx={switchStyle}>
              Show the position’s job instead (changes there reach whoever holds it)
            </Button>
          )}
        </>
      )}
      {tab === 'job' && !person && (
        <>
          <OrgChartJobSection
            target={{ type: 'position', id: positionId }}
            roleId={roleId}
            asOf={asOf}
            company={company}
            onChanged={onChanged}
            onOpenRole={onOpenRole}
          />
          {personPossible && (
            <Button size="small" onClick={() => setForWhom('person')} sx={switchStyle}>
              Show this person’s own job
            </Button>
          )}
        </>
      )}
      {tab === 'history' && (
        <JobHistoryList subject={person && employeeId != null ? { type: 'person', id: employeeId } : { type: 'position', id: positionId }} />
      )}
    </Box>
  );
}

export default OrgChartJobTabs;
