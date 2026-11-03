import { describe, expect, it } from 'vitest';
import { canConnect, PIECE_ORDER, PIECES, pieceLength, type Inventory } from '../src/geometry/catalog';
import { countPieces, validate } from '../src/geometry/layout';
import { shapeKey } from '../src/generator/canonical';
import {
  AUTO_MAX_PIECES,
  precheck,
  resolveRange,
  search,
  suggestAlternatives,
  usableCount,
  type SearchOptions,
} from '../src/generator/search';

const inv = (p: Partial<Inventory>): Inventory => ({
  startFinish: 0, straight: 0, curveR1Right: 0, curveR1Left: 0, curveR2Right: 0, curveR2Left: 0, ...p,
});

/** A tester's box with 60 pieces. */
const INV60 = inv({ startFinish: 1, straight: 20, curveR1Right: 18, curveR1Left: 10, curveR2Right: 6, curveR2Left: 5 });

const opts = (p: Partial<SearchOptions> = {}): SearchOptions => ({
  inventory: INV60,
  mode: 'auto',
  minPieces: 15,
  maxPieces: 30,
  style: 'varied',
  maxResults: 8,
  timeLimitMs: 6000,
  seed: 11,
  ...p,
});

function expectValid(seq: Parameters<typeof validate>[0], inventory: Inventory) {
  const v = validate(seq, inventory);
  expect(v.issues).toEqual([]);
  expect(v.closed).toBe(true);
  expect(v.gap).toBeLessThan(0.5);
  expect(Math.abs(v.totalTurnDeg)).toBe(360);
  const c = countPieces(seq);
  for (const id of PIECE_ORDER) expect(c[id]).toBeLessThanOrEqual(inventory[id]);
  expect(c.startFinish).toBe(1);
}

describe('Inventar mit 60 Teilen', () => {
  it('Inventar zählt 60 nutzbare Teile', () => {
    expect(usableCount(INV60)).toBe(60);
  });

  it('Automatisch: verbaut nicht alle 60 Teile, sondern wählt selbst', () => {
    const res = search(opts());
    expect(res.layouts.length).toBeGreaterThan(2);
    for (const l of res.layouts) {
      expect(l.sequence.length).toBeLessThan(60);
      expect(l.sequence.length).toBeLessThanOrEqual(AUTO_MAX_PIECES);
      expectValid(l.sequence, INV60);
    }
    // the inventory is a limit: pieces stay unused
    const used = countPieces(res.layouts[0].sequence);
    expect(PIECE_ORDER.some((id) => used[id] < INV60[id])).toBe(true);
  }, 20000);

  it('Benutzerdefiniert 15–30: jede Strecke hat 15 bis 30 Teile', () => {
    const res = search(opts({ mode: 'custom' }));
    expect(res.range).toEqual({ min: 15, max: 30 });
    expect(res.layouts.length).toBeGreaterThan(2);
    for (const l of res.layouts) {
      expect(l.sequence.length).toBeGreaterThanOrEqual(15);
      expect(l.sequence.length).toBeLessThanOrEqual(30);
      expectValid(l.sequence, INV60);
    }
  }, 20000);

  it('Maximale Ausnutzung: deutlich mehr Teile als Automatisch, trotzdem gültig', () => {
    const auto = search(opts());
    const max = search(opts({ mode: 'max', timeLimitMs: 8000 }));
    expect(max.layouts.length).toBeGreaterThan(0);
    const autoBest = Math.max(...auto.layouts.map((l) => l.sequence.length));
    expect(max.layouts[0].sequence.length).toBeGreaterThan(autoBest);
    expect(max.layouts[0].sequence.length).toBeGreaterThanOrEqual(40);
    for (const l of max.layouts) expectValid(l.sequence, INV60);
    // sorted: most pieces first
    const lens = max.layouts.map((l) => l.sequence.length);
    expect([...lens].sort((a, b) => b - a)).toEqual(lens);
  }, 30000);

  it('liefert unterschiedliche Layouts (keine gedrehten/gespiegelten Kopien)', () => {
    const res = search(opts({ maxResults: 12 }));
    const keys = res.layouts.map((l) => shapeKey(l.sequence));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(6);
  }, 20000);
});

describe('Minimum / Maximum', () => {
  it('Min > Bestand wird auf den Bestand begrenzt', () => {
    expect(resolveRange({ inventory: inv({ startFinish: 1, straight: 2, curveR1Right: 6 }), mode: 'custom', minPieces: 40, maxPieces: 50 })).toEqual({
      min: 9,
      max: 9,
    });
  });

  it('Min > Max wird korrigiert', () => {
    expect(resolveRange({ inventory: INV60, mode: 'custom', minPieces: 30, maxPieces: 20 })).toEqual({ min: 20, max: 20 });
  });

  it('exakte Teileanzahl (min = max)', () => {
    const res = search(opts({ mode: 'custom', minPieces: 20, maxPieces: 20, maxResults: 5 }));
    expect(res.layouts.length).toBeGreaterThan(0);
    for (const l of res.layouts) expect(l.sequence.length).toBe(20);
  }, 20000);

  it('Längenfilter wird eingehalten', () => {
    const res = search(opts({ minLength: 6000, maxLength: 9000 }));
    expect(res.layouts.length).toBeGreaterThan(0);
    for (const l of res.layouts) {
      expect(l.length).toBeGreaterThanOrEqual(5999.5);
      expect(l.length).toBeLessThanOrEqual(9000.5);
    }
  }, 20000);
});

describe('Bestandsgrenzen je Teiltyp', () => {
  it('knappe R2- und Linkskurven werden nie überschritten', () => {
    const inventory = inv({ startFinish: 1, straight: 12, curveR1Right: 12, curveR1Left: 1, curveR2Right: 2, curveR2Left: 1 });
    for (const mode of ['auto', 'custom', 'max'] as const) {
      const res = search(opts({ inventory, mode, minPieces: 8, maxPieces: 25, timeLimitMs: 3000 }));
      expect(res.layouts.length).toBeGreaterThan(0);
      for (const l of res.layouts) expectValid(l.sequence, inventory);
    }
  }, 30000);
});

describe('Streckenlänge und Anschlüsse', () => {
  it('Länge = Summe der Teillängen', () => {
    const res = search(opts({ maxResults: 4 }));
    for (const l of res.layouts) {
      const sum = l.sequence.reduce((s, id) => s + pieceLength(id), 0);
      expect(l.length).toBeCloseTo(sum, 6);
      expect(validate(l.sequence).length).toBeCloseTo(sum, 6);
    }
  }, 20000);

  it('alle verwendeten Teile sind verifiziert und passen aneinander', () => {
    const res = search(opts({ maxResults: 4 }));
    for (const l of res.layouts) {
      l.sequence.forEach((id, i) => {
        expect(PIECES[id].verified).toBe(true);
        expect(canConnect(id, l.sequence[(i + 1) % l.sequence.length])).toBe(true);
      });
    }
  }, 20000);

  it('Streckenstile: "schnell" hat mehr Geraden als "kurvenreich"', () => {
    const ratio = (style: 'fast' | 'twisty') => {
      const res = search(opts({ style, maxResults: 6, seed: 5 }));
      return res.layouts.reduce((s, l) => s + l.metrics.straights / l.metrics.pieces, 0) / res.layouts.length;
    };
    expect(ratio('fast')).toBeGreaterThan(ratio('twisty'));
  }, 30000);
});

describe('Unmögliche Kombinationen', () => {
  it('nur Linkskurven unter 360°', () => {
    const o = opts({ inventory: inv({ startFinish: 1, straight: 10, curveR1Left: 4 }) });
    expect(precheck(o)).toMatch(/240° links/);
    const res = search(o);
    expect(res.layouts).toEqual([]);
    expect(suggestAlternatives(o, res).join(' ')).toMatch(/Kurven ergänzen/);
  });

  it('Höchstanzahl zu klein für 360°', () => {
    const o = opts({ mode: 'custom', minPieces: 3, maxPieces: 5 });
    expect(precheck(o)).toMatch(/höchstens 5 Teilen/);
    expect(search(o).layouts).toEqual([]);
  });

  it('Fläche zu klein: ehrliche Meldung mit Vorschlägen, keine Strecke', () => {
    const o = opts({ room: { width: 600, height: 600 }, timeLimitMs: 3000 });
    const res = search(o);
    expect(res.layouts).toEqual([]);
    expect(suggestAlternatives(o, res).some((t) => /Fläche/.test(t))).toBe(true);
  }, 20000);
});

describe('Performance bei großen Inventaren', () => {
  it('100+ Teile: Ergebnis innerhalb des Zeitlimits', () => {
    const big = inv({ startFinish: 1, straight: 40, curveR1Right: 30, curveR1Left: 20, curveR2Right: 8, curveR2Left: 8 });
    expect(usableCount(big)).toBe(107);
    const t0 = Date.now();
    const res = search(opts({ inventory: big, timeLimitMs: 5000 }));
    expect(Date.now() - t0).toBeLessThan(7000);
    expect(res.layouts.length).toBeGreaterThan(0);
    for (const l of res.layouts) expectValid(l.sequence, big);
  }, 20000);
});
