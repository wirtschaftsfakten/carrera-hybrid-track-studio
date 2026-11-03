import { describe, expect, it } from 'vitest';
import { makePdf } from '../src/lib/pdf';

describe('PDF-Export', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = makePdf({ jpeg, imageWidth: 400, imageHeight: 300, title: 'Rundkurs (Test)', lines: ['Länge: 6,09 m', 'Größe 251 × 175 cm'] });
  const text = Buffer.from(pdf).toString('latin1');

  it('ist ein PDF mit Seite, Bild und Text', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/DCTDecode');
    expect(text).toContain('(Rundkurs \\(Test\\)) Tj');
    expect(text).toContain('(Länge: 6,09 m)'); // Latin-1 umlaut
    expect(text).toContain('251 x 175 cm');
  });

  it('Querverweistabelle zeigt auf die richtigen Objekte', () => {
    const start = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const offsets = [...text.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
});
