import { Box, Typography } from '@mui/material';
import { SectionCard, FactItem, StatusBadge, ToneBadge } from '@shared/ui';
import {
  EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_STATUS_TONE, EMPLOYMENT_TYPE_LABEL,
  type Employee,
} from '../api/people';

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 2.5 };

function lines(...parts: (string | null | undefined)[]) {
  const kept = parts.map((p) => (p ?? '').trim()).filter(Boolean);
  return kept.length ? kept.join(', ') : null;
}

/** Overview — who this person is, and on what terms they are here. */
export function EmployeeOverviewTab({ employee }: { employee: Employee }) {
  const address = employee.addressJson;
  const emergency = employee.emergencyContactJson;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard title="Identity">
        <Box sx={grid}>
          <FactItem label="Full name" value={employee.fullName} />
          <FactItem label="Employee code" value={employee.employeeCode} />
          <FactItem label="Date of birth" value={employee.dateOfBirth ?? '—'} />
          <FactItem label="Gender" value={employee.gender ?? '—'} />
        </Box>
      </SectionCard>

      <SectionCard title="Contact">
        <Box sx={grid}>
          <FactItem label="Phone" value={employee.phone ?? '—'} />
          <FactItem label="Email" value={employee.email ?? '—'} />
          <FactItem label="Address">
            {address
              ? (
                <Typography sx={{ fontSize: 14, color: 'var(--c-text)' }}>
                  {[lines(address.line1), lines(address.line2), lines(address.city, address.state, address.postalCode), address.country]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              )
              : <Typography sx={{ fontSize: 14, color: 'var(--c-text-3)' }}>—</Typography>}
          </FactItem>
        </Box>
      </SectionCard>

      <SectionCard
        title="Emergency contact"
        subtitle="Who to call, and on which number, when something happens on shift"
      >
        {emergency ? (
          <Box sx={grid}>
            <FactItem label="Name" value={emergency.name ?? '—'} />
            <FactItem label="Relationship" value={emergency.relationship ?? '—'} />
            <FactItem label="Phone" value={emergency.phone ?? '—'} />
            {emergency.altPhone && <FactItem label="Alternate phone" value={emergency.altPhone} />}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>
            No emergency contact recorded.
          </Typography>
        )}
      </SectionCard>

      <SectionCard title="Employment">
        <Box sx={grid}>
          <FactItem label="Status">
            <StatusBadge
              status={employee.employmentStatus}
              map={EMPLOYMENT_STATUS_TONE}
              labelMap={EMPLOYMENT_STATUS_LABEL}
            />
          </FactItem>
          <FactItem
            label="Employment type"
            value={EMPLOYMENT_TYPE_LABEL[employee.employmentType] ?? employee.employmentType}
          />
          <FactItem label="Date of joining" value={employee.dateOfJoining} />
          {/* Only where it means something. An exit date on an active person is a data error. */}
          {employee.employmentStatus === 'EXITED' && (
            <FactItem label="Exit date" value={employee.exitDate ?? '—'} />
          )}
          {employee.employmentType === 'CONTRACT' && (
            <FactItem label="Contractor" value={employee.contractorName ?? '—'} />
          )}
          <FactItem label="Platform login">
            {/*
              Most of a workforce never logs in. A missing login is the normal
              case and is said plainly, not styled as something to go and fix.
            */}
            {employee.userEmail
              ? <ToneBadge tone="info" label={employee.userEmail} noIcon />
              : (
                <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>
                  No login — not needed for most people
                </Typography>
              )}
          </FactItem>
        </Box>
      </SectionCard>
    </Box>
  );
}
