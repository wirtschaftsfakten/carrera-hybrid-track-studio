import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { makePdf } from './pdf';

/** Renders an SVG element to a canvas of the given pixel width (dark background). */
async function renderSvg(svg: SVGSVGElement, width: number): Promise<HTMLCanvasElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  const height = Math.round((width * vb.height) / vb.width);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // export the whole track, not the current zoom / pan
  clone.querySelector('[data-zoom]')?.removeAttribute('transform');
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Bild konnte nicht erzeugt werden.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas nicht verfügbar.');
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Export fehlgeschlagen.'))), type, q));

export async function exportPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const canvas = await renderSvg(svg, 2400);
  await saveFile(await toBlob(canvas, 'image/png'), `${filename}.png`);
}

export async function exportPdf(svg: SVGSVGElement, filename: string, title: string, lines: string[]): Promise<void> {
  const canvas = await renderSvg(svg, 2000);
  const jpeg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
  const pdf = makePdf({ jpeg, imageWidth: canvas.width, imageHeight: canvas.height, title, lines });
  await saveFile(new Blob([pdf], { type: 'application/pdf' }), `${filename}.pdf`);
}

export const safeFilename = (name: string) =>
  (name || 'strecke')
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'strecke';

/** Web: download. Native app: write to cache and open the share sheet. */
async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    await Share.share({ title: filename, url: uri });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
