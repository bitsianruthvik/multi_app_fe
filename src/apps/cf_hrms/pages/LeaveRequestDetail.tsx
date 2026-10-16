import { Navigate, useParams } from 'react-router-dom';

/**
 * A leave request's own address. A request is read in a side sheet over the
 * list (CF_HRMS_HIRING_SPEC.md §22.6), so its address opens the list with that
 * sheet open; Back and a bookmark both work.
 */
export default function LeaveRequestDetail() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  return <Navigate to={`/${company}/cf_hrms/leave-requests?open=${encodeURIComponent(id)}`} replace />;
}
