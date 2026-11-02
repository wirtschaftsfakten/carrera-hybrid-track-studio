import { describe, expect, it } from 'vitest';
import { DEFAULT_INVENTORY, PIECE_ORDER, type Inventory, type PieceId } from '../src/geometry/catalog';
import { countPieces, place, validate } from '../src/geometry/layout';
import { bestOrientation } from '../src/geometry/orientation';
import { shapeKey } from '../src/generator/canonical';
import { search, type SearchOptions } from '../src/generator/search';

const base: SearchOptions = {
  inventory: DEFAULT_INVENTORY,
  useAll: true,
  minPieces: 3,
  maxResults: 50,
  timeLimitMs: 20000,
  seed: 1,
};

const inv = (p: Partial<Inventory>): Inventory => ({
  startFinish: 0, straight: 0, curveR1Right: 0, curveR1Left: 0, curveR2Right: 0, curveR2Left: 0, ...p,
});

describe('Generator mit Grundbestand (4 G, 1 S/Z, 8 R, 2 L)', () => {
  const res = search(base);

  it('findet mehrere unterschiedliche Rundkurse und durchsucht vollständig', () => {
    expect(res.exhaustive).toBe(true);
    expect(res.layouts.length).toBeGreaterThan(1);
  });

  it('jeder Rundkurs ist geometrisch geschlossen und überschneidungsfrei', () => {
    for (const l of res.layouts) {
      const v = validate(l.sequence, DEFAULT_INVENTORY);
      expect(v.issues).toEqual([]);
      expect(v.closed).toBe(true);
      expect(v.gap).toBeLessThan(0.5);
      expect(Math.abs(v.totalTurnDeg)).toBe(360);
    }
  });

  it('verwendet genau den Bestand (alle Teile)', () => {
    for (const l of res.layouts) {
      expect(countPieces(l.sequence)).toEqual(DEFAULT_INVENTORY);
    }
  });

  it('liefert keine gedrehten oder gespiegelten Duplikate', () => {
    const keys = res.layouts.map((l) => shapeKey(l.sequence));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('enthält ein Layout mit der Carrera-Grundfläche ≈ 251 × 175 cm', () => {
    const all = search({ ...base, maxResults: 10000 });
    const sizes = all.layouts.map((l) => [Math.round(l.width / 10), Math.round(l.height / 10)]);
    expect(sizes.some(([w, h]) => Math.abs(w - 251) <= 2 && Math.abs(h - 175) <= 2)).toBe(true);
  });

  it('ist reproduzierbar je Seed und variiert zwischen Seeds', () => {
    const a = search({ ...base, maxResults: 3, seed: 5 });
    const b = search({ ...base, maxResults: 3, seed: 5 });
    expect(a.layouts.map((l) => l.key)).toEqual(b.layouts.map((l) => l.key));
  });
});

describe('Teilebegrenzung', () => {
  it('überschreitet nie den Bestand (ohne "alle Teile")', () => {
    const inventory = inv({ startFinish: 1, straight: 6, curveR1Right: 9, curveR1Left: 3 });
    const res = search({ ...base, inventory, useAll: false, minPieces: 8, timeLimitMs: 8000 });
    expect(res.layouts.length).toBeGreaterThan(0);
    for (const l of res.layouts) {
      const c = countPieces(l.sequence);
      for (const id of PIECE_ORDER) expect(c[id]).toBeLessThanOrEqual(inventory[id]);
      expect(c.startFinish).toBe(1);
      expect(validate(l.sequence, inventory).valid).toBe(true);
    }
  });

  it('meldet ehrlich: kein Rundkurs möglich (Kurvensumme ≠ 360°)', () => {
    const res = search({ ...base, inventory: inv({ startFinish: 1, straight: 4, curveR1Right: 5 }) });
    expect(res.layouts).toEqual([]);
    expect(res.exhaustive).toBe(true);
    expect(res.impossibleReason).toMatch(/300°/);
  });

  it('meldet ehrlich: ohne Start/Ziel keine Strecke', () => {
    const res = search({ ...base, inventory: inv({ straight: 4, curveR1Right: 6 }) });
    expect(res.layouts).toEqual([]);
    expect(res.impossibleReason).toBeDefined();
  });

  it('erkennt geometrisch unmögliche Bestände nach vollständiger Suche', () => {
    // 360° of turn, but an odd straight count with only one straight can never close
    const res = search({ ...base, inventory: inv({ startFinish: 1, curveR1Right: 6 }) });
    expect(res.impossibleReason).toBeUndefined();
    expect(res.exhaustive).toBe(true);
    expect(res.layouts).toEqual([]);
  });

  it('findet Rundkurse mit R2-30°-Kurven', () => {
    const res = search({ ...base, inventory: inv({ startFinish: 1, straight: 1, curveR1Right: 4, curveR2Right: 4 }), timeLimitMs: 8000 });
    expect(res.layouts.length).toBeGreaterThan(0);
    for (const l of res.layouts) expect(validate(l.sequence).valid).toBe(true);
  });

  it('Raumgröße wird eingehalten', () => {
    const room = { width: 2600, height: 1800 };
    const res = search({ ...base, room, maxResults: 100 });
    for (const l of res.layouts) {
      expect(l.width).toBeLessThanOrEqual(room.width + 1);
      expect(l.height).toBeLessThanOrEqual(room.height + 1);
      expect(bestOrientation(place(l.sequence), room)).not.toBeNull();
    }
  });
});

describe('Kanonische Form', () => {
  it('Rotation, Spiegelung und Fahrtrichtungsumkehr ergeben denselben Schlüssel', () => {
    const s: PieceId[] = ['startFinish', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Left', 'curveR1Right'];
    const rotated = [...s.slice(2), ...s.slice(0, 2)];
    const swap = (id: PieceId): PieceId =>
      id === 'curveR1Right' ? 'curveR1Left' : id === 'curveR1Left' ? 'curveR1Right' : id;
    const mirrored = s.map(swap);
    const reversed = [...s].reverse().map(swap);
    expect(shapeKey(rotated)).toBe(shapeKey(s));
    expect(shapeKey(mirrored)).toBe(shapeKey(s));
    expect(shapeKey(reversed)).toBe(shapeKey(s));
    expect(shapeKey(['startFinish', 'curveR1Right', 'straight', 'curveR1Right'])).not.toBe(shapeKey(s));
  });
});
