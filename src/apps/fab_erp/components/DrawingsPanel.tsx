/**
 * DrawingsPanel — the drawings for a thing, including the ones it inherits.
 *
 * One component for both places it is needed, because they are the same list
 * asked from two directions:
 *
 *   itemId   in the structure tree, where drawings are attached
 *   taskId   at the machine, where they are read
 *
 * INHERITED DRAWINGS ARE THE POINT. Cutting a web plate, an operator wants the
 * plate's drawing AND the segment's AND the girder's — the assembly context is
 * what says which way round it goes. They are shown in one list, nearest level
 * first, each labelled with the level it came from, so it is obvious which
 * drawing is about the part in your hand and which is about the thing it goes
 * into. Without that, somebody has to attach the general arrangement to two
 * hundred parts and re-attach it at every revision.
 *
 * Opens in a new tab rather than an embedded viewer: the browser's PDF reader
 * already does zoom, rotate, search and print, and a drawing is a thing people
 * want full-screen and often on a second monitor.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, Tooltip, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';

import {
  getItemDrawings, getTaskDrawings, uploadDrawing, deleteDrawing,
  drawingFileUrl, fmtSize, type Drawing,
} from '../api/drawings';
import { backendMessage, useToast, Mono } from '../components';

export default function DrawingsPanel({
  itemId, taskId, canManage = false, dense = false, emptyHint,
}: {
  /** Attach-and-read mode. */
  itemId?: number;
  /** Read-only mode, from the shop floor. */
  taskId?: number;
  canManage?: boolean;
  dense?: boolean;
  emptyHint?: string;
}) {
  const { toast } = useToast();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = itemId != null
        ? await getItemDrawings(itemId)
        : await getTaskDrawings(taskId!);
      setDrawings(res.drawings ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Could not load the drawings.'));
    } finally { setLoading(false); }
  }, [itemId, taskId]);

  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    if (itemId == null) return;
    setBusy(true); setError('');
    try {
      const res = await uploadDrawing(itemId, file);
      toast(
        `${res.fileName} attached (${fmtSize(res.sizeBytes)} → ${fmtSize(res.storedBytes)} stored)`,
        'success',
      );
      await load();
    } catch (e) {
      // The size ceiling comes back as a sentence with both numbers in it, so
      // showing the backend's message verbatim is more use than a generic one.
      setError(backendMessage(e, 'Could not attach that drawing.'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(d: Drawing) {
    setBusy(true); setError('');
    try {
      await deleteDrawing(d.id);
      await load();
    } catch (e) {
      setError(backendMessage(e, 'Could not remove that drawing.'));
    } finally { setBusy(false); }
  }

  if (loading) return <Box sx={{ py: 1 }}><CircularProgress size={16} /></Box>;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>{error}</Alert>}

      {drawings.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: canManage ? 1 : 0 }}>
          {emptyHint ?? 'No drawings yet — nothing on this item or anything above it.'}
        </Typography>
      ) : (
        <Box sx={{ mb: canManage ? 1 : 0 }}>
          {drawings.map((d) => (
            <Box
              key={d.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                py: dense ? 0.4 : 0.75, borderBottom: '1px solid var(--c-divider)',
                // Inherited drawings are dimmed, not hidden: they are context,
                // and the part's own drawing should read as the primary one.
                opacity: d.inherited ? 0.78 : 1,
              }}
            >
              <DescriptionRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.fileName}
                  {d.revision && (
                    <Typography component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)', ml: 0.75 }}>
                      rev {d.revision}
                    </Typography>
                  )}
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                  {d.inherited ? `from ${d.levelKind ?? 'above'} ` : 'this item · '}
                  {d.inherited && <Mono sx={{ fontSize: 11 }}>{d.itemCode?.split('-').pop()}</Mono>}
                  {' · '}{fmtSize(d.sizeBytes)}
                </Typography>
              </Box>
              {d.inherited && (
                <Chip size="small" label={d.levelKind ?? 'above'} sx={{ height: 18, fontSize: 10 }} />
              )}
              <Tooltip title="Open in a new tab">
                <IconButton size="small" onClick={() => window.open(drawingFileUrl(d.id), '_blank', 'noopener')}>
                  <OpenInNewRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              {/* Only ITS OWN drawings can be removed here. An inherited one
                  belongs to the girder, and deleting it from a part's panel
                  would silently strip it from every other part too. */}
              {canManage && !d.inherited && (
                <Tooltip title="Remove">
                  <span>
                    <IconButton size="small" color="error" disabled={busy} onClick={() => remove(d)}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
          ))}
        </Box>
      )}

      {canManage && itemId != null && (
        <>
          <Button
            size="small"
            startIcon={busy ? <CircularProgress size={13} /> : <UploadFileIcon />}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'Attaching…' : 'Attach drawing (PDF)'}
          </Button>
          <input
            ref={fileRef} type="file" hidden accept="application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
        </>
      )}
    </Box>
  );
}
