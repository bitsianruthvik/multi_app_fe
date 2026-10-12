import { Box, Button, Dialog, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { DesignUses } from '../../api/links';
import { DialogCloseButton } from '../FormDialog';
import { CodeText } from '../Bom/CodeText';
import { piecesWords } from '../../lib/links';
import { Mono } from '../ui';

/**
 * "Used by N pieces": the rows that are made to this design, with their codes, and — once the line is
 * locked and the pieces have real codes — the codes themselves. Each piece keeps its own code; the
 * design (and its drawing) is shared.
 */
export function DesignUsesDialog({ uses, onClose }: { uses: DesignUses; onClose: () => void }) {
  const shown = uses.pieces.slice(0, 300);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid="design-uses">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>Used by {piecesWords(uses.total)}</Box>
        <DialogCloseButton onClose={onClose} />
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1.5, alignContent: 'start' }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          {uses.frozen ? 'These pieces are made to this drawing. Each keeps its own code.' : 'These rows are made to this drawing. Their pieces get codes when the design is frozen.'}
        </Typography>
        <Box component="ul" data-testid="design-uses-rows" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
          {uses.rows.map((r) => (
            <Box component="li" key={r.recordId} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 13 }}>{r.label}</Typography>
              {r.code && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}><CodeText code={r.code} itemCode={null} segments={r.segments} /></Box>}
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{piecesWords(Array.isArray(r.pieces) ? r.pieces.length : r.pieces)}</Typography>
            </Box>
          ))}
        </Box>
        {uses.frozen && shown.length > 0 && (
          <Box data-testid="design-uses-pieces" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {shown.map((p) => <Mono key={`${p.recordId}:${p.code}`}>{p.code}</Mono>)}
            {uses.pieces.length > shown.length && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>and {uses.pieces.length - shown.length} more</Typography>}
          </Box>
        )}
      </DialogContent>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2, pt: 0 }}><Button onClick={onClose}>Close</Button></Box>
    </Dialog>
  );
}
