import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDetailTitle } from '@shared/ui';
import type { Hiring } from '../api/hiring';
import { HiringFlow } from '../components/HiringFlow';

/**
 * One hiring, as a page — the shell around `components/HiringFlow.tsx` that the
 * Hiring list and a deep link open. The flow itself (job description, offer,
 * appointment) is that one component; the same one opens as a pop-up over the
 * org chart (`components/HiringDialog.tsx`). Nothing of the flow lives here.
 */
export default function HiringDetail() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState<string | null>(null);
  useDetailTitle(title);

  const onLoaded = useCallback((h: Hiring) => setTitle(h.candidateName?.trim() || `Hiring · ${h.roleTitle}`), []);

  return (
    <HiringFlow
      key={id}
      hiringId={Number(id)}
      company={company}
      shell="page"
      onLoaded={onLoaded}
      onOpenHiring={(next) => navigate(`/${company}/cf_hrms/hiring/${next}`)}
      onPositionRemoved={() => navigate(`/${company}/cf_hrms/positions`)}
    />
  );
}
