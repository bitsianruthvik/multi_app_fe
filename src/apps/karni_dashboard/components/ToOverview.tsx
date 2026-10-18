import { Navigate, useParams } from 'react-router-dom';

/** The platform's landing URLs for this app open "Needs attention" — what to act on first. */
export function ToOverview() {
  const { company } = useParams();
  return <Navigate to={`/${company}/karni_dashboard/attention`} replace />;
}
