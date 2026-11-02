import { HALF_WIDTH, PIECES, type PieceId } from './catalog';
import { pointOnPiece, type Pose, type Vec } from './pose';

/**
 * Overlap detection between track pieces.
 *
 * Every piece footprint (full 250 mm track width) is split into convex
 * quadrilaterals: one for a straight, one per ≤10° slice for a curve.
 * Two pieces overlap when any pair of their quads overlaps by more than
 * OVERLAP_TOLERANCE (separating axis theorem, penetration depth).
 *
 * The tolerance absorbs the chord approximation of the arcs (max. 1 mm
 * sagitta at the 250 mm inner radius) and pieces that only touch along an
 * edge or a corner, which is normal on the hexagon grid.
 */
export const OVERLAP_TOLERANCE = 3; // mm
const MAX_SLICE_DEG = 10;

export interface Footprint {
  quads: Vec[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function footprint(id: PieceId, start: Pose): Footprint {
  const g = PIECES[id].geometry;
  const slices = g.kind === 'straight' ? 1 : Math.ceil((g.units * 30) / MAX_SLICE_DEG);
  const quads: Vec[][] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let prevL = pointOnPiece(id, start, 0, -HALF_WIDTH);
  let prevR = pointOnPiece(id, start, 0, HALF_WIDTH);
  for (let i = 1; i <= slices; i++) {
    const t = i / slices;
    const l = pointOnPiece(id, start, t, -HALF_WIDTH);
    const r = pointOnPiece(id, start, t, HALF_WIDTH);
    const quad = [prevL, l, r, prevR];
    quads.push(quad);
    for (const p of quad) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    prevL = l;
    prevR = r;
  }
  return { quads, minX, minY, maxX, maxY };
}

function project(poly: Vec[], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = p.x * ax + p.y * ay;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Penetration depth of two convex polygons (<= 0 means separated). */
export function penetration(a: Vec[], b: Vec[]): number {
  let best = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      let ax = -(q.y - p.y);
      let ay = q.x - p.x;
      const len = Math.hypot(ax, ay);
      if (len < 1e-9) continue;
      ax /= len;
      ay /= len;
      const [amin, amax] = project(a, ax, ay);
      const [bmin, bmax] = project(b, ax, ay);
      const overlap = Math.min(amax, bmax) - Math.max(amin, bmin);
      if (overlap <= 0) return overlap;
      if (overlap < best) best = overlap;
    }
  }
  return best;
}

export function footprintsOverlap(a: Footprint, b: Footprint, tol = OVERLAP_TOLERANCE): boolean {
  if (a.maxX - tol < b.minX || b.maxX - tol < a.minX || a.maxY - tol < b.minY || b.maxY - tol < a.minY) {
    return false;
  }
  for (const qa of a.quads) {
    for (const qb of b.quads) {
      if (penetration(qa, qb) > tol) return true;
    }
  }
  return false;
}
