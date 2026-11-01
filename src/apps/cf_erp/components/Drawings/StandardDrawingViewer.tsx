import { useCallback, useMemo, useState } from 'react';
import { getLineModel3d } from '../../api/drawings';
import { standardFileBlob, type StandardDetail, type StandardFile } from '../../api/standards';
import { levelView } from '../../lib/drawingLevels';
import { rowOfFile, rowsOfFile, standardLevels } from '../../lib/standardLevels';
import { DrawingViewer, type ViewerDrawing } from './DrawingViewer';

/**
 * A STANDARD DRAWING'S FILES IN THE SAME TOOL AS AN ORDER'S (user, 2026-11-01: "in the drawings tab I don't see 3D and
 * all the other things we built in the SO drawings tool"). The standard's version tree becomes the viewer's levels
 * (lib/standardLevels.ts) — breadcrumb, "Parts in this assembly", "Drawing of …" — so stepping between its part files
 * needs no round trip; each file is fetched from the standard (GET /standard-drawings/files/:id).
 *
 * 3D: the model is kept with the standard, but the server only hands it out through an order line made from the
 * standard (GET /orders/:o/lines/:l/model3d — it reads the line's standard's model, and the codes of that line). So it
 * is read through the newest such line; a standard used on no line has no 3D model here yet, only its plate parts in
 * 3D (read from their own DXFs).
 */

async function saveFile(f: StandardFile) {
  const blob = await standardFileBlob(f.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = f.fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StandardDrawingViewer({ standard, file, onClose }: { standard: StandardDetail; file: StandardFile; onClose: () => void }) {
  const levels = useMemo(() => standardLevels(standard), [standard]);
  const [at, setAt] = useState<number | null>(() => rowOfFile(levels, file.id));
  const view = useMemo(() => (at != null ? levelView(levels.tree, at) : null), [levels, at]);
  // The file on screen: the shown row's (its own, else its nearest ancestor's), or the one asked for when no row uses it.
  const shownFile = (view?.shown ? levels.fileOf.get(view.shown.rowId) : null) ?? file;
  const drawing = useMemo((): ViewerDrawing => ({
    id: shownFile.id, mark: view?.shown?.mark ?? shownFile.mark ?? shownFile.fileName, fileName: shownFile.fileName, fileKind: shownFile.fileKind,
    drawing: shownFile.kind === 'source' && standard.drawing ? { id: standard.drawing.id, code: standard.drawing.code, number: standard.drawing.number, revision: standard.drawing.revision, status: standard.drawing.status as 'issued', title: standard.drawing.title, earlier: [] } : null,
    rows: rowsOfFile(levels, shownFile.id),
  }), [shownFile, view, levels, standard.drawing]);
  const viewerLevels = useMemo(() => (view ? { view, onGo: setAt } : undefined), [view]);
  const line = standard.lines[0] ?? null;
  const loadModel = useCallback(async () => (line ? getLineModel3d(line.orderId, line.id) : null), [line]);
  return (
    <DrawingViewer orderId={0} lineId={0} drawing={drawing} levels={viewerLevels} onClose={onClose}
      fetchFile={() => standardFileBlob(shownFile.id)} downloadFile={() => saveFile(shownFile)}
      loadModel={loadModel} modelKey={`standard:${standard.id}:${line?.id ?? 0}`}
      readFacts={{ lengthMm: shownFile.lengthMm, widthMm: shownFile.widthMm, areaMm2: shownFile.areaMm2, holes: shownFile.holes }} />
  );
}

export default StandardDrawingViewer;
