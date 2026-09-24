import type { ChartScene, Prim } from './orgChartLayout';

/**
 * PNG and PDF from the chart the screen is showing. The client prints these,
 * so "close enough" is not a standard they can use.
 *
 * TWO DELIBERATE DIFFERENCES FROM THE SOURCE FILE, both forced:
 *
 * 1. **The raster is drawn from the same draw list, not from an SVG data URL.**
 *    `Org_Chart_V12.html` serialises its SVG and loads it into an `Image`. An
 *    SVG loaded that way is an isolated document with no access to the page's
 *    stylesheets or webfonts, so Geist never loads: the geometry would come
 *    from Geist metrics and the glyphs from whatever the OS substitutes, and
 *    every measured line would be a few percent off inside a 214px box. Drawing
 *    the same primitives to a canvas uses the document's own fonts and is
 *    pixel-exact against what is on screen.
 * 2. **The PDF is written here rather than by jsPDF.** Adding a dependency was
 *    out of scope for this screen, and the document needed is one page holding
 *    one JPEG — about sixty lines of PDF, with no library able to do it more
 *    correctly.
 *
 * The scale rule is the source file's: `max(1, min(2.5, 12000/w, 12000/h))`,
 * with an extra clamp because a canvas wider than ~16384px silently produces a
 * blank image in every browser, and a blank print is worse than a small one.
 */

const MAX_CANVAS_PX = 16000;
const MAX_CANVAS_AREA = 2.4e8;

export function exportScale(w: number, h: number): number {
  let scale = Math.max(1, Math.min(2.5, 12000 / w, 12000 / h));
  const cap = Math.min(MAX_CANVAS_PX / w, MAX_CANVAS_PX / h, Math.sqrt(MAX_CANVAS_AREA / (w * h)));
  if (cap < scale) scale = Math.max(0.2, cap);
  return scale;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawPrim(ctx: CanvasRenderingContext2D, prim: Prim, family: string) {
  switch (prim.k) {
    case 'rect': {
      if (prim.r) roundRectPath(ctx, prim.x, prim.y, prim.w, prim.h, prim.r);
      else {
        ctx.beginPath();
        ctx.rect(prim.x, prim.y, prim.w, prim.h);
      }
      if (prim.fill && prim.fill !== 'none') {
        ctx.fillStyle = prim.fill;
        ctx.fill();
      }
      if (prim.stroke) {
        ctx.strokeStyle = prim.stroke;
        ctx.lineWidth = prim.sw ?? 1;
        ctx.setLineDash(prim.dash ?? []);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      break;
    }
    case 'circle': {
      ctx.beginPath();
      ctx.arc(prim.cx, prim.cy, prim.r, 0, Math.PI * 2);
      if (prim.fill && prim.fill !== 'none') {
        ctx.fillStyle = prim.fill;
        ctx.fill();
      }
      if (prim.stroke) {
        ctx.strokeStyle = prim.stroke;
        ctx.lineWidth = prim.sw ?? 1;
        ctx.stroke();
      }
      break;
    }
    case 'path': {
      const path = new Path2D(prim.d);
      if (prim.fill && prim.fill !== 'none') {
        ctx.fillStyle = prim.fill;
        ctx.fill(path);
      }
      ctx.strokeStyle = prim.stroke;
      ctx.lineWidth = prim.sw ?? 1;
      ctx.setLineDash(prim.dash ?? []);
      ctx.stroke(path);
      ctx.setLineDash([]);
      break;
    }
    case 'text': {
      ctx.font = `${prim.italic ? 'italic ' : ''}${prim.weight} ${prim.size}px ${family}`;
      ctx.fillStyle = prim.fill;
      ctx.textAlign = prim.anchor === 'middle' ? 'center' : prim.anchor === 'end' ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(prim.text, prim.x, prim.y);
      break;
    }
  }
}

/** Paints the scene at `scale`, on an opaque background so a PNG can be printed. */
export function renderSceneToCanvas(
  scene: ChartScene,
  family: string,
  scale = exportScale(scene.width, scene.height),
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.width * scale);
  canvas.height = Math.round(scene.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give the chart a drawing surface.');
  ctx.scale(scale, scale);
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.lineJoin = 'round';

  scene.header.forEach((p) => drawPrim(ctx, p, family));
  scene.edges.forEach((p) => drawPrim(ctx, p, family));
  scene.secondary.forEach((p) => drawPrim(ctx, p, family));
  for (const box of scene.boxes) {
    box.prims.forEach((p) => drawPrim(ctx, p, family));
    box.toggle?.prims.forEach((p) => drawPrim(ctx, p, family));
  }
  return canvas;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function exportPng(scene: ChartScene, family: string, name = 'Org_chart') {
  const canvas = renderSceneToCanvas(scene, family);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The image could not be created. Try starting from a smaller branch.');
  download(blob, `${name}_${stamp()}.png`);
}

// ── A one-page PDF holding one JPEG ─────────────────────────────────────────

const A3_SHORT = 842;
const A3_LONG = 1191;

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Builds a minimal PDF 1.4 with the chart as a DCTDecode (JPEG) image, fitted to
 * A3 with a 24pt margin — the same page, orientation and margin the source tool
 * produced, so a reprint lines up with the ones already on the wall.
 */
export function buildPdf(jpeg: Uint8Array, pxW: number, pxH: number, title: string): Blob {
  const landscape = pxW >= pxH;
  const pageW = landscape ? A3_LONG : A3_SHORT;
  const pageH = landscape ? A3_SHORT : A3_LONG;
  const margin = 24;
  const k = Math.min((pageW - 2 * margin) / pxW, (pageH - 2 * margin) / pxH);
  const drawW = pxW * k;
  const drawH = pxH * k;
  const tx = (pageW - drawW) / 2;
  const ty = pageH - margin - drawH;

  const content = `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)} cm /Im0 Do Q\n`;
  const safeTitle = title.replace(/[\\()]/g, '').slice(0, 120);

  const objects: (string | Uint8Array)[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        '/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
    ],
    [`<< /Length ${content.length} >>\nstream\n`, latin1(content), '\nendstream'],
    [
      `<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      jpeg,
      '\nendstream',
    ],
    [`<< /Title (${safeTitle}) /Producer (CF_HRMS org chart) >>`],
  ];

  const parts: Uint8Array[] = [];
  let offset = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? latin1(chunk) : chunk;
    parts.push(bytes);
    offset += bytes.length;
  };

  push('%PDF-1.4\n%âãÏÓ\n');
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    push(`${i + 1} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  });

  const xrefAt = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  push(xref);

  return new Blob([concat(parts) as unknown as BlobPart], { type: 'application/pdf' });
}

export async function exportPdf(scene: ChartScene, family: string, title: string, name = 'Org_chart') {
  const canvas = renderSceneToCanvas(scene, family);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('The image could not be created. Try starting from a smaller branch.');
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  download(buildPdf(jpeg, canvas.width, canvas.height, title), `${name}_${stamp()}.pdf`);
}
