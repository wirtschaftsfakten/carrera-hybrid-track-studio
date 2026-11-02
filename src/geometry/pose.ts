import { HALF_WIDTH, HEADING_UNIT_DEG, PIECES, type PieceId } from './catalog';

/**
 * Screen coordinates: x to the right, y downwards (SVG convention).
 * Heading 0 points along +x, a positive heading unit turns clockwise on
 * screen, i.e. to the right in the direction of travel.
 */
export interface Pose {
  x: number;
  y: number;
  /** Heading in 30° units, not normalised (keeps the total turn). */
  h: number;
}

export type Vec = { x: number; y: number };

const RAD_PER_UNIT = (HEADING_UNIT_DEG * Math.PI) / 180;

export const POSITION_TOLERANCE = 0.5; // mm

export function dirOf(h: number): Vec {
  const a = h * RAD_PER_UNIT;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Unit vector pointing to the right of the direction of travel. */
export function rightOf(h: number): Vec {
  const a = h * RAD_PER_UNIT;
  return { x: -Math.sin(a), y: Math.cos(a) };
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Point on a piece's centre line at fraction t (0..1), shifted sideways by
 * `offset` mm (positive = right of travel direction).
 */
export function pointOnPiece(id: PieceId, start: Pose, t: number, offset = 0): Vec {
  const g = PIECES[id].geometry;
  if (g.kind === 'straight') {
    const d = dirOf(start.h);
    const r = rightOf(start.h);
    return {
      x: start.x + d.x * g.length * t + r.x * offset,
      y: start.y + d.y * g.length * t + r.y * offset,
    };
  }
  const n0 = rightOf(start.h);
  const cx = start.x + g.dir * g.radius * n0.x;
  const cy = start.y + g.dir * g.radius * n0.y;
  const a0 = start.h * RAD_PER_UNIT;
  const a = a0 + g.dir * g.units * RAD_PER_UNIT * t;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  // Centre line point, then sideways offset along the local right normal.
  return {
    x: cx - g.dir * g.radius * nx + offset * nx,
    y: cy - g.dir * g.radius * ny + offset * ny,
  };
}

export function exitPose(id: PieceId, start: Pose): Pose {
  const g = PIECES[id].geometry;
  const p = pointOnPiece(id, start, 1);
  return { x: p.x, y: p.y, h: start.h + (g.kind === 'straight' ? 0 : g.units * g.dir) };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Outline of a piece as polygon (left edge forward, right edge back). */
export function pieceOutline(id: PieceId, start: Pose, steps = 12): Vec[] {
  const g = PIECES[id].geometry;
  const n = g.kind === 'straight' ? 1 : steps;
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    left.push(pointOnPiece(id, start, i / n, -HALF_WIDTH));
    right.push(pointOnPiece(id, start, i / n, HALF_WIDTH));
  }
  return [...left, ...right.reverse()];
}
