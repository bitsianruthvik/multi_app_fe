import { Box, Button, Popover, Tooltip, Typography } from '@mui/material';
import type { CodeSegment } from '../../lib/codeSegments';
import { drawingFileName } from '../../lib/drawingFileName';
import type { LinkState } from '../../lib/links';
import { useToast } from '../toastContext';
import { CodeText } from './CodeText';

/** One row of a group, as the popover lists it. */
export interface LinkMember {
  recordId: number;
  label: string;
  /** Where it sits: "in Girder G2 › Segment S1". */
  where: string;
  code: string;
  segments?: CodeSegment[] | null;
  /** How many pieces the row stands for. */
  pieces: number;
  /** The row the popover was opened from. */
  self?: boolean;
}

/**
 * The rows that are the same design as one row: where each sits, its code, its pieces, a way to go
 * to it. A linked row can be taken out of the group ("Unlink", or "Unlink and keep apart" so it is
 * never offered again); an identical-but-unlinked one offers "Link these rows". Link and unlink
 * happen at once, so they wait while there are unsaved changes.
 */
export function LinkMembersPopover({ anchor, onClose, state, name, members, dirty, busy, canEdit, onGoTo, onUnlink, onLink }: {
  anchor: HTMLElement | null;
  onClose: () => void;
  state: LinkState;
  name: string;
  /** Every row of the group, the row itself included (flagged `self`). */
  members: LinkMember[];
  /** There are unsaved changes: link and unlink wait for Save. */
  dirty: boolean;
  busy: boolean;
  canEdit: boolean;
  onGoTo: (recordId: number) => void;
  onUnlink: (keepApart: boolean) => void;
  onLink: () => void;
}) {
  const toast = useToast();
  const linked = state.kind === 'linked';
  const suggest = state.kind === 'suggest';
  const others = linked ? state.others : suggest ? state.others.length : 0;
  const why = !canEdit ? 'This structure cannot be changed right now.' : dirty ? 'Save or cancel your changes first.' : null;
  const fileName = drawingFileName(members.map((m) => ({ code: m.code, segments: m.segments })));
  const copyName = async () => {
    if (!fileName) return;
    try { await navigator.clipboard.writeText(fileName); toast.success(`Copied ${fileName}`); } catch { toast.info(fileName); }
  };
  return (
    <Popover open={!!anchor} anchorEl={anchor} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
      <Box data-testid="link-popover" sx={{ p: 2, width: 460, maxWidth: 'calc(100vw - 32px)', display: 'grid', gap: 1.25 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
          {linked ? `${name} is the same design as ${others} other ${others === 1 ? 'row' : 'rows'}`
            : suggest ? `${name} is identical to ${others} other ${others === 1 ? 'row' : 'rows'}`
              : state.kind === 'apart' ? `${name} is kept apart` : 'No other row is identical to this one'}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {linked ? 'A drawing given to one of them is given to all. Each piece keeps its own code.'
            : suggest ? 'They are not linked yet. Linking them gives them one drawing and lets one change reach all.'
              : state.kind === 'apart' ? 'You said to keep this row apart, so it is never offered for linking.' : 'When two rows become identical, they are offered here.'}
        </Typography>
        {members.length > 0 && (
          <Box component="ul" data-testid="link-members" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5, maxHeight: 280, overflow: 'auto' }}>
            {members.map((m) => (
              <Box component="li" key={m.recordId} data-testid="link-member" data-record={m.recordId}
                sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 0.75, borderRadius: 'var(--r-sm)', background: m.self ? 'var(--c-surface-2)' : undefined }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{m.label}{m.self && <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · this row</Box>}</Typography>
                  {m.where && <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', overflowWrap: 'anywhere' }}>{m.where}</Typography>}
                  <Box data-testid="link-member-code" sx={{ fontSize: 11, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}><CodeText code={m.code} itemCode={null} segments={m.segments} /></Box>
                </Box>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', pt: 0.25 }}>{m.pieces} {m.pieces === 1 ? 'piece' : 'pieces'}</Typography>
                {!m.self && <Button size="small" data-testid="link-goto" sx={{ minWidth: 0, py: 0 }} onClick={() => { onGoTo(m.recordId); onClose(); }}>Go to</Button>}
              </Box>
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {(linked || suggest) && fileName && (
            <Tooltip title={`Name a DXF or PDF ${fileName} and it goes to all of them.`}>
              <Button size="small" variant="outlined" data-testid="link-copy-name" onClick={() => void copyName()}>Copy drawing file name</Button>
            </Tooltip>
          )}
          <Box sx={{ flex: 1 }} />
          {linked && canEdit && (
            <>
              <Tooltip title={why ?? 'Take this row out of the group. It keeps its values.'}><span>
                <Button size="small" data-testid="link-unlink" disabled={!!why || busy} onClick={() => onUnlink(false)}>Unlink</Button>
              </span></Tooltip>
              <Tooltip title={why ?? 'Take this row out and never offer to link it again.'}><span>
                <Button size="small" data-testid="link-apart" disabled={!!why || busy} onClick={() => onUnlink(true)}>Keep it apart</Button>
              </span></Tooltip>
            </>
          )}
          {suggest && canEdit && (
            <Tooltip title={why ?? ''}><span>
              <Button size="small" variant="contained" data-testid="link-link" disabled={!!why || busy} onClick={onLink}>Link these rows</Button>
            </span></Tooltip>
          )}
        </Box>
      </Box>
    </Popover>
  );
}
