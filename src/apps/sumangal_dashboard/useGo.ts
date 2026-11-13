import { useLocation, useNavigate, useParams } from 'react-router-dom';

/** Goes to another screen of the dashboard. `keep` carries the period and filters chosen on this screen along. */
export function useGo(keep = false) {
  const navigate = useNavigate(); const { company } = useParams(); const { search } = useLocation();
  return (path: string) => navigate(`/${company}/sumangal_dashboard/${path}${keep ? search : ''}`);
}
