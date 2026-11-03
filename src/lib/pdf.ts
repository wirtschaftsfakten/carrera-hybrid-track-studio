/**
 * Minimal PDF 1.4 writer: one A4 landscape page with a JPEG image and a few
 * lines of Helvetica text. No dependency, enough for a track plan export.
 * Text is encoded as WinAnsi (Latin-1), which covers German umlauts.
 */
export interface PdfInput {
  jpeg: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  title: string;
  lines: string[];
}

const enc = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 256 ? c : 0x3f; // '?' for characters outside Latin-1
  }
  return out;
};

const escapeText = (s: string) =>
  s
    .replace(/[–—]/g, '-')
    .replace(/[„“”]/g, '"')
    .replace(/×/g, 'x')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

export function makePdf(input: PdfInput): Uint8Array {
  const W = 842;
  const H = 595;
  const margin = 36;
  const textWidth = 230;
  const boxW = W - margin * 3 - textWidth;
  const boxH = H - margin * 2;
  const s = Math.min(boxW / input.imageWidth, boxH / input.imageHeight);
  const iw = input.imageWidth * s;
  const ih = input.imageHeight * s;
  const ix = margin;
  const iy = H - margin - ih;

  const text: string[] = ['BT', '/F1 16 Tf', `${W - margin - textWidth} ${H - margin - 16} Td`, `(${escapeText(input.title)}) Tj`, '/F1 9.5 Tf', '13 TL', 'T*'];
  for (const l of input.lines) text.push(`(${escapeText(l)}) '`);
  text.push('ET');
  const content = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im1 Do Q\n${text.join('\n')}\n`;

  const objects: (Uint8Array | string)[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents 6 0 R >>`;
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  const imgHead = `<< /Type /XObject /Subtype /Image /Width ${input.imageWidth} /Height ${input.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${input.jpeg.length} >>\nstream\n`;
  objects[5] = concat([enc(imgHead), input.jpeg, enc('\nendstream')]);
  const contentBytes = enc(content);
  objects[6] = concat([enc(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, enc('endstream')]);

  const parts: Uint8Array[] = [enc('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  const offsets: number[] = [];
  let pos = parts[0].length;
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pos;
    const body = objects[i];
    const chunk = concat([enc(`${i} 0 obj\n`), typeof body === 'string' ? enc(body) : body, enc('\nendobj\n')]);
    parts.push(chunk);
    pos += chunk.length;
  }
  const xref = [`xref\n0 ${objects.length}\n`, '0000000000 65535 f \n'];
  for (let i = 1; i < objects.length; i++) xref.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`);
  parts.push(enc(xref.join('')));
  return concat(parts);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
