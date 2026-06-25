import { Box, Chip, Tooltip, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

export interface ProcessStep {
  id: number;
  sequenceNo: number;
  parallelGroup: string | null;
  processName: string;
  processType: string;
  machineOrWorkcentreType: string;
  estimatedTimeValue: number;
  estimatedTimeUnit: string;
  mandatory: number;
}

interface Props { steps: ProcessStep[] }

function StepChip({ step }: { step: ProcessStep }) {
  return (
    <Tooltip
      title={`${step.processType ?? ''} · ${step.machineOrWorkcentreType ?? ''} · ${step.estimatedTimeValue ?? '?'} ${step.estimatedTimeUnit ?? 'min'}`}
      placement="top"
    >
      <Chip
        label={step.processName}
        size="small"
        variant={step.mandatory ? 'filled' : 'outlined'}
        color="primary"
        sx={{ cursor: 'default' }}
      />
    </Tooltip>
  );
}

export default function ProcessRouteVisualizer({ steps }: Props) {
  if (!steps.length) {
    return <Typography variant="body2" color="text.secondary">No process steps defined.</Typography>;
  }

  // Group by sequence number
  const seqMap = new Map<number, ProcessStep[]>();
  steps.forEach((s) => {
    const arr = seqMap.get(s.sequenceNo) ?? [];
    arr.push(s);
    seqMap.set(s.sequenceNo, arr);
  });
  const sequences = Array.from(seqMap.entries()).sort(([a], [b]) => a - b);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      {sequences.map(([seq, group], idx) => (
        <Box key={seq} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {idx > 0 && <ArrowForwardIcon fontSize="small" sx={{ color: 'text.disabled' }} />}

          {group.length === 1 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.3 }}>
              <StepChip step={group[0]} />
              <Typography variant="caption" color="text.disabled">Seq {seq}</Typography>
            </Box>
          ) : (
            // Parallel group — stack vertically with a bracket indicator
            <Box
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                border: '1px dashed', borderColor: 'primary.light', borderRadius: 1, px: 1, py: 0.5,
              }}
            >
              <Typography variant="caption" color="primary.light" sx={{ fontSize: 9 }}>PARALLEL</Typography>
              {group.map((s) => <StepChip key={s.id} step={s} />)}
              <Typography variant="caption" color="text.disabled">Seq {seq}</Typography>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
