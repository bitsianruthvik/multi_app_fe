import { Navigate, useParams } from 'react-router-dom';

/** The platform's landing URLs for this app all open the Overview. */
export function ToOverview() {
  const { company } = useParams();
  return <Navigate to={`/${company}/karni_dashboard/overview`} replace />;
}
