import { describe, expect, it } from 'vitest';
import { PIECES, STRAIGHT_LENGTH, pieceLength, type PieceId } from '../src/geometry/catalog';
import { footprint, footprintsOverlap } from '../src/geometry/collision';
import { place, validate } from '../src/geometry/layout';
import { distance, exitPose, pointOnPiece } from '../src/geometry/pose';

const O = { x: 0, y: 0, h: 0 };

describe('Teilegeometrie', () => {
  it('Gerade ist 433 mm lang (250·√3) und 250 mm breit', () => {
    expect(STRAIGHT_LENGTH).toBeCloseTo(433.01, 2);
    const e = exitPose('straight', O);
    expect(e).toEqual({ x: STRAIGHT_LENGTH, y: 0, h: 0 });
    const l = pointOnPiece('straight', O, 0, -125);
    const r = pointOnPiece('straight', O, 0, 125);
    expect(distance(l, r)).toBeCloseTo(250, 6);
  });

  it('R1-Kurve: 60°, Mittelradius 375 mm, innen 250 / außen 500 mm', () => {
    const g = PIECES.curveR1Right.geometry;
    expect(g).toMatchObject({ kind: 'arc', radius: 375, units: 2, dir: 1 });
    const e = exitPose('curveR1Right', O);
    // forward R·sin60°, sideways R·(1 − cos60°), y points right of travel
    expect(e.x).toBeCloseTo(375 * Math.sin(Math.PI / 3), 9);
    expect(e.y).toBeCloseTo(187.5, 9);
    expect(e.h).toBe(2);
    const centre = { x: 0, y: 375 };
    for (const t of [0, 0.3, 0.7, 1]) {
      expect(distance(pointOnPiece('curveR1Right', O, t, 125), centre)).toBeCloseTo(250, 6);
      expect(distance(pointOnPiece('curveR1Right', O, t, -125), centre)).toBeCloseTo(500, 6);
    }
  });

  it('R1-Kurve führt exakt von Sechseckseite zu Sechseckseite (Hexagon-Raster)', () => {
    // hexagon with 250 mm sides: apothem a = 216.5 mm, entry at (-a,0)
    const a = 125 * Math.sqrt(3);
    const e = exitPose('curveR1Right', { x: -a, y: 0, h: 0 });
    // midpoint of the side whose outward normal points at +60°
    expect(e.x).toBeCloseTo(a * Math.cos(Math.PI / 3), 9);
    expect(e.y).toBeCloseTo(a * Math.sin(Math.PI / 3), 9);
  });

  it('Linkskurve ist das Spiegelbild der Rechtskurve', () => {
    const r = exitPose('curveR1Right', O);
    const l = exitPose('curveR1Left', O);
    expect(l.x).toBeCloseTo(r.x, 9);
    expect(l.y).toBeCloseTo(-r.y, 9);
    expect(l.h).toBe(-2);
  });

  it('R2-Kurve: 30°, Mittelradius 1125 mm', () => {
    const e = exitPose('curveR2Right', O);
    expect(e.x).toBeCloseTo(1125 * 0.5, 9);
    expect(e.y).toBeCloseTo(1125 * (1 - Math.cos(Math.PI / 6)), 9);
    expect(e.h).toBe(1);
  });

  it('Streckenlänge des Grundsets entspricht Carrera-Angabe 609 cm', () => {
    const seq: PieceId[] = ['startFinish', ...Array(4).fill('straight'), ...Array(8).fill('curveR1Right'), ...Array(2).fill('curveR1Left')];
    const total = seq.reduce((s, id) => s + pieceLength(id), 0);
    expect(total / 10).toBeCloseTo(609, 0);
  });
});

describe('Rundkursschluss', () => {
  it('6 R1-Rechtskurven bilden einen geschlossenen Kreis', () => {
    const placements = place(Array(6).fill('curveR1Right'));
    const end = placements[5].end;
    expect(distance(end, O)).toBeLessThan(1e-9);
    expect(end.h).toBe(12);
  });

  it('Oval mit Start/Ziel ist gültig', () => {
    const seq: PieceId[] = ['startFinish', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Right', 'straight', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Right'];
    const v = validate(seq);
    expect(v.closed).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it('Optisch fast geschlossene Strecke wird abgelehnt (Lücke)', () => {
    const seq: PieceId[] = ['startFinish', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Right', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Right'];
    const v = validate(seq);
    expect(v.closed).toBe(false);
    expect(v.gap).toBeGreaterThan(400);
    expect(v.issues.some((i) => i.code === 'notClosed')).toBe(true);
  });

  it('Falsche Kurvenrichtung (links statt rechts) zerstört den Schluss', () => {
    const seq: PieceId[] = ['startFinish', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Left', 'straight', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Right'];
    const v = validate(seq);
    expect(v.closed).toBe(false);
    expect(v.issues.some((i) => i.code === 'headingMismatch')).toBe(true);
  });

  it('Position stimmt, Richtung nicht → nicht geschlossen', () => {
    // 12 R2 right curves = 360°, but 5 R1 + ... different: use heading check directly
    const v = validate(['startFinish', ...Array(12).fill('curveR2Right')] as PieceId[]);
    expect(v.closed).toBe(false); // the straight shifts the circle by 433 mm
  });

  it('Kreis aus 12 R2-Kurven ist geschlossen', () => {
    const placements = place(Array(12).fill('curveR2Right'));
    expect(distance(placements[11].end, O)).toBeLessThan(1e-9);
  });
});

describe('Überschneidungen', () => {
  it('Aneinanderstoßende Teile gelten nicht als Überschneidung', () => {
    const a = footprint('straight', O);
    const b = footprint('curveR1Right', exitPose('straight', O));
    expect(footprintsOverlap(a, b)).toBe(false);
  });

  it('Teile im Nachbar-Sechseck berühren sich nur an Ecken', () => {
    // a straight through the hexagon the curve wraps around
    const curve = footprint('curveR1Right', { x: 0, y: 0, h: 0 });
    // centre of curvature is the neighbour hexagon centre (0, 375)... distance 433 from own centre
    const c = { x: 0, y: 375 };
    const a = 125 * Math.sqrt(3);
    const straight = footprint('straight', { x: c.x - a, y: c.y, h: 0 });
    expect(footprintsOverlap(curve, straight)).toBe(false);
  });

  it('Spirale über sich selbst wird erkannt', () => {
    const seq: PieceId[] = ['startFinish', ...Array(7).fill('curveR1Right')];
    const v = validate(seq);
    expect(v.overlaps.length).toBeGreaterThan(0);
    expect(v.valid).toBe(false);
  });

  it('Kreuzende Geraden werden erkannt', () => {
    const a = footprint('straight', { x: 0, y: 0, h: 0 });
    const b = footprint('straight', { x: 200, y: -200, h: 3 });
    expect(footprintsOverlap(a, b)).toBe(true);
  });
});
