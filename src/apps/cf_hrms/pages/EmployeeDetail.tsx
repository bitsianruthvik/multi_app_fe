import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, IconButton, Tooltip, Typography, Stack } from '@mui/material';
import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import BusinessCenterRounded from '@mui/icons-material/BusinessCenterRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import {
  DetailLayout, DetailHeader, CrossLink, FactItem, StatusBadge, ToneBadge, Mono,
  DetailSkeleton, ErrorNotice, SectionCard, useDetailTitle, useToast,
  type DetailTab,
} from '@shared/ui';
import {
  peopleApi, readFileAsBase64,
  EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_STATUS_TONE, EMPLOYMENT_TYPE_LABEL,
  type EmployeeDetail as EmployeeDetailData, type PeoplePickers,
} from '../api/people';
import { useCan } from '../access/can';
import { EmployeeFormDialog } from '../components/EmployeeFormDialog';
import { LeavingBand } from '../components/Leaving';
import { HiringEntry } from '../components/HiringEntry';
import { EmployeeOverviewTab } from '../components/EmployeeOverviewTab';
import { EmployeePositionsTab } from '../components/EmployeePositionsTab';
import { EmployeeIdentifiersTab } from '../components/EmployeeIdentifiersTab';
import { EmployeeDocumentsTab } from '../components/EmployeeDocumentsTab';
import { EmployeeHistoryTab } from '../components/EmployeeHistoryTab';
import { EmployeePerformanceTab } from '../components/EmployeePerformanceTab';
import { SeatJobContentEditor } from '../components/SeatJobContentEditor';
import { AsOnBar, JobHistoryList } from '../components/JobDating';
import { todayIso } from '../components/jobDates';
import { useUnitKinds } from '../components/orgUnits';

/**
 * One person (DESIGN_SYSTEM.md §4.3 Record).
 *
 * The header says who they are and on what terms; the cross-link strip is how
 * you leave sideways (principle #4) — to their jobs, their department, their
 * contractor — rather than going back to the list and searching again.
 *
 * WHAT IS NOT HERE, DELIBERATELY: a manager. An employee has no `manager_id` in
 * this model and never will. Reporting belongs to a work assignment, because a
 * person doing three jobs usually answers to three different people, and one
 * "the manager" field would have to pick one of them and be wrong twice.
 */

type TabKey = 'overview' | 'work' | 'job' | 'performance' | 'identifiers' | 'documents' | 'history';
const TAB_KEYS: TabKey[] = ['overview', 'work', 'job', 'performance', 'identifiers', 'documents', 'history'];

export default function EmployeeDetail() {
  const withKind = useUnitKinds();
  const { company, id } = useParams<{ company: string; id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const can = useCan();
  const toast = useToast();
  const canEdit = can.employees.edit;
  const employeeId = Number(id);

  const [data, setData] = useState<EmployeeDetailData | null>(null);
  const [pickers, setPickers] = useState<PeoplePickers | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Spec §16.4: their job as on any day (read-only off today).
  const [jobOn, setJobOn] = useState(todayIso());
  const photoInput = useRef<HTMLInputElement>(null);

  // Tab lives in the URL so a link to somebody's documents is a link that works.
  const tabParam = searchParams.get('tab') as TabKey | null;
  // Performance is a tab only for a login that may see plans (spec §18.3).
  const tab: TabKey = tabParam && TAB_KEYS.includes(tabParam) && (tabParam !== 'performance' || can.performance.view) ? tabParam : 'overview';
  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', v);
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      setError(new Error('That is not an employee id.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [detail, picks] = await Promise.all([peopleApi.get(employeeId), peopleApi.pickers()]);
      setData(detail);
      setPickers(picks);
      if (detail.employee.hasPhoto) {
        // Fetched separately: a photo has no business being in the JSON of
        // every employee read, and most people have none.
        const photo = await peopleApi.photo(employeeId);
        if (photo.hasPhoto && photo.dataBase64) {
          setPhotoUrl(`data:${photo.mimeType};base64,${photo.dataBase64}`);
        }
      } else {
        setPhotoUrl(null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useDetailTitle(data?.employee.fullName);

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const read = await readFileAsBase64(file);
      await peopleApi.setPhoto(employeeId, read);
      toast.success('Photo updated.');
      await load();
    } catch (err) {
      setError(err);
    }
  };

  if (loading) return <DetailSkeleton />;
  if (error && !data) {
    return (
      <>
        <Button startIcon={<ArrowBackRounded />} size="small" onClick={() => navigate(`/${company}/cf_hrms/employees`)}>
          Back to employees
        </Button>
        <Box sx={{ mt: 2 }}>
          <ErrorNotice error={error} onRetry={() => void load()} />
        </Box>
      </>
    );
  }
  if (!data) return null;

  const { employee, counts, assignments } = data;
  const initials = employee.fullName.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  const photo = (
    <Box sx={{ position: 'relative', flexShrink: 0 }}>
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
          background: photoUrl ? 'var(--c-surface-2)' : 'var(--c-primary-50)',
          border: '1px solid var(--c-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {photoUrl
          ? <Box component="img" src={photoUrl} alt={`Photo of ${employee.fullName}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (
            <Typography sx={{ fontSize: 22, fontWeight: 600, color: 'var(--c-primary-600)' }} aria-hidden>
              {initials}
            </Typography>
          )}
      </Box>
      {canEdit && (
        <>
          <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void uploadPhoto(e.target.files?.[0])} />
          <Tooltip title={photoUrl ? 'Replace photo' : 'Add a photo'}>
            <IconButton
              size="small"
              aria-label={photoUrl ? `Replace the photo of ${employee.fullName}` : `Add a photo of ${employee.fullName}`}
              onClick={() => photoInput.current?.click()}
              sx={{
                position: 'absolute',
                right: -6,
                bottom: -6,
                background: 'var(--c-surface)',
                border: '1px solid var(--c-border)',
                '&:hover': { background: 'var(--c-surface-2)' },
              }}
            >
              <PhotoCameraRounded sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Box>
  );

  const tabs: DetailTab[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'work', label: 'Positions held', count: counts.activeAssignments },
    { value: 'job', label: 'Job' },
    ...(can.performance.view ? [{ value: 'performance', label: 'Performance' }] : []),
    { value: 'identifiers', label: 'Identifiers', count: counts.identifiers },
    { value: 'documents', label: 'Documents', count: counts.documents },
    { value: 'history', label: 'History', count: counts.events },
  ];

  const primary = assignments.find((a) => a.isActive && a.isPrimary) ?? assignments.find((a) => a.isActive);
  const positionWords = primary
    ? [primary.positionTitle ?? primary.roleTitle, primary.positionCode].filter(Boolean).join(' · ') || null
    : null;
  // The position somebody who has left was last in — where "Hire for the position they left" starts.
  const leftPosition = employee.employmentStatus === 'EXITED'
    ? [...assignments]
        .filter((a) => a.positionId != null)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (b.effectiveTo ?? '').localeCompare(a.effectiveTo ?? ''))[0] ?? null
    : null;

  return (
    <>
      <ErrorNotice error={error} />

      <DetailLayout
        header={(
          <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
            {photo}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <DetailHeader
                code={employee.employeeCode}
                title={employee.fullName}
                badges={(
                  <>
                    <StatusBadge
                      status={employee.employmentStatus}
                      map={EMPLOYMENT_STATUS_TONE}
                      labelMap={EMPLOYMENT_STATUS_LABEL}
                    />
                    <ToneBadge
                      tone={employee.employmentType === 'CONTRACT' ? 'info' : 'neutral'}
                      label={EMPLOYMENT_TYPE_LABEL[employee.employmentType] ?? employee.employmentType}
                      noIcon
                    />
                  </>
                )}
                subtitle={
                  counts.activeAssignments === 0
                    ? 'Not in a position'
                    : counts.activeAssignments === 1
                      ? primary?.roleTitle ?? 'In 1 position'
                      : `Holds ${counts.activeAssignments} positions — ${assignments.filter((a) => a.isActive).map((a) => a.roleTitle).filter(Boolean).join(' · ')}`
                }
                // Someone who has left is read-only apart from their documents.
                actions={(canEdit || can.named.employeeClose) && employee.employmentStatus !== 'EXITED' && (
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {canEdit && (
                      <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditOpen(true)}>
                        Edit
                      </Button>
                    )}
                    {employee.employmentStatus === 'ACTIVE' && (
                      <LeavingBand
                        person={employee}
                        status={employee.employmentStatus}
                        exit={employee.exit}
                        positionWords={positionWords}
                        onChanged={() => void load()}
                      />
                    )}
                  </Stack>
                )}
                facts={(
                  <>
                    <FactItem label="Joined">
                      <Mono sx={{ fontSize: 14 }}>{employee.dateOfJoining}</Mono>
                    </FactItem>
                    {employee.employmentStatus === 'EXITED' && (
                      <FactItem label="Exited">
                        <Mono sx={{ fontSize: 14 }}>{employee.exitDate ?? '—'}</Mono>
                      </FactItem>
                    )}
                    <FactItem label="Org unit" value={withKind(primary?.departmentName, primary?.departmentId) || '—'} />
                    <FactItem label="Location" value={primary?.locationName ?? '—'} />
                    {employee.employmentType === 'CONTRACT' && (
                      <FactItem label="Contractor" value={employee.contractorName ?? '—'} />
                    )}
                  </>
                )}
              />
            </Box>
          </Box>
        )}
        crossLinks={(
          <>
            {/* Principle #4: always render these. A record with no way sideways
                sends people back to a list to search again. */}

            {primary?.departmentName && can.org.view && (
              <CrossLink icon={<ApartmentRounded />} label={withKind(primary.departmentName, primary.departmentId)} to={`/${company}/cf_hrms/org-units`} />
            )}
            {employee.contractorName && (
              <CrossLink icon={<BusinessCenterRounded />} label={employee.contractorName} to={`/${company}/cf_hrms/contractors`} />
            )}
          </>
        )}
        beforeTabs={employee.employmentStatus !== 'ACTIVE' && (
          <LeavingBand
            person={employee}
            status={employee.employmentStatus}
            exit={employee.exit}
            exitDate={employee.exitDate}
            positionWords={positionWords}
            showStart={false}
            onChanged={() => void load()}
            afterLeft={leftPosition && (
              <HiringEntry
                positionId={leftPosition.positionId!}
                positionCode={leftPosition.positionCode}
                roleTitle={leftPosition.roleTitle}
                label="Hire for the position they left"
                onChanged={() => void load()}
              />
            )}
          />
        )}
        tabs={tabs}
        active={tab}
        onTab={setTab}
      >
        {tab === 'overview' && <EmployeeOverviewTab employee={employee} />}

        {tab === 'work' && (
          <EmployeePositionsTab
            employeeId={employee.id}
            employeeName={employee.fullName}
            employmentStatus={employee.employmentStatus}
            companySlug={company ?? ''}
            onChanged={() => void load()}
          />
        )}

        {tab === 'job' && (
          <Stack spacing={2}>
            <Box>
              <AsOnBar on={jobOn} onChange={setJobOn} />
              <SeatJobContentEditor key={jobOn} employeeId={employee.id} company={company ?? ''} canManage={canEdit} asOf={jobOn} />
            </Box>
            <SectionCard title="History of this job" subtitle="Their own changes, the positions they held, and what the role and the position changed while they held it.">
              <JobHistoryList subject={{ type: 'person', id: employee.id }} />
            </SectionCard>
          </Stack>
        )}

        {tab === 'performance' && can.performance.view && (
          <EmployeePerformanceTab employeeId={employee.id} company={company ?? ''} canEdit={can.performance.edit} />
        )}

        {tab === 'identifiers' && (
          <EmployeeIdentifiersTab employeeId={employee.id} canEdit={canEdit} pickers={pickers} />
        )}

        {tab === 'documents' && (
          <EmployeeDocumentsTab employeeId={employee.id} canEdit={canEdit} pickers={pickers} />
        )}

        {tab === 'history' && (
          <EmployeeHistoryTab
            employeeId={employee.id}
            employeeName={employee.fullName}
            canEdit={canEdit}
            pickers={pickers}
          />
        )}
      </DetailLayout>

      {canEdit && (
        <EmployeeFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          employee={employee}
          pickers={pickers}
          onSaved={(detail) => {
            setData(detail);
            toast.success('Saved.');
          }}
        />
      )}
    </>
  );
}
