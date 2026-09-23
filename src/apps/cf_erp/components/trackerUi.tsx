import type { ReactNode } from 'react';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import PlayCircleRounded from '@mui/icons-material/PlayCircleRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import PauseCircleRounded from '@mui/icons-material/PauseCircleRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import type { PieceStatus, StepStatus } from '../api/types';
import { PIECE_STATUS_LABEL, STEP_STATUS_LABEL } from '../lib/tracker';
import { Badge, type Family } from './ui';

/**
 * Step and piece status badges (icon + label + colour, §5.1). Ready is the one
 * that pulls the eye — green, "go"; done steps step back to neutral, since
 * nothing more is asked of them; waiting is normal, so it stays grey too.
 */
const STEP: Record<StepStatus, { family: Family; icon: ReactNode }> = {
  not_ready: { family: 'neutral', icon: <HourglassEmptyRounded /> },
  ready: { family: 'success', icon: <PlayCircleRounded /> },
  in_progress: { family: 'info', icon: <SyncRounded /> },
  on_hold: { family: 'warning', icon: <PauseCircleRounded /> },
  done: { family: 'neutral', icon: <CheckCircleRounded /> },
};

export function StepStatusBadge({ status, title }: { status: StepStatus; title?: string }) {
  return <Badge family={STEP[status].family} icon={STEP[status].icon} label={STEP_STATUS_LABEL[status]} title={title} />;
}

const PIECE: Record<PieceStatus, StepStatus> = { not_ready: 'not_ready', ready: 'ready', in_progress: 'in_progress', on_hold: 'on_hold', complete: 'done' };

export function PieceStatusBadge({ status }: { status: PieceStatus }) {
  const s = STEP[PIECE[status]];
  return <Badge family={status === 'complete' ? 'success' : s.family} icon={s.icon} label={PIECE_STATUS_LABEL[status]} />;
}
